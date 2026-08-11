import type { CatalogRow } from "@/lib/hevy/catalog";
import type { ExerciseSession } from "@/lib/records/metrics";
import { recommendProgression, type RecommendationKind } from "@/lib/records/progression";
import type { Plan, PlanExercise } from "./schema";

// Starting loads, read off what the trainee has actually lifted.
//
// The numbers come from lib/records/progression.ts — the SAME engine that
// answers "what should the next session be" on /records. Not a second opinion
// written for the generator: two progression rules in one codebase would
// eventually disagree, and then the plan and the records page would be telling
// the same lifter different things about the same barbell.
//
// A suggestion is NOT a plan weight. Nothing here writes into the plan on its
// own — `applySuggestedLoads` runs only when the trainee presses the button.
// That gap is the whole design: a weight in the plan syncs to Hevy, Hevy has no
// DELETE endpoint (knowledge/systems/hevy-api.md), and so a computed number that
// travelled from a generation straight into the account could never be taken
// back out. The original "a wrong suggested weight is worse than an empty field"
// still holds; what has changed is that the app now has the history to make the
// suggestion, not that a wrong one costs less.
//
// Pure: the history and the catalog are handed in, so the whole policy is
// unit-testable without a database.

export interface LoadSuggestion {
  /** Always positive — see `suggestLoads` on why zero is not suggestable. */
  weightKg: number;
  kind: RecommendationKind;
  /** A few words for the row; the engine's full sentence is `reason`. */
  summary: string;
  reason: string;
  /** The rep band the engine read off the LOG, which may not be the plan's. */
  repRange: { start: number; end: number };
  sessionCount: number;
  lastPerformedAt: string;
  /**
   * True when this plan prescribes the same rep band the number was earned in.
   *
   * False means the load is real but not transferable as-is: a 102.5 kg bench
   * earned in sets of 5 is not a starting weight for sets of 12. Those are shown
   * and explained, and deliberately left out of the bulk apply.
   */
  transferable: boolean;
}

/** Suggestions are keyed positionally, exactly as the preview renders them. */
export function suggestionKey(dayIndex: number, exerciseIndex: number): string {
  return `${dayIndex}:${exerciseIndex}`;
}

const SUMMARY: Record<RecommendationKind, string> = {
  add_weight: "time to add weight",
  add_reps: "hold this load, add reps",
  hold: "repeat this load",
  deload: "ease off and rebuild",
  baseline: "repeat your last session",
};

/** The rep range a plan exercise prescribes. Uniform across its sets in practice. */
function plannedRange(exercise: PlanExercise): { start: number; end: number } {
  return exercise.sets[0]!.repRange;
}

/**
 * A suggested starting load for every exercise in the plan that has history.
 *
 * One recommendation per TEMPLATE, reused across the days it appears on — an
 * upper/lower split trains the same bench press twice a week, and running the
 * engine again over identical sessions would only spend time to reach the same
 * answer.
 *
 * Exercises with no history are simply absent, which leaves `weightKg` null and
 * the field empty in Hevy: unchanged behaviour, and still the right one. A
 * suggestion needs evidence, and "no sessions logged" is the absence of it.
 */
export function suggestLoads(
  plan: Plan,
  sessionsByTemplate: Map<string, ExerciseSession[]>,
  catalog: Map<string, CatalogRow>,
  now: Date = new Date(),
): Map<string, LoadSuggestion> {
  const byTemplate = new Map<string, Omit<LoadSuggestion, "transferable">>();

  for (const [templateId, sessions] of sessionsByTemplate) {
    if (sessions.length === 0) continue;
    const row = catalog.get(templateId);
    // An exercise the catalog no longer holds still has history (the records
    // page denormalises the title for exactly this case), but the engine needs
    // the equipment to know how big a step is. Guessing 2.5 kg on a kettlebell
    // is advice the lifter cannot follow, so no guess is made.
    if (!row) continue;

    const recommendation = recommendProgression(
      { sessions, exerciseType: row.type, equipmentCategory: row.equipmentCategory },
      now,
    );

    // Bodyweight work has no load to suggest, and assistance driven all the way
    // to zero cannot be written down either: planSetSchema takes a positive
    // number or null, and null already means "you decide".
    if (recommendation.targetWeightKg === null || recommendation.targetWeightKg <= 0) continue;

    byTemplate.set(templateId, {
      weightKg: recommendation.targetWeightKg,
      kind: recommendation.kind,
      summary: SUMMARY[recommendation.kind],
      reason: recommendation.reason,
      repRange: recommendation.repRange,
      sessionCount: sessions.length,
      lastPerformedAt: sessions[0]!.startTime,
    });
  }

  const suggestions = new Map<string, LoadSuggestion>();
  plan.days.forEach((day, dayIndex) => {
    day.exercises.forEach((exercise, exerciseIndex) => {
      const base = byTemplate.get(exercise.exerciseTemplateId);
      if (!base) return;
      const planned = plannedRange(exercise);
      suggestions.set(suggestionKey(dayIndex, exerciseIndex), {
        ...base,
        transferable:
          base.repRange.start === planned.start && base.repRange.end === planned.end,
      });
    });
  });

  return suggestions;
}

/** True when every set already carries the suggested load. */
function alreadyLoaded(exercise: PlanExercise, weightKg: number): boolean {
  return exercise.sets.every((set) => set.weightKg === weightKg);
}

/**
 * Writes the transferable suggestions into the plan, uniformly across each
 * exercise's sets.
 *
 * Only the transferable ones: applying a load earned in sets of 5 to a plan
 * prescribing sets of 12 is the "wrong suggested weight" the null was protecting
 * against all along. The others stay visible on the page with the band they came
 * from, and the per-exercise Edit form takes them one at a time for anyone who
 * looks at the number and decides it is right.
 *
 * Returns the count so the caller can say what it did — and so the button can
 * ask the same question ("how many would this change?") without a second rule.
 */
export function applySuggestedLoads(
  plan: Plan,
  suggestions: Map<string, LoadSuggestion>,
): { plan: Plan; applied: number } {
  let applied = 0;

  const days = plan.days.map((day, dayIndex) => ({
    ...day,
    exercises: day.exercises.map((exercise, exerciseIndex) => {
      const suggestion = suggestions.get(suggestionKey(dayIndex, exerciseIndex));
      if (!suggestion?.transferable) return exercise;
      if (alreadyLoaded(exercise, suggestion.weightKg)) return exercise;

      applied += 1;
      return {
        ...exercise,
        sets: exercise.sets.map((set) => ({ ...set, weightKg: suggestion.weightKg })),
      };
    }),
  }));

  return { plan: { ...plan, days }, applied };
}

/** How many exercises the button would change, asked of the apply rule itself. */
export function countApplicable(
  plan: Plan,
  suggestions: Map<string, LoadSuggestion>,
): number {
  return applySuggestedLoads(plan, suggestions).applied;
}

/**
 * Exercises carrying a load, whatever put it there.
 *
 * The sync screen's honest question is not "did you press the suggest button"
 * but "is this plan about to write weights into a routine that cannot be
 * deleted" — a load typed by hand, or one the LLM extrapolated from the stated
 * working weights, crosses to Hevy exactly the same way.
 */
export function countLoadedExercises(plan: Plan): number {
  return plan.days.reduce(
    (total, day) =>
      total + day.exercises.filter((exercise) => exercise.sets.some((set) => set.weightKg !== null)).length,
    0,
  );
}
