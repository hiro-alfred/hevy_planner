import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTempDatabase } from "@/test/database";

// The db client resolves DATABASE_URL at import time, so the throwaway database
// has to be claimed before any module that imports it is loaded.
const database = createTempDatabase("hevy_records_metrics");
let metrics: typeof import("./metrics");

beforeAll(async () => {
  await database.migrate();
  metrics = await import("./metrics");
});

afterAll(() => database.cleanup());

interface SeedSet {
  templateId?: string;
  title?: string;
  weightKg?: number | null;
  reps?: number | null;
  type?: string;
}

/** Writes one workout and its sets straight into the cache tables. */
async function seed(workoutId: string, startTime: string, sets: SeedSet[]): Promise<void> {
  const { db } = await import("@/lib/db/client");
  const { workouts, workoutSets } = await import("@/lib/db/schema");

  await db.insert(workouts).values({
    id: workoutId,
    title: `Session ${workoutId}`,
    routineId: null,
    startTime,
    endTime: null,
    hevyUpdatedAt: startTime,
    fetchedAt: "2026-08-11T00:00:00Z",
  });

  await db.insert(workoutSets).values(
    sets.map((set, index) => ({
      workoutId,
      exerciseTemplateId: set.templateId ?? "bench",
      exerciseTitle: set.title ?? "Bench Press (Barbell)",
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

describe("epley", () => {
  it("returns the weight itself for a true single", () => {
    expect(metrics.epley(140, 1)).toBeCloseTo(140 * (1 + 1 / 30));
  });

  it("scales with reps", () => {
    expect(metrics.epley(100, 5)).toBeCloseTo(116.667, 2);
  });
});

describe("listExerciseRecords", () => {
  it("groups every logged exercise into one row each", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 5 },
      { templateId: "squat", title: "Squat (Barbell)", weightKg: 140, reps: 3 },
    ]);
    await seed("w2", "2026-08-05T09:00:00Z", [{ weightKg: 105, reps: 5 }]);

    const rows = await metrics.listExerciseRecords();

    expect(rows).toHaveLength(2);
    const bench = rows.find((r) => r.templateId === "bench")!;
    expect(bench).toMatchObject({ heaviestKg: 105, bestReps: 5, sessionCount: 2 });
    expect(bench.bestE1rmKg).toBeCloseTo(metrics.epley(105, 5), 4);
    expect(bench.lastPerformedAt).toBe("2026-08-05T09:00:00Z");
  });

  it("sorts by the most recently trained exercise", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [{ weightKg: 100, reps: 5 }]);
    await seed("w2", "2026-08-09T09:00:00Z", [
      { templateId: "squat", title: "Squat (Barbell)", weightKg: 140, reps: 3 },
    ]);

    expect((await metrics.listExerciseRecords()).map((r) => r.templateId)).toEqual([
      "squat",
      "bench",
    ]);
  });

  // A mistyped warm-up weight is exactly the row that invents a fake PR.
  it("ignores warm-up sets entirely", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [
      { weightKg: 500, reps: 5, type: "warmup" },
      { weightKg: 100, reps: 5 },
    ]);

    expect((await metrics.listExerciseRecords())[0]).toMatchObject({ heaviestKg: 100 });
  });

  it("counts failure and dropset sets as working sets", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [
      { weightKg: 100, reps: 5, type: "failure" },
      { weightKg: 110, reps: 2, type: "dropset" },
    ]);

    expect((await metrics.listExerciseRecords())[0]).toMatchObject({ heaviestKg: 110 });
  });

  // Above 12 reps every 1RM formula is a fabrication: a 25-rep back-off set
  // would otherwise "estimate" past a genuine heavy triple.
  it("leaves high-rep sets out of the 1RM estimate but keeps their rep record", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [
      { weightKg: 60, reps: 25 },
      { weightKg: 100, reps: 3 },
    ]);

    const [row] = await metrics.listExerciseRecords();
    expect(row!.bestE1rmKg).toBeCloseTo(metrics.epley(100, 3), 4);
    expect(row!.bestReps).toBe(25);
    expect(row!.heaviestKg).toBe(100);
  });

  it("does not treat a weight logged with no reps as a lift", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [
      { weightKg: 200, reps: null },
      { weightKg: 100, reps: 5 },
    ]);

    expect((await metrics.listExerciseRecords())[0]).toMatchObject({ heaviestKg: 100 });
  });

  it("reports a bodyweight exercise by reps, with no weight records", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [
      { templateId: "pullup", title: "Pull Up", weightKg: null, reps: 12 },
    ]);

    expect((await metrics.listExerciseRecords())[0]).toMatchObject({
      bestReps: 12,
      heaviestKg: null,
      bestE1rmKg: null,
    });
  });

  it("filters by title and treats LIKE wildcards literally", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [
      { weightKg: 100, reps: 5 },
      { templateId: "row", title: "100% Effort Row", weightKg: 80, reps: 8 },
    ]);

    expect((await metrics.listExerciseRecords("bench")).map((r) => r.templateId)).toEqual(["bench"]);
    // "%" must match the literal character, not everything.
    expect((await metrics.listExerciseRecords("%")).map((r) => r.templateId)).toEqual(["row"]);
    expect(await metrics.listExerciseRecords("   ")).toHaveLength(2);
  });
});

describe("getExerciseRecords", () => {
  it("returns null for an exercise with no logged sets", async () => {
    expect(await metrics.getExerciseRecords("nothing")).toBeNull();
  });

  it("keeps the set and date behind every record", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [{ weightKg: 100, reps: 8 }]);
    await seed("w2", "2026-08-08T09:00:00Z", [{ weightKg: 130, reps: 3 }]);

    const records = (await metrics.getExerciseRecords("bench"))!;

    expect(records.heaviest).toMatchObject({ weightKg: 130, reps: 3, performedAt: "2026-08-08T09:00:00Z" });
    // 100x8 = 800 kg-reps beats 130x3 = 390, so the volume record is the older set.
    expect(records.bestVolume).toMatchObject({ value: 800, performedAt: "2026-08-01T09:00:00Z" });
    // Epley: 130x3 = 143 vs 100x8 = 126.7.
    expect(records.bestE1rm!.value).toBeCloseTo(metrics.epley(130, 3), 4);
  });

  // "5RM" means the most weight moved for five OR MORE reps: a set of 8 at
  // 100 kg proves a 5-rep capability at 100 kg.
  it("fills every rep-max row a set qualifies for", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [
      { weightKg: 100, reps: 8 },
      { weightKg: 130, reps: 3 },
    ]);

    const records = (await metrics.getExerciseRecords("bench"))!;
    const byReps = new Map(records.repMaxes.map((r) => [r.reps, r.weightKg]));

    expect(byReps.get(1)).toBe(130);
    expect(byReps.get(3)).toBe(130);
    expect(byReps.get(4)).toBe(100);
    expect(byReps.get(8)).toBe(100);
    expect(byReps.has(9)).toBe(false);
  });

  it("groups sets into sessions, newest first", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 4 },
    ]);
    await seed("w2", "2026-08-08T09:00:00Z", [{ weightKg: 105, reps: 5 }]);

    const records = (await metrics.getExerciseRecords("bench"))!;

    expect(records.sessions.map((s) => s.workoutId)).toEqual(["w2", "w1"]);
    expect(records.sessions[1]!.sets.map((s) => s.reps)).toEqual([5, 4]);
  });

  it("shows the exercise's current title after an upstream rename", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [{ weightKg: 100, reps: 5, title: "Bench Press" }]);
    await seed("w2", "2026-08-08T09:00:00Z", [
      { weightKg: 100, reps: 5, title: "Bench Press (Barbell)" },
    ]);

    expect((await metrics.getExerciseRecords("bench"))!.title).toBe("Bench Press (Barbell)");
  });

  it("excludes warm-ups from the detail records too", async () => {
    await seed("w1", "2026-08-01T09:00:00Z", [
      { weightKg: 500, reps: 5, type: "warmup" },
      { weightKg: 100, reps: 5 },
    ]);

    const records = (await metrics.getExerciseRecords("bench"))!;
    expect(records.heaviest!.weightKg).toBe(100);
    expect(records.sessions[0]!.sets).toHaveLength(1);
  });
});
