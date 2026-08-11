import { describe, expect, it } from "vitest";
import type { CatalogRow } from "@/lib/hevy/catalog";
import type { ExerciseSession } from "@/lib/records/metrics";
import { recommendProgression } from "@/lib/records/progression";
import type { Plan, PlanExercise } from "./schema";
import {
  applySuggestedLoads,
  countApplicable,
  countLoadedExercises,
  suggestionKey,
  suggestLoads,
} from "./suggested-loads";

// Starting loads read off the workout history.
//
// The cases that matter are the two ways a suggestion can be wrong rather than
// merely absent: a load earned in a rep range the plan does not prescribe, and a
// load that reaches Hevy without anyone having chosen it.

const NOW = new Date("2026-08-11T09:00:00Z");

function template(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id: "bench",
    title: "Bench Press (Barbell)",
    type: "weight_reps",
    primaryMuscleGroup: "chest",
    secondaryMuscleGroups: ["triceps"],
    equipmentCategory: "barbell",
    isCustom: false,
    fetchedAt: "2026-08-11T00:00:00Z",
    ...overrides,
  };
}

/** One session, given as [weightKg, reps] pairs. */
function session(startTime: string, sets: Array<[number | null, number]>): ExerciseSession {
  return {
    workoutId: startTime,
    workoutTitle: "Session",
    startTime,
    sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, rpe: null })),
  };
}

/** A session of `count` identical straight sets. */
function straight(
  startTime: string,
  weightKg: number | null,
  reps: number,
  count = 3,
): ExerciseSession {
  return session(
    startTime,
    Array.from({ length: count }, () => [weightKg, reps]),
  );
}

/** Two sessions of 3x12 at 100 kg — every set at the top of an 8-12 band. */
function benchSessions(): ExerciseSession[] {
  return [straight("2026-08-09T09:00:00Z", 100, 12), straight("2026-08-02T09:00:00Z", 100, 10)];
}

/** Two sessions of 3x5 at 140 kg — a strength band, whatever the plan says. */
function squatSessions(): ExerciseSession[] {
  return [straight("2026-08-08T09:00:00Z", 140, 5), straight("2026-08-01T09:00:00Z", 140, 5)];
}

function exercise(templateId: string, repRange = { start: 8, end: 12 }): PlanExercise {
  return {
    exerciseTemplateId: templateId,
    name: templateId,
    restSeconds: 90,
    notes: null,
    sets: Array.from({ length: 3 }, () => ({
      type: "normal" as const,
      repRange: { ...repRange },
      weightKg: null,
    })),
  };
}

function plan(...days: PlanExercise[][]): Plan {
  return {
    title: "Test plan",
    progression: "Double progression.",
    days: days.map((exercises, index) => ({ title: `Day ${index + 1}`, exercises })),
  };
}

const CATALOG = new Map([
  ["bench", template()],
  ["squat", template({ id: "squat", title: "Squat (Barbell)", primaryMuscleGroup: "quadriceps" })],
]);

describe("suggestLoads", () => {
  it("suggests the load the progression engine recommends, not a second opinion", () => {
    const sessions = benchSessions();
    const suggestions = suggestLoads(
      plan([exercise("bench")]),
      new Map([["bench", sessions]]),
      CATALOG,
      NOW,
    );

    const engine = recommendProgression(
      { sessions, exerciseType: "weight_reps", equipmentCategory: "barbell" },
      NOW,
    );

    const suggestion = suggestions.get(suggestionKey(0, 0))!;
    // The point of the whole module: the number on the plan page and the number
    // on /records are the same number, because they come from the same call.
    expect(suggestion.weightKg).toBe(engine.targetWeightKg);
    expect(suggestion.weightKg).toBe(102.5);
    expect(suggestion.kind).toBe("add_weight");
    expect(suggestion.reason).toBe(engine.reason);
    expect(suggestion.sessionCount).toBe(2);
    expect(suggestion.transferable).toBe(true);
  });

  it("says nothing about an exercise with no logged history", () => {
    const suggestions = suggestLoads(
      plan([exercise("bench"), exercise("squat")]),
      new Map([["bench", benchSessions()]]),
      CATALOG,
      NOW,
    );

    expect(suggestions.has(suggestionKey(0, 0))).toBe(true);
    // Absent, not a zero or a guess: no evidence, no suggestion.
    expect(suggestions.has(suggestionKey(0, 1))).toBe(false);
  });

  it("marks a load earned in another rep range as not transferable", () => {
    const suggestions = suggestLoads(
      plan([exercise("squat")]),
      new Map([["squat", squatSessions()]]),
      CATALOG,
      NOW,
    );

    const suggestion = suggestions.get(suggestionKey(0, 0))!;
    expect(suggestion.weightKg).toBe(140);
    expect(suggestion.repRange).toEqual({ start: 3, end: 6 });
    // 140 kg is a true statement about sets of five and a dangerous one about
    // sets of twelve, which is what this plan prescribes.
    expect(suggestion.transferable).toBe(false);
  });

  it("transfers that same load into a plan that does prescribe its range", () => {
    const suggestions = suggestLoads(
      plan([exercise("squat", { start: 3, end: 6 })]),
      new Map([["squat", squatSessions()]]),
      CATALOG,
      NOW,
    );

    expect(suggestions.get(suggestionKey(0, 0))!.transferable).toBe(true);
  });

  it("suggests nothing for a movement that carries no load", () => {
    const pullUp = template({ id: "pull-up", type: "reps_only", equipmentCategory: "none" });
    const sessions = [
      straight("2026-08-09T09:00:00Z", null, 10, 2),
      straight("2026-08-02T09:00:00Z", null, 8, 2),
    ];

    const suggestions = suggestLoads(
      plan([exercise("pull-up")]),
      new Map([["pull-up", sessions]]),
      new Map([["pull-up", pullUp]]),
      NOW,
    );

    expect(suggestions.size).toBe(0);
  });

  it("suggests nothing when the recommendation is to remove the last assistance", () => {
    // An assisted pull-up progressing off 2.5 kg lands on zero assistance, which
    // planSetSchema cannot express: it takes a positive number or null, and null
    // already means "you decide". So the row keeps its empty field.
    const assisted = template({
      id: "assisted-pull-up",
      type: "bodyweight_assisted",
      equipmentCategory: "machine",
    });
    const sessions = [
      straight("2026-08-09T09:00:00Z", 2.5, 12, 2),
      straight("2026-08-02T09:00:00Z", 2.5, 10, 2),
    ];

    const suggestions = suggestLoads(
      plan([exercise("assisted-pull-up")]),
      new Map([["assisted-pull-up", sessions]]),
      new Map([["assisted-pull-up", assisted]]),
      NOW,
    );

    expect(suggestions.size).toBe(0);
  });

  it("suggests nothing for history whose exercise has left the catalog", () => {
    // The history survives a deleted custom exercise, but the equipment does
    // not — and without it there is no honest increment to add.
    const suggestions = suggestLoads(
      plan([exercise("bench")]),
      new Map([["bench", benchSessions()]]),
      new Map(),
      NOW,
    );

    expect(suggestions.size).toBe(0);
  });

  it("answers for the same exercise on every day it appears", () => {
    const suggestions = suggestLoads(
      plan([exercise("bench")], [exercise("squat")], [exercise("bench")]),
      new Map([["bench", benchSessions()]]),
      CATALOG,
      NOW,
    );

    expect(suggestions.get(suggestionKey(0, 0))!.weightKg).toBe(102.5);
    expect(suggestions.get(suggestionKey(2, 0))!.weightKg).toBe(102.5);
  });
});

describe("applySuggestedLoads", () => {
  function withHistory() {
    const document = plan([exercise("bench"), exercise("squat")]);
    const suggestions = suggestLoads(
      document,
      new Map([
        ["bench", benchSessions()],
        ["squat", squatSessions()],
      ]),
      CATALOG,
      NOW,
    );
    return { document, suggestions };
  }

  it("writes the load onto every set of the exercises it applies to", () => {
    const { document, suggestions } = withHistory();
    const { plan: updated, applied } = applySuggestedLoads(document, suggestions);

    expect(applied).toBe(1);
    expect(updated.days[0]!.exercises[0]!.sets.map((set) => set.weightKg)).toEqual([
      102.5, 102.5, 102.5,
    ]);
  });

  it("leaves a non-transferable suggestion out of the plan entirely", () => {
    const { document, suggestions } = withHistory();
    const { plan: updated } = applySuggestedLoads(document, suggestions);

    // The squat suggestion is shown on the page and is NOT applied in bulk:
    // 140 kg for sets of 8-12 is the wrong suggested weight the empty field
    // was always protecting against.
    expect(updated.days[0]!.exercises[1]!.sets.every((set) => set.weightKg === null)).toBe(true);
  });

  it("does not touch the plan it was given", () => {
    const { document, suggestions } = withHistory();
    applySuggestedLoads(document, suggestions);
    expect(document.days[0]!.exercises[0]!.sets[0]!.weightKg).toBeNull();
  });

  it("counts nothing to do once the loads are already there", () => {
    const { document, suggestions } = withHistory();
    const { plan: updated } = applySuggestedLoads(document, suggestions);

    expect(countApplicable(updated, suggestions)).toBe(0);
    expect(applySuggestedLoads(updated, suggestions).applied).toBe(0);
  });

  it("counts every exercise carrying a load, whatever set it", () => {
    const { document, suggestions } = withHistory();
    expect(countLoadedExercises(document)).toBe(0);
    expect(countLoadedExercises(applySuggestedLoads(document, suggestions).plan)).toBe(1);
  });
});
