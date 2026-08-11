import { describe, expect, it } from "vitest";
import { applyExerciseEdit, applyPlanEdit, exerciseEditSchema } from "./plan-edit";
import { sessionSeconds } from "./prescription";
import type { Plan, PlanExercise } from "./schema";

// The set/rep/rest half of the minimal-plus edit scope. The cases that matter
// are what happens to EXISTING sets when the count changes — growing and
// shrinking both have a wrong answer that silently loses a value the user set.

function exercise(overrides: Partial<PlanExercise> = {}): PlanExercise {
  return {
    exerciseTemplateId: "bench",
    name: "Barbell Bench Press",
    restSeconds: 90,
    notes: "Wrists stacked.",
    sets: [
      { type: "warmup", repRange: { start: 10, end: 12 }, weightKg: 40 },
      { type: "normal", repRange: { start: 8, end: 12 }, weightKg: 80 },
      { type: "normal", repRange: { start: 8, end: 12 }, weightKg: 85 },
    ],
    ...overrides,
  };
}

function plan(): Plan {
  return {
    title: "Test plan",
    progression: "Add reps, then load.",
    days: [
      { title: "Push", exercises: [exercise(), exercise({ exerciseTemplateId: "keep" })] },
      { title: "Pull", exercises: [exercise({ exerciseTemplateId: "other-day" })] },
    ],
  };
}

const edit = { sets: 3, repStart: 6, repEnd: 10, restSeconds: 120 };

describe("applyExerciseEdit weight", () => {
  it("leaves per-set weights alone when the edit does not mention one", () => {
    // The three-state rule: an ABSENT key is not "clear it". Every caller that
    // predates the weight field relies on this.
    expect(applyExerciseEdit(exercise(), edit).sets.map((set) => set.weightKg)).toEqual([
      40, 80, 85,
    ]);
  });

  it("applies a stated weight to every set", () => {
    const result = applyExerciseEdit(exercise(), { ...edit, weightKg: 82.5 });
    expect(result.sets.map((set) => set.weightKg)).toEqual([82.5, 82.5, 82.5]);
  });

  it("clears every weight when the edit states null", () => {
    const result = applyExerciseEdit(exercise(), { ...edit, weightKg: null });
    expect(result.sets.map((set) => set.weightKg)).toEqual([null, null, null]);
  });

  it("gives a stated weight to sets the edit adds", () => {
    const result = applyExerciseEdit(exercise(), { ...edit, sets: 5, weightKg: 60 });
    expect(result.sets).toHaveLength(5);
    expect(result.sets.every((set) => set.weightKg === 60)).toBe(true);
  });

  it("refuses a zero or negative weight", () => {
    // Zero is not "no weight" — null is. Letting 0 through would sync a set
    // whose load reads as decided at nothing.
    expect(exerciseEditSchema.safeParse({ ...edit, weightKg: 0 }).success).toBe(false);
    expect(exerciseEditSchema.safeParse({ ...edit, weightKg: -5 }).success).toBe(false);
    expect(exerciseEditSchema.safeParse({ ...edit, weightKg: 1001 }).success).toBe(false);
    expect(exerciseEditSchema.safeParse({ ...edit, weightKg: null }).success).toBe(true);
  });
});

describe("applyExerciseEdit", () => {
  it("applies the rep range to every set and the rest to the exercise", () => {
    const result = applyExerciseEdit(exercise(), edit);
    expect(result.restSeconds).toBe(120);
    expect(result.sets.every((set) => set.repRange.start === 6 && set.repRange.end === 10)).toBe(
      true,
    );
  });

  it("keeps the id, name and notes — an edit is not a swap", () => {
    const result = applyExerciseEdit(exercise(), edit);
    expect(result.exerciseTemplateId).toBe("bench");
    expect(result.name).toBe("Barbell Bench Press");
    expect(result.notes).toBe("Wrists stacked.");
  });

  it("preserves each surviving set's own weight and type", () => {
    const result = applyExerciseEdit(exercise(), edit);
    expect(result.sets.map((set) => set.weightKg)).toEqual([40, 80, 85]);
    // The warmup set stays a warmup set: the edit never mentioned set types.
    expect(result.sets.map((set) => set.type)).toEqual(["warmup", "normal", "normal"]);
  });

  it("grows by copying the last set's weight, not by leaving a blank", () => {
    const result = applyExerciseEdit(exercise(), { ...edit, sets: 5 });
    expect(result.sets).toHaveLength(5);
    // "One more of these", so the new sets inherit the last weight rather than
    // arriving in Hevy as sets whose load was never decided.
    expect(result.sets.map((set) => set.weightKg)).toEqual([40, 80, 85, 85, 85]);
    expect(result.sets[3]!.type).toBe("normal");
  });

  it("shrinks from the end, keeping the sets that were already there", () => {
    const result = applyExerciseEdit(exercise(), { ...edit, sets: 2 });
    expect(result.sets.map((set) => set.weightKg)).toEqual([40, 80]);
  });

  it("does not mutate the exercise it was given", () => {
    const original = exercise();
    applyExerciseEdit(original, { ...edit, sets: 1 });
    expect(original.sets).toHaveLength(3);
    expect(original.restSeconds).toBe(90);
  });
});

describe("applyPlanEdit", () => {
  it("edits exactly one exercise and moves nothing else", () => {
    const after = applyPlanEdit(plan(), 0, 0, edit);
    expect(after.days.map((day) => day.title)).toEqual(["Push", "Pull"]);
    expect(after.days[0]!.exercises[0]!.restSeconds).toBe(120);
    // Neighbour on the same day, and the other day, are untouched.
    expect(after.days[0]!.exercises[1]!.restSeconds).toBe(90);
    expect(after.days[1]!.exercises[0]!.restSeconds).toBe(90);
  });

  it("DOES change the session length — unlike a swap, that is the point", () => {
    const before = plan();
    const after = applyPlanEdit(before, 0, 0, { ...edit, sets: 6, restSeconds: 180 });
    expect(sessionSeconds(after.days[0]!.exercises)).toBeGreaterThan(
      sessionSeconds(before.days[0]!.exercises),
    );
  });

  it("leaves the original plan object alone", () => {
    const before = plan();
    applyPlanEdit(before, 0, 0, edit);
    expect(before.days[0]!.exercises[0]!.restSeconds).toBe(90);
  });
});

describe("exerciseEditSchema", () => {
  it("accepts a sane edit and rejects the out-of-range ones", () => {
    expect(exerciseEditSchema.safeParse(edit).success).toBe(true);
    expect(exerciseEditSchema.safeParse({ ...edit, sets: 0 }).success).toBe(false);
    expect(exerciseEditSchema.safeParse({ ...edit, sets: 13 }).success).toBe(false);
    expect(exerciseEditSchema.safeParse({ ...edit, restSeconds: -1 }).success).toBe(false);
    expect(exerciseEditSchema.safeParse({ ...edit, repStart: 0 }).success).toBe(false);
    // A reversed range parses — the action refuses it with a clearer message
    // than a schema error, and validatePlan reports it too.
    expect(exerciseEditSchema.safeParse({ ...edit, repStart: 12, repEnd: 8 }).success).toBe(true);
  });
});
