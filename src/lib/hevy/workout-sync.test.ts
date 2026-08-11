import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTempDatabase } from "@/test/database";
import type { HevyClient } from "./client";
import type { HevyWorkout, HevyWorkoutEvent } from "./types";

// The db client resolves DATABASE_URL at import time, so the throwaway database
// has to be claimed before any module that imports it is loaded — hence the
// top-level call here and the dynamic imports below.
const database = createTempDatabase("hevy_workout_sync");
let sync: typeof import("./workout-sync");

beforeAll(async () => {
  await database.migrate();
  sync = await import("./workout-sync");
});

afterAll(() => database.cleanup());

function workout(overrides: Partial<HevyWorkout> = {}): HevyWorkout {
  return {
    id: "w1",
    title: "Push Day",
    routine_id: "r1",
    description: null,
    start_time: "2026-08-01T09:00:00Z",
    end_time: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:05:00Z",
    created_at: "2026-08-01T09:00:00Z",
    exercises: [
      {
        index: 0,
        title: "Bench Press (Barbell)",
        notes: null,
        exercise_template_id: "bench",
        supersets_id: null,
        sets: [
          {
            index: 0,
            type: "normal",
            weight_kg: 100,
            reps: 5,
            distance_meters: null,
            duration_seconds: null,
            rpe: 8,
            custom_metric: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

/** Stub client serving fixed pages of workouts, counting the pages requested. */
function stubWorkouts(pages: HevyWorkout[][]) {
  const calls: number[] = [];
  const client = {
    getWorkouts: async (page: number) => {
      calls.push(page);
      return { page, page_count: pages.length, workouts: pages[page - 1] ?? [] };
    },
  } as unknown as HevyClient;
  return { client, calls };
}

/** Stub client serving one page of delta events, recording the `since` used. */
function stubEvents(events: HevyWorkoutEvent[]) {
  const since: string[] = [];
  const client = {
    getWorkoutEvents: async (page: number, cursor: string) => {
      since.push(cursor);
      return { page, page_count: 1, events };
    },
  } as unknown as HevyClient;
  return { client, since };
}

async function cachedSets() {
  const { db } = await import("@/lib/db/client");
  const { workoutSets } = await import("@/lib/db/schema");
  return db.select().from(workoutSets);
}

describe("syncWorkoutHistory", () => {
  beforeEach(async () => {
    const { db } = await import("@/lib/db/client");
    const { settings, workouts, workoutSets } = await import("@/lib/db/schema");
    await db.delete(workoutSets);
    await db.delete(workouts);
    await db.delete(settings);
  });

  it("backfills every page on the first sync and records a cursor", async () => {
    const { client, calls } = stubWorkouts([
      [workout({ id: "a" }), workout({ id: "b" })],
      [workout({ id: "c", updated_at: "2026-08-03T00:00:00Z" })],
    ]);

    const result = await sync.syncWorkoutHistory(client);

    expect(result).toMatchObject({ mode: "backfill", written: 3, deleted: 0 });
    expect(calls).toEqual([1, 2]);
    // The cursor is the newest updated_at seen, not the local clock.
    expect(result.cursor).toBe("2026-08-03T00:00:00Z");
    expect(await sync.getHistoryStatus()).toMatchObject({ workouts: 3, sets: 3, everSynced: true });
  });

  it("switches to the delta feed once a cursor exists", async () => {
    await sync.syncWorkoutHistory(stubWorkouts([[workout({ id: "a" })]]).client);

    const { client, since } = stubEvents([
      {
        type: "updated",
        workout: workout({ id: "b", updated_at: "2026-08-05T00:00:00Z" }),
      },
    ]);
    const result = await sync.syncWorkoutHistory(client);

    expect(since).toEqual(["2026-08-01T10:05:00Z"]);
    expect(result).toMatchObject({ mode: "delta", written: 1, deleted: 0 });
    // The delta patches the cache rather than replacing it.
    expect(await sync.getHistoryStatus()).toMatchObject({ workouts: 2 });
  });

  // A set removed inside the Hevy app produces no event of its own, so an
  // update has to replace the workout's sets wholesale. Anything less leaves a
  // set that no longer exists — and a phantom set is a phantom personal record.
  it("replaces an updated workout's sets instead of merging them", async () => {
    const heavy = workout({ id: "a" });
    heavy.exercises[0]!.sets.push({
      index: 1,
      type: "normal",
      weight_kg: 140,
      reps: 1,
      distance_meters: null,
      duration_seconds: null,
      rpe: 10,
      custom_metric: null,
    });
    await sync.syncWorkoutHistory(stubWorkouts([[heavy]]).client);
    expect(await cachedSets()).toHaveLength(2);

    // The 140 kg single is corrected away in Hevy; it must vanish here too.
    const corrected = workout({ id: "a", updated_at: "2026-08-02T00:00:00Z" });
    await sync.syncWorkoutHistory(stubEvents([{ type: "updated", workout: corrected }]).client);

    const sets = await cachedSets();
    expect(sets).toHaveLength(1);
    expect(sets[0]!.weightKg).toBe(100);
  });

  it("removes a deleted workout and its sets", async () => {
    await sync.syncWorkoutHistory(stubWorkouts([[workout({ id: "a" }), workout({ id: "b" })]]).client);

    const result = await sync.syncWorkoutHistory(
      stubEvents([{ type: "deleted", id: "a", deleted_at: "2026-08-04T00:00:00Z" }]).client,
    );

    expect(result).toMatchObject({ mode: "delta", written: 0, deleted: 1 });
    expect(await sync.getHistoryStatus()).toMatchObject({ workouts: 1, sets: 1 });
    expect((await cachedSets()).every((s) => s.workoutId === "b")).toBe(true);
  });

  // Events arrive newest first, so the first one seen for a workout is its final
  // state. A workout edited and then deleted must end up deleted, not restored.
  it("keeps only the newest event per workout", async () => {
    await sync.syncWorkoutHistory(stubWorkouts([[workout({ id: "a" })]]).client);

    await sync.syncWorkoutHistory(
      stubEvents([
        { type: "deleted", id: "a", deleted_at: "2026-08-06T00:00:00Z" },
        { type: "updated", workout: workout({ id: "a", updated_at: "2026-08-05T00:00:00Z" }) },
      ]).client,
    );

    expect(await sync.getHistoryStatus()).toMatchObject({ workouts: 0, sets: 0 });
  });

  // `since` may be inclusive or exclusive — the spec does not say. Applying the
  // same event twice has to be a no-op, or an overlap would duplicate sets.
  it("is idempotent when the feed re-serves an event", async () => {
    await sync.syncWorkoutHistory(stubWorkouts([[workout({ id: "a" })]]).client);
    const repeat: HevyWorkoutEvent[] = [{ type: "updated", workout: workout({ id: "a" }) }];

    await sync.syncWorkoutHistory(stubEvents(repeat).client);
    await sync.syncWorkoutHistory(stubEvents(repeat).client);

    expect(await sync.getHistoryStatus()).toMatchObject({ workouts: 1, sets: 1 });
  });

  it("tolerates a workout served twice by a shifting walk", async () => {
    const { client } = stubWorkouts([[workout({ id: "dupe" })], [workout({ id: "dupe" })]]);
    await expect(sync.syncWorkoutHistory(client)).resolves.toMatchObject({ written: 1 });
  });

  it("re-walks everything when a full sync is forced", async () => {
    await sync.syncWorkoutHistory(stubWorkouts([[workout({ id: "a" })]]).client);

    const result = await sync.syncWorkoutHistory(
      stubWorkouts([[workout({ id: "b" }), workout({ id: "c" })]]).client,
      true,
    );

    expect(result.mode).toBe("backfill");
    expect(await sync.getHistoryStatus()).toMatchObject({ workouts: 2 });
  });

  it("refuses to wipe a populated cache when the API returns nothing", async () => {
    await sync.syncWorkoutHistory(stubWorkouts([[workout({ id: "a" })]]).client);

    await expect(sync.syncWorkoutHistory(stubWorkouts([[]]).client, true)).rejects.toThrow(
      /left unchanged/i,
    );
    expect(await sync.getHistoryStatus()).toMatchObject({ workouts: 1 });
  });

  it("accepts an empty history on a first sync", async () => {
    await expect(sync.syncWorkoutHistory(stubWorkouts([[]]).client)).resolves.toMatchObject({
      written: 0,
    });
    expect(await sync.getHistoryStatus()).toMatchObject({ workouts: 0, everSynced: true });
  });

  it("aborts rather than writing a truncated walk", async () => {
    await sync.syncWorkoutHistory(stubWorkouts([[workout({ id: "a" })]]).client);

    const runaway = {
      getWorkouts: async (page: number) => ({
        page,
        page_count: 5000,
        workouts: [workout({ id: `p${page}` })],
      }),
    } as unknown as HevyClient;

    await expect(sync.syncWorkoutHistory(runaway, true)).rejects.toThrow(/aborted/i);
    expect(await sync.getHistoryStatus()).toMatchObject({ workouts: 1 });
  });

  // The catalog's lesson: the pinned spec has already been wrong about a field
  // name once, and the failure has to name the field rather than die inside the
  // insert. The check runs before the transaction, so the cache survives.
  it("names the missing field instead of dying inside the insert", async () => {
    await sync.syncWorkoutHistory(stubWorkouts([[workout({ id: "keep" })]]).client);

    const broken = workout({ id: "broken", title: "Mystery Session" });
    delete (broken as unknown as Record<string, unknown>).start_time;

    await expect(sync.syncWorkoutHistory(stubWorkouts([[broken]]).client, true)).rejects.toThrow(
      /no "start_time".*Mystery Session/,
    );
    expect(await sync.getHistoryStatus()).toMatchObject({ workouts: 1 });
  });

  it("refuses a logged exercise with no template id", async () => {
    const broken = workout({ id: "broken" });
    delete (broken.exercises[0] as unknown as Record<string, unknown>).exercise_template_id;

    await expect(sync.syncWorkoutHistory(stubWorkouts([[broken]]).client)).rejects.toThrow(
      /no "exercise_template_id"/,
    );
  });

  // updated_at is the cursor field and therefore the likeliest thing a future
  // API revision renames. Falling back to start_time costs an early cursor,
  // which the feed re-serves harmlessly; refusing would break sync entirely.
  it("falls back to start_time when updated_at is absent", async () => {
    const noStamp = workout({ id: "a" });
    delete (noStamp as unknown as Record<string, unknown>).updated_at;

    const result = await sync.syncWorkoutHistory(stubWorkouts([[noStamp]]).client);
    expect(result.cursor).toBe("2026-08-01T09:00:00Z");
  });
});
