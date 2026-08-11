import type { CatalogRow } from "@/lib/hevy/catalog";
import { type DayContext, type Fit, fitAgainstDay } from "./muscle-balance";
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
  /**
   * What this option would cost the day, or null when it costs nothing.
   *
   * Weak fits are shown rather than hidden — a restrictive equipment list can
   * leave nothing but imperfect options, and an empty picker helps nobody — so
   * the honesty has to live in the row itself.
   */
  caveat: string | null;
}

/** A pool row with the day-fit it was ranked by. */
export interface RankedAlternative {
  row: CatalogRow;
  fit: Fit;
}

export function toAlternative({ row, fit }: RankedAlternative): Alternative {
  return {
    id: row.id,
    title: row.title,
    muscleGroup: row.primaryMuscleGroup,
    equipment: row.equipmentCategory,
    caveat: fit.caveat,
  };
}

/**
 * How close two fit scores must be before the tie-breakers get a say.
 *
 * Without a bucket the score is a float and effectively always decides, which
 * would throw away the equipment preference below. A twentieth is finer than
 * anyone can perceive in a list and coarse enough to leave real ties tied.
 */
const SCORE_BUCKET = 0.05;

/**
 * Orders a candidate pool for the exercise being replaced, against the DAY it
 * would join rather than against the outgoing exercise alone.
 *
 * Keys, most significant first:
 *   1. deficit — an option that would strip a muscle of the work this day was
 *      giving it sinks to the bottom, and does so before anything else is
 *      considered. This is the "do not remove the portion" half of the rule;
 *   2. surplus — an option that would pile more load onto a muscle the day
 *      already saturates sinks next. This is the "do not work the same muscle
 *      unnecessarily" half;
 *   3. day-fit score, bucketed — how much of the option's stimulus lands where
 *      this day actually needs it (see muscle-balance.ts);
 *   4. same equipment category as the outgoing exercise, because "the same
 *      thing but not this one" is what a swap usually means;
 *   5. the generator's own EQUIPMENT_RANK, so the list agrees with how the plan
 *      was built in the first place;
 *   6. title, purely so the order is stable — two runs of the picker must not
 *      reshuffle under the cursor.
 *
 * The old primary-versus-secondary key is gone because keys 1–3 subsume it: a
 * secondary-only match for the day's only chest movement now sinks for the
 * reason it deserves to sink (chest ends up untrained) rather than by a proxy
 * that also demoted perfectly good options.
 *
 * Stable in the strict sense: every key is derived from the row and the day, so
 * equal rows keep their incoming (catalog) order.
 */
export function rankAlternatives(
  pool: CatalogRow[],
  outgoing: CatalogRow,
  context: DayContext,
): RankedAlternative[] {
  const keys = (row: CatalogRow, fit: Fit): number[] => [
    fit.deficit,
    fit.surplus ? 1 : 0,
    -Math.round(fit.score / SCORE_BUCKET),
    row.equipmentCategory === outgoing.equipmentCategory ? 0 : 1,
    rank(row),
  ];

  return pool
    .map((row) => ({ row, fit: fitAgainstDay(row, context) }))
    .sort((a, b) => {
      const [ka, kb] = [keys(a.row, a.fit), keys(b.row, b.fit)];
      for (let i = 0; i < ka.length; i += 1) {
        if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
      }
      return a.row.title.localeCompare(b.row.title);
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
