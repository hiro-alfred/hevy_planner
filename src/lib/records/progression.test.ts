import { describe, expect, it } from "vitest";
import type { ExerciseSession } from "./metrics";
import { recommendProgression, type ProgressionInput } from "./progression";

// Pure engine — no database, no clock of its own. `now` is fixed everywhere so
// the layoff rule is deterministic.
const NOW = new Date("2026-08-11T12:00:00Z");

let counter = 0;

/** Sessions are newest-first, exactly as metrics.getExerciseRecords returns them. */
function session(startTime: string, sets: Array<[number | null, number | null]>): ExerciseSession {
  counter += 1;
  return {
    workoutId: `w${counter}`,
    workoutTitle: "Session",
    startTime,
    sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, rpe: null })),
  };
}

function recommend(sessions: ExerciseSession[], overrides: Partial<ProgressionInput> = {}) {
  return recommendProgression(
    { sessions, exerciseType: "weight_reps", equipmentCategory: "barbell", ...overrides },
    NOW,
  );
}

/** Three identical hypertrophy-range sessions, a week apart, newest first. */
function repeated(weightKg: number | null, reps: number[], count = 3): ExerciseSession[] {
  const dates = ["2026-08-10", "2026-08-03", "2026-07-27", "2026-07-20"];
  return dates
    .slice(0, count)
    .map((date) => session(`${date}T09:00:00Z`, reps.map((r) => [weightKg, r])));
}

describe("insufficient data", () => {
  it("asks for a first session when nothing is logged", () => {
    expect(recommend([])).toMatchObject({ kind: "baseline", targetWeightKg: null });
  });

  // One session cannot show whether the weight was easy or brutal.
  it("asks for a second session before recommending anything", () => {
    const one = [session("2026-08-10T09:00:00Z", [[100, 10]])];
    expect(recommend(one)).toMatchObject({ kind: "baseline", targetWeightKg: 100 });
  });
});

describe("double progression", () => {
  it("adds weight once every set reaches the top of the range", () => {
    const sessions = [
      session("2026-08-10T09:00:00Z", [
        [100, 12],
        [100, 12],
      ]),
      session("2026-08-03T09:00:00Z", [
        [100, 11],
        [100, 11],
      ]),
    ];

    expect(recommend(sessions)).toMatchObject({
      kind: "add_weight",
      targetWeightKg: 102.5,
      targetReps: 8,
      goalKind: "hypertrophy",
    });
  });

  it("adds a rep while the range is not yet full", () => {
    expect(recommend(repeated(100, [10, 10], 2))).toMatchObject({
      kind: "add_reps",
      targetWeightKg: 100,
      targetReps: 11,
    });
  });

  // One weak set means the weight is not owned yet — repeating it is progress.
  it("holds the weight when a set falls under the range", () => {
    const sessions = [
      session("2026-08-10T09:00:00Z", [
        [100, 10],
        [100, 6],
      ]),
      session("2026-08-03T09:00:00Z", [
        [100, 10],
        [100, 10],
      ]),
    ];

    expect(recommend(sessions)).toMatchObject({ kind: "hold", targetWeightKg: 100 });
  });

  it("judges only the sets at the session's top weight", () => {
    // The 80 kg back-off set is not evidence about the 100 kg working weight.
    const sessions = [
      session("2026-08-10T09:00:00Z", [
        [100, 12],
        [80, 5],
      ]),
      session("2026-08-03T09:00:00Z", [[100, 11]]),
    ];

    expect(recommend(sessions)).toMatchObject({ kind: "add_weight", targetWeightKg: 102.5 });
  });
});

describe("rep range inference", () => {
  // The reps someone actually logs describe their training better than any
  // free-text goal attached to a plan.
  it("reads sets of five as strength work", () => {
    expect(recommend(repeated(140, [5, 5], 2))).toMatchObject({
      goalKind: "strength",
      repRange: { start: 3, end: 6 },
      kind: "add_reps",
      targetReps: 6,
    });
  });

  it("reads sets of fifteen as endurance work", () => {
    expect(recommend(repeated(40, [15, 15], 2))).toMatchObject({
      goalKind: "endurance",
      repRange: { start: 12, end: 20 },
    });
  });

  it("takes the median so one AMRAP set cannot reclassify the exercise", () => {
    const sessions = [
      session("2026-08-10T09:00:00Z", [
        [100, 10],
        [100, 10],
        [100, 30],
      ]),
      session("2026-08-03T09:00:00Z", [[100, 10]]),
    ];

    expect(recommend(sessions).goalKind).toBe("hypertrophy");
  });
});

describe("stalls and layoffs", () => {
  it("deloads after three sessions with no added reps", () => {
    expect(recommend(repeated(100, [10, 10]))).toMatchObject({
      kind: "deload",
      targetWeightKg: 90,
      targetReps: 8,
    });
  });

  // Adding a rep to the last set is real progress, even at the same weight.
  it("does not call it a stall when total reps improved", () => {
    const sessions = [
      session("2026-08-10T09:00:00Z", [
        [100, 10],
        [100, 11],
      ]),
      session("2026-08-03T09:00:00Z", [
        [100, 10],
        [100, 10],
      ]),
      session("2026-07-27T09:00:00Z", [
        [100, 10],
        [100, 10],
      ]),
    ];

    expect(recommend(sessions).kind).toBe("add_reps");
  });

  it("steps down a full increment when a 10% cut would round back", () => {
    // 8 kg kettlebell: 8 x 0.9 = 7.2, which rounds back to 8 on 4 kg jumps.
    expect(recommend(repeated(8, [10, 10]), { equipmentCategory: "kettlebell" })).toMatchObject({
      kind: "deload",
      targetWeightKg: 4,
    });
  });

  it("deloads after a long layoff, whatever the last session showed", () => {
    const sessions = [
      session("2026-06-01T09:00:00Z", [
        [100, 12],
        [100, 12],
      ]),
      session("2026-05-25T09:00:00Z", [[100, 12]]),
    ];

    // Every set hit the top of the range, so without the layoff this would add
    // weight; 71 days away outranks that.
    expect(recommend(sessions)).toMatchObject({ kind: "deload", targetWeightKg: 90 });
  });
});

describe("equipment increments", () => {
  it("moves dumbbells in 2 kg steps", () => {
    expect(recommend(repeated(30, [12, 12], 2), { equipmentCategory: "dumbbell" })).toMatchObject({
      kind: "add_weight",
      targetWeightKg: 32,
    });
  });

  it("moves kettlebells in 4 kg steps", () => {
    expect(recommend(repeated(24, [12, 12], 2), { equipmentCategory: "kettlebell" })).toMatchObject({
      kind: "add_weight",
      targetWeightKg: 28,
    });
  });

  it("falls back to 2.5 kg for unfamiliar equipment", () => {
    expect(recommend(repeated(50, [12, 12], 2), { equipmentCategory: "suspension" })).toMatchObject({
      targetWeightKg: 52.5,
    });
  });
});

describe("bodyweight variants", () => {
  it("progresses reps when there is no load to add", () => {
    const sessions = repeated(null, [10, 10], 2);
    expect(recommend(sessions, { exerciseType: "reps_only" })).toMatchObject({
      kind: "add_reps",
      targetWeightKg: null,
      targetReps: 11,
    });
  });

  it("asks for a harder variation once the range is full", () => {
    const sessions = repeated(null, [12, 12], 2);
    const result = recommend(sessions, { exerciseType: "reps_only" });

    expect(result.kind).toBe("hold");
    expect(result.reason).toMatch(/harder variation/);
  });

  // On an assisted machine the weight is help, so progress REMOVES it.
  it("cuts assistance instead of adding weight", () => {
    const sessions = repeated(20, [12, 12], 2);
    expect(recommend(sessions, { exerciseType: "bodyweight_assisted" })).toMatchObject({
      kind: "add_weight",
      targetWeightKg: 17.5,
    });
  });

  it("treats the least assistance in a session as the hardest set", () => {
    const sessions = [
      session("2026-08-10T09:00:00Z", [
        [20, 12],
        [30, 12],
      ]),
      session("2026-08-03T09:00:00Z", [[20, 11]]),
    ];

    // 20 kg of help is the harder set, so it is the one progression judges.
    expect(recommend(sessions, { exerciseType: "bodyweight_assisted" })).toMatchObject({
      targetWeightKg: 17.5,
    });
  });

  it("never recommends negative assistance", () => {
    const sessions = repeated(2, [12, 12], 2);
    expect(recommend(sessions, { exerciseType: "bodyweight_assisted" })).toMatchObject({
      targetWeightKg: 0,
    });
  });
});
