import { z } from "zod";
import type { Plan, PlanExercise, PlanSet } from "./schema";

// The other half of the "minimal-plus" edit scope decided in
// knowledge/decisions/plan-pipeline.md: per-exercise set count, rep range and
// rest. The swap half lives in alternatives.ts.
//
// Pure, like every planner module — the interesting behaviour is what happens to
// existing sets when the count changes, and that deserves a test rather than a
// server round trip.

export const exerciseEditSchema = z.object({
  sets: z.number().int().min(1).max(12),
  repStart: z.number().int().min(1).max(100),
  repEnd: z.number().int().min(1).max(100),
  restSeconds: z.number().int().min(0).max(900),
  // Optional, and the three states are all distinct: a number sets every set to
  // it, an explicit null clears the load back to "you decide in Hevy", and an
  // ABSENT key leaves whatever per-set weights the exercise already had. The
  // last one is what keeps every caller that predates this field — and its
  // tests — behaving exactly as before.
  //
  // Capped well above a barbell because it is not one: a loaded leg press or hip
  // thrust passes 500 kg in a normal gym, and the cap exists to catch a typo
  // rather than to have an opinion about strength.
  weightKg: z.number().positive().max(1000).nullable().optional(),
});

export type ExerciseEdit = z.infer<typeof exerciseEditSchema>;

/**
 * Applies an edit to one exercise, preserving what the edit does not mention.
 *
 * Growing the set count copies the LAST set's weight into the new sets rather
 * than leaving them null: someone adding a fifth set to a four-set exercise
 * means "one more of these", and a null there would read in Hevy as a set whose
 * load was never decided.
 *
 * Shrinking drops from the end, so the sets that survive are the ones that were
 * already there — the alternative, rebuilding the array, would silently discard
 * a per-set weight the user had reason to set.
 *
 * Rep range applies to every set uniformly. That matches how the generators
 * emit sets and how the prompt describes them; per-set rep ranges are
 * representable in the model but nothing produces them, and inventing a UI for
 * them here would be scope no one asked for.
 *
 * A stated `weightKg` likewise applies to every set — the deliberate way to take
 * a suggested load one exercise at a time (lib/planner/suggested-loads.ts), and
 * the only way to type a starting weight in this app at all. Omitting the field
 * keeps the per-set weights untouched.
 */
export function applyExerciseEdit(exercise: PlanExercise, edit: ExerciseEdit): PlanExercise {
  const lastWeight = exercise.sets[exercise.sets.length - 1]?.weightKg ?? null;
  const uniformWeight = edit.weightKg !== undefined;

  const sets: PlanSet[] = Array.from({ length: edit.sets }, (_unused, index) => {
    const existing = exercise.sets[index];
    return {
      type: existing?.type ?? "normal",
      repRange: { start: edit.repStart, end: edit.repEnd },
      weightKg: uniformWeight ? edit.weightKg! : existing ? existing.weightKg : lastWeight,
    };
  });

  return { ...exercise, restSeconds: edit.restSeconds, sets };
}

/**
 * Returns a copy of the plan with one exercise edited, in place.
 *
 * Positional and nothing else moves, for the same reason `applySwap` is: day
 * identity is the `dayIndex` → `sync_links` correspondence, so touching the
 * shape of `days` here would strand routines in a delete-less API.
 *
 * Unlike a swap, an edit DOES change how long the session takes — that is
 * usually the point. `validatePlan` re-runs on every render of the plan page, so
 * an edit that pushes a day outside ±20% of the requested length shows up as a
 * warning rather than being silently accepted or silently refused.
 */
export function applyPlanEdit(
  plan: Plan,
  dayIndex: number,
  exerciseIndex: number,
  edit: ExerciseEdit,
): Plan {
  return {
    ...plan,
    days: plan.days.map((day, d) =>
      d !== dayIndex
        ? day
        : {
            ...day,
            exercises: day.exercises.map((exercise, e) =>
              e !== exerciseIndex ? exercise : applyExerciseEdit(exercise, edit),
            ),
          },
    ),
  };
}
