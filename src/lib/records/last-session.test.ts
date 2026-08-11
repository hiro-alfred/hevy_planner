import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTempDatabase } from "@/test/database";

// The db client resolves DATABASE_URL at import time, so the throwaway database
// has to be claimed before any module that imports it is loaded.
const database = createTempDatabase("hevy_last_session");
let lastSession: typeof import("./last-session");

beforeAll(async () => {
  await database.migrate();
  lastSession = await import("./last-session");
});

afterAll(() => database.cleanup());

interface SeedSet {
  templateId?: string;
  weightKg?: number | null;
  reps?: number | null;
  type?: string;
}

async function seed(
  workoutId: string,
  startTime: string,
  sets: SeedSet[],
  routineId: string | null = null,
): Promise<void> {
  const { db } = await import("@/lib/db/client");
  const { workouts, workoutSets } = await import("@/lib/db/schema");

  await db.insert(workouts).values({
    id: workoutId,
    title: `Session ${workoutId}`,
    routineId,
    startTime,
    endTime: null,
    hevyUpdatedAt: startTime,
    fetchedAt: "2026-08-11T00:00:00Z",
  });

  await db.insert(workoutSets).values(
    sets.map((set, index) => ({
      workoutId,
      exerciseTemplateId: set.templateId ?? "bench",
      exerciseTitle: "Bench Press (Barbell)",
      exerciseIndex: 0,
      setIndex: index,
      setType: set.type ?? "normal",
      weightKg: set.weightKg ?? null,
      reps: set.reps ?? null,
      rpe: null,
      durationSeconds: null,
      distanceMeters: null,
    })),
  );
}

beforeEach(async () => {
  const { db } = await import("@/lib/db/client");
  const { workouts, workoutSets } = await import("@/lib/db/schema");
  await db.delete(workoutSets);
  await db.delete(workouts);
});

describe("getLastSessions", () => {
  it("returns only the newest session of each exercise", async () => {
    await seed("old", "2026-07-01T09:00:00Z", [{ weightKg: 90, reps: 8 }]);
    await seed("new", "2026-08-01T09:00:00Z", [
      { weightKg: 100, reps: 8 },
      { weightKg: 100, reps: 6 },
    ]);

    const sessions = await lastSession.getLastSessions(["bench"]);
    const bench = sessions.get("bench")!;

    expect(bench.workoutId).toBe("new");
    expect(bench.sets).toEqual([
      { weightKg: 100, reps: 8, rpe: null },
      { weightKg: 100, reps: 6, rpe: null },
    ]);
  });

  it("answers for several exercises at once, each with its own last date", async () => {
    await seed("w1", "2026-07-01T09:00:00Z", [
      { templateId: "bench", weightKg: 90, reps: 8 },
      { templateId: "squat", weightKg: 140, reps: 5 },
    ]);
    await seed("w2", "2026-08-01T09:00:00Z", [{ templateId: "bench", weightKg: 100, reps: 5 }]);

    const sessions = await lastSession.getLastSessions(["bench", "squat", "deadlift"]);

    expect(sessions.get("bench")!.startTime).toBe("2026-08-01T09:00:00Z");
    expect(sessions.get("squat")!.startTime).toBe("2026-07-01T09:00:00Z");
    // Never trained is absent, not an empty session.
    expect(sessions.has("deadlift")).toBe(false);
  });

  it("ignores warm-up sets", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [
      { weightKg: 40, reps: 10, type: "warmup" },
      { weightKg: 100, reps: 5 },
    ]);

    expect(await lastSession.getLastSessions(["bench"])).toEqual(
      new Map([
        [
          "bench",
          expect.objectContaining({ sets: [{ weightKg: 100, reps: 5, rpe: null }] }),
        ],
      ]),
    );
  });

  it("keeps one session when two workouts share a start time", async () => {
    await seed("a", "2026-08-01T09:00:00Z", [{ weightKg: 100, reps: 5 }]);
    await seed("b", "2026-08-01T09:00:00Z", [{ weightKg: 80, reps: 5 }]);

    const bench = (await lastSession.getLastSessions(["bench"])).get("bench")!;
    // One workout's sets, not both merged into a six-set phantom session.
    expect(bench.sets).toHaveLength(1);
  });

  it("asks nothing of the database for an empty list", async () => {
    expect(await lastSession.getLastSessions([])).toEqual(new Map());
  });
});

describe("getRoutineActivity", () => {
  it("counts the workouts logged against each routine", async () => {
    await seed("w1", "2026-07-01T09:00:00Z", [{ weightKg: 100, reps: 5 }], "routine-a");
    await seed("w2", "2026-08-01T09:00:00Z", [{ weightKg: 100, reps: 5 }], "routine-a");
    await seed("w3", "2026-08-02T09:00:00Z", [{ weightKg: 100, reps: 5 }], "routine-b");
    // A freestyle workout, started from no routine at all.
    await seed("w4", "2026-08-03T09:00:00Z", [{ weightKg: 100, reps: 5 }]);

    const activity = await lastSession.getRoutineActivity(["routine-a", "routine-b", "routine-c"]);

    expect(activity.get("routine-a")).toEqual({
      lastPerformedAt: "2026-08-01T09:00:00Z",
      sessionCount: 2,
    });
    expect(activity.get("routine-b")!.sessionCount).toBe(1);
    expect(activity.has("routine-c")).toBe(false);
  });

  it("counts a workout even when every set in it was a warm-up", async () => {
    // Deliberately unlike getLastSessions: "did I train this routine" is a
    // question about attendance, not about working sets.
    await seed("w1", "2026-08-01T09:00:00Z", [{ weightKg: 40, reps: 10, type: "warmup" }], "r1");
    expect((await lastSession.getRoutineActivity(["r1"])).get("r1")!.sessionCount).toBe(1);
  });
});
