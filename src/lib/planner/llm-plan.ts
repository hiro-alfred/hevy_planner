import { z } from "zod";
import type { CatalogRow } from "@/lib/hevy/catalog";
import type { Plan, PlanExercise } from "./schema";

// The shape the MODEL writes, which is deliberately not the internal plan model
// (knowledge/decisions/plan-pipeline.md already establishes that the two differ).
// This one exists purely to make generation cheap and fast.
//
// Why it is worth a second schema: on DeepSeek, wall-clock time is dominated by
// output tokens, which are produced serially. The internal model spells out one
// full object per SET — type, a nested rep range, and a weight — even though the
// prescription makes every working set of an exercise identical, and it repeats
// a 36-character template UUID for every exercise. A six-day plan therefore
// spent thousands of tokens restating the same handful of numbers.
//
// Two changes carry almost all of the saving:
//   - sets collapse to a COUNT plus one rep range, expanded back out here;
//   - exercises are chosen by the small integer the prompt labels them with,
//     not by UUID.
//
// The integer is not only cheaper. A model cannot invent a plausible-looking
// number the way it can invent a plausible-looking UUID: an out-of-range index
// is detectable on the spot, whereas a hallucinated id used to survive as far as
// sync — where it would be a permanent, undeletable routine referencing nothing.
//
// `name` is gone entirely: generation already overwrites whatever the model
// wrote with the catalog's own title, so every token spent on it was discarded.

export const llmExerciseSchema = z.object({
  /** The number this exercise was listed under in the prompt. */
  ex: z.number().int().min(1),
  /** Working sets. Expanded into that many identical set objects. */
  sets: z.number().int().min(1).max(12),
  repStart: z.number().int().min(1).max(100),
  repEnd: z.number().int().min(1).max(100),
  /** Rest between sets, seconds. Per exercise, never per set. */
  rest: z.number().int().min(0).max(900),
  /** Only when the trainee gave working weights; otherwise omitted. */
  weightKg: z.number().positive().max(500).nullish(),
  /** Only when there is something to say, e.g. an injury caution. */
  notes: z.string().max(300).nullish(),
});

export const llmPlanSchema = z.object({
  title: z.string(),
  progression: z.string(),
  days: z
    .array(
      z.object({
        title: z.string(),
        exercises: z.array(llmExerciseSchema).min(1),
      }),
    )
    .min(1),
});

export type LlmPlan = z.infer<typeof llmPlanSchema>;

export interface ExpandedPlan {
  plan: Plan;
  /** Numbers the model used that no listed exercise carries. */
  unknownNumbers: number[];
}

function toExercise(
  compact: z.infer<typeof llmExerciseSchema>,
  row: CatalogRow,
): PlanExercise {
  return {
    exerciseTemplateId: row.id,
    // The catalog is the authority on titles, so this needs no relabelling pass.
    name: row.title,
    restSeconds: compact.rest,
    notes: compact.notes ?? null,
    // Every working set of an exercise shares the prescription's rep range —
    // which is what let the model write one range instead of N copies.
    sets: Array.from({ length: compact.sets }, () => ({
      type: "normal" as const,
      repRange: { start: compact.repStart, end: compact.repEnd },
      weightKg: compact.weightKg ?? null,
    })),
  };
}

/**
 * Expands the model's compact output into the internal plan model.
 *
 * Exercises whose number matches nothing are DROPPED rather than carried as a
 * sentinel id: an unresolvable id is exactly the thing that must never reach
 * sync. Dropping them shortens the day, which the session-length check then
 * fails, so the retry attempt is told about the bad numbers explicitly and about
 * the short day by the ordinary validator — the plan cannot quietly ship.
 *
 * A day that loses every exercise is kept as an empty day so the shape stays
 * addressable; `validatePlan` reports it, and generation never syncs on its own.
 */
export function expandPlan(output: LlmPlan, byNumber: Map<number, CatalogRow>): ExpandedPlan {
  const unknown = new Set<number>();

  const days = output.days.map((day) => ({
    title: day.title,
    exercises: day.exercises.flatMap((compact) => {
      const row = byNumber.get(compact.ex);
      if (!row) {
        unknown.add(compact.ex);
        return [];
      }
      return [toExercise(compact, row)];
    }),
  }));

  return {
    plan: { title: output.title, progression: output.progression, days },
    unknownNumbers: [...unknown].sort((a, b) => a - b),
  };
}
