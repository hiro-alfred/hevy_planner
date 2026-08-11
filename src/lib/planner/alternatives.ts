import type { CatalogRow } from "@/lib/hevy/catalog";
import { rank } from "./rules";
import type { Plan, PlanExercise } from "./schema";

// Exercise-swap support: ranking a candidate pool against the exercise being
// replaced, and performing the substitution itself
// (knowledge/decisions/exercise-alternatives.md).
//
// Pure by design — no database, no network. The session-length guarantee below
// is the reason: it is a property of the substitution rule, and a property is
// only worth claiming if a test can hold it down.

/**
 * One option as the picker renders it.
 *
 * Deliberately not a `CatalogRow`: this crosses the server-action boundary into
 * a client component, and only these four fields are ever read. The muscle group
 * and equipment are not decoration — they ARE the explanation for why the option
 * is being offered, because they are the query's WHERE clause made visible.
 */
export interface Alternative {
  id: string;
  title: string;
  muscleGroup: string;
  equipment: string;
}

export function toAlternative(row: CatalogRow): Alternative {
  return {
    id: row.id,
    title: row.title,
    muscleGroup: row.primaryMuscleGroup,
    equipment: row.equipmentCategory,
  };
}

/**
 * Orders a candidate pool for the exercise being replaced.
 *
 * Four keys, most significant first:
 *   1. primary-muscle matches ahead of secondary-only matches — the pool query
 *      matches either, and a lateral raise is a worse swap for a bench press
 *      than any chest movement is;
 *   2. same equipment category as the outgoing exercise, because "the same
 *      thing but not this one" is what a swap usually means;
 *   3. the generator's own EQUIPMENT_RANK, so the list agrees with how the plan
 *      was built in the first place;
 *   4. title, purely so the order is stable — two runs of the picker must not
 *      reshuffle under the cursor.
 *
 * Stable in the strict sense: every key is derived from the row, so equal rows
 * keep their incoming (catalog) order.
 */
export function rankAlternatives(pool: CatalogRow[], outgoing: CatalogRow): CatalogRow[] {
  const keys = (row: CatalogRow): number[] => [
    row.primaryMuscleGroup === outgoing.primaryMuscleGroup ? 0 : 1,
    row.equipmentCategory === outgoing.equipmentCategory ? 0 : 1,
    rank(row),
  ];

  return [...pool].sort((a, b) => {
    const [ka, kb] = [keys(a), keys(b)];
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
    }
    return a.title.localeCompare(b.title);
  });
}

/** The exercise at a position, or null if the plan has changed shape under us. */
export function exerciseAt(
  plan: Plan,
  dayIndex: number,
  exerciseIndex: number,
): PlanExercise | null {
  return plan.days[dayIndex]?.exercises[exerciseIndex] ?? null;
}

/** Template ids already used on a day — never offer an exercise twice. */
export function dayTemplateIds(plan: Plan, dayIndex: number): string[] {
  return (plan.days[dayIndex]?.exercises ?? []).map((exercise) => exercise.exerciseTemplateId);
}

/**
 * Builds the replacement exercise.
 *
 * `sets` (count and rep ranges) and `restSeconds` carry over VERBATIM, which is
 * what makes the session-length contract safe by construction rather than by
 * re-checking: `sessionSeconds()` reads exactly `sets.length` and `restSeconds`,
 * so a day computes to the same duration before and after a swap. A swap can
 * therefore never create a ±20% session-length violation.
 *
 * Two fields reset instead of carrying over. `weightKg`, because a load anchored
 * to a barbell bench press means nothing on a machine. `notes`, because a
 * caution written for one movement ranges from useless to actively dangerous on
 * another — an injury note about wrist position on a front squat must not follow
 * the swap onto a leg press.
 *
 * Rest is NOT re-derived for the new movement class. That would silently change
 * session arithmetic the user has already accepted, and it duplicates the
 * per-exercise rest tweak that is scoped separately.
 */
export function substitute(exercise: PlanExercise, replacement: CatalogRow): PlanExercise {
  return {
    exerciseTemplateId: replacement.id,
    name: replacement.title,
    restSeconds: exercise.restSeconds,
    notes: null,
    sets: exercise.sets.map((set) => ({ ...set, weightKg: null })),
  };
}

/**
 * Returns a copy of the plan with one exercise replaced, in place.
 *
 * Strictly positional: the swap happens at `(dayIndex, exerciseIndex)` and
 * nothing else moves. That is a sync-safety requirement, not tidiness — day
 * identity is the `dayIndex` → `sync_links` correspondence, so reordering or
 * removing days here would POST a new routine while stranding the old one in a
 * capped, delete-less API (knowledge/systems/hevy-sync.md).
 */
export function applySwap(
  plan: Plan,
  dayIndex: number,
  exerciseIndex: number,
  replacement: CatalogRow,
): Plan {
  return {
    ...plan,
    days: plan.days.map((day, d) =>
      d !== dayIndex
        ? day
        : {
            ...day,
            exercises: day.exercises.map((exercise, e) =>
              e !== exerciseIndex ? exercise : substitute(exercise, replacement),
            ),
          },
    ),
  };
}
