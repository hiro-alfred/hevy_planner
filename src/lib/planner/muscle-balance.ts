import type { CatalogRow } from "@/lib/hevy/catalog";
import type { PlanDay, PlanExercise } from "./schema";

// Muscle-balance arithmetic for the swap picker
// (knowledge/decisions/exercise-alternatives.md).
//
// The picker used to rank alternatives against the OUTGOING EXERCISE ALONE,
// which let it hand back two kinds of redundant recommendation:
//
//   - it removed a portion the day was meant to get. The pool query matches
//     primary OR secondary muscle, so swapping a bench press could return a
//     close-grip press that merely lists chest as a secondary — and a day whose
//     only chest movement was that bench ends up with half the chest work;
//   - it worked a muscle the day already covers. Nothing looked at the
//     neighbouring exercises, so a chest fly could be replaced by a triceps-
//     heavy press on a day that already ran two triceps movements.
//
// Both are answered by measuring the DAY rather than the exercise, and each has
// its own number below: `coverage` (how much of the work the day is about to
// lose does this option put back) and `waste` (how much of its stimulus lands
// on muscles the day already covers).
//
// Pure, like the rest of the swap's arithmetic — no database, no network. The
// caller resolves catalog rows in one batch query and passes them in.

/**
 * What a secondary muscle is worth against a primary one.
 *
 * A secondary group takes real stimulus — the triceps in a bench press are not
 * a rounding error — but not a working set's worth. Half is the coarse, honest
 * number; anything finer would be inventing per-exercise physiology the catalog
 * does not carry.
 */
export const SECONDARY_WEIGHT = 0.5;

/**
 * Weighted sets at which a muscle counts as half-served on one day.
 *
 * Only ever the midpoint of the `need` curve, never a target to hit: it sets
 * how fast a muscle stops wanting more work, not how much anyone should do.
 */
const REFERENCE_SETS = 4;

/** Past this, a day already has plenty of a muscle and more is piling on. */
const SATURATED_SETS = 6;

/** A muscle keeping less than this share of its work has lost its portion. */
const DEFICIT_SHARE = 0.75;

/** Below this a muscle's coverage is incidental, and losing it is not news. */
const MINIMUM_PORTION = 1;

/** Float slack: these are sums of halves, so exact comparison is unsafe. */
const EPSILON = 1e-6;

/** Weighted working sets per muscle group. */
export type MuscleProfile = Map<string, number>;

/** "upper_back" -> "upper back", for the middle of a sentence. */
function muscleName(group: string): string {
  return group.replace(/_/g, " ");
}

/**
 * Working sets for one exercise — warm-ups are not volume.
 *
 * The fallback matters: the generator never writes an all-warm-up exercise, but
 * a hand-edited plan can be anything, and a zero there would flatten every
 * candidate to the same score and silently disable the whole ranking.
 */
export function workingSets(exercise: PlanExercise): number {
  const working = exercise.sets.filter((set) => set.type !== "warmup").length;
  return working > 0 ? working : exercise.sets.length;
}

/** One exercise's muscle weights: primary at 1, each secondary at 0.5. */
function weights(row: CatalogRow): Array<[string, number]> {
  return [
    [row.primaryMuscleGroup, 1],
    ...(row.secondaryMuscleGroups ?? []).map((group): [string, number] => [
      group,
      SECONDARY_WEIGHT,
    ]),
  ];
}

function addLoad(profile: MuscleProfile, row: CatalogRow, sets: number): void {
  for (const [group, weight] of weights(row)) {
    profile.set(group, (profile.get(group) ?? 0) + weight * sets);
  }
}

/**
 * How much a muscle still wants work, given what the REST of the day gives it.
 *
 * A hyperbola rather than a cliff: 1.0 at no coverage, 0.5 at REFERENCE_SETS,
 * approaching but never reaching zero. Diminishing returns are the point — it
 * is what makes stimulus spent on an already-hammered muscle cost something
 * without ever making it forbidden.
 */
function need(covered: number): number {
  return REFERENCE_SETS / (REFERENCE_SETS + covered);
}

export interface DayContext {
  /** Coverage from the day's OTHER exercises — the outgoing one left out. */
  base: MuscleProfile;
  /** Coverage as the day stands right now, outgoing exercise included. */
  before: MuscleProfile;
  /** What the outgoing exercise contributes, i.e. what the swap must replace. */
  gap: MuscleProfile;
  /** Working sets the replacement inherits verbatim (see `substitute`). */
  sets: number;
}

/**
 * Measures the day around the exercise being replaced.
 *
 * `rows` is a batch lookup of every template id on the day; an id the catalog
 * cannot resolve contributes nothing rather than aborting the picker.
 *
 * The replacement's set count is the outgoing exercise's, because `substitute`
 * carries `sets` over verbatim. That is what makes `before` and `after`
 * comparable: only the muscle weights differ between them, never the volume, so
 * a swap can move the day's balance around but never change its size.
 */
export function buildDayContext(
  day: PlanDay,
  exerciseIndex: number,
  rows: Map<string, CatalogRow>,
): DayContext {
  const base: MuscleProfile = new Map();
  const gap: MuscleProfile = new Map();
  let sets = 0;

  day.exercises.forEach((exercise, index) => {
    const row = rows.get(exercise.exerciseTemplateId);
    if (index === exerciseIndex) {
      sets = workingSets(exercise);
      if (row) addLoad(gap, row, sets);
      return;
    }
    if (row) addLoad(base, row, workingSets(exercise));
  });

  const before: MuscleProfile = new Map(base);
  for (const [group, load] of gap) before.set(group, (before.get(group) ?? 0) + load);

  return { base, before, gap, sets };
}

export interface Fit {
  /** 0–1: the share of the outgoing exercise's work this option puts back. */
  coverage: number;
  /** 0–1: the share of its stimulus spent on muscles the day already covers. */
  waste: number;
  /** `coverage - waste`. Higher is a better fit for THIS day. */
  score: number;
  /** 0 fine, 1 a muscle loses most of its work, 2 a muscle loses all of it. */
  deficit: 0 | 1 | 2;
  /** True when the swap ADDS load to a muscle the day already saturates. */
  surplus: boolean;
  /** One plain sentence naming the problem, or null when the option fits. */
  caveat: string | null;
}

/** The muscle this swap would rob worst: emptied before merely thinned. */
function worstLoss(ctx: DayContext, after: MuscleProfile): { group: string; emptied: boolean } | null {
  let worst: { group: string; emptied: boolean; drop: number } | null = null;

  for (const [group, had] of ctx.before) {
    if (had < MINIMUM_PORTION) continue;
    const left = after.get(group) ?? 0;
    if (left >= had * DEFICIT_SHARE - EPSILON) continue;

    const candidate = { group, emptied: left <= EPSILON, drop: had - left };
    const better =
      worst === null ||
      (candidate.emptied && !worst.emptied) ||
      (candidate.emptied === worst.emptied && candidate.drop > worst.drop);
    if (better) worst = candidate;
  }

  return worst && { group: worst.group, emptied: worst.emptied };
}

/** The most-covered muscle this swap would add still more load to. */
function worstPileOn(ctx: DayContext, after: MuscleProfile): string | null {
  let worst: string | null = null;
  for (const [group, now] of after) {
    if (now < SATURATED_SETS || now <= (ctx.before.get(group) ?? 0) + EPSILON) continue;
    if (worst === null || now > (after.get(worst) ?? 0)) worst = group;
  }
  return worst;
}

/**
 * Scores one candidate against the day it would join.
 *
 * Two numbers, one per failure mode:
 *
 *   coverage — of the work the outgoing exercise was giving this day, how much
 *     does this option put back. A chest press replacing a chest press restores
 *     all of it (1.0); a triceps movement that lists chest as a secondary
 *     restores half (0.5), which is the "do not remove the portion" rule
 *     expressed as a number rather than as a filter.
 *
 *   waste — of the stimulus this option adds BEYOND what it is replacing, how
 *     much lands on muscles the rest of the day already covers, discounted by
 *     `need` so hitting a fresh muscle costs nothing and hitting a hammered one
 *     costs nearly full price. This is the "do not work the same muscle
 *     unnecessarily" rule. It is why, on a day already carrying two triceps
 *     movements, a plain chest fly beats a triceps-heavy incline press even
 *     though both restore the chest work in full.
 *
 * `deficit` and `surplus` are reported separately rather than folded into the
 * score, because they are not preferences — they are the two failures, and the
 * picker sinks and labels them rather than hiding them. A short pool on a
 * restrictive equipment list can leave nothing but imperfect options, and an
 * empty picker helps nobody.
 */
export function fitAgainstDay(candidate: CatalogRow, ctx: DayContext): Fit {
  const after: MuscleProfile = new Map(ctx.base);
  addLoad(after, candidate, ctx.sets);

  let restored = 0;
  let wasted = 0;
  let added = 0;
  for (const [group, weight] of weights(candidate)) {
    const load = weight * ctx.sets;
    const fills = Math.min(load, ctx.gap.get(group) ?? 0);
    restored += fills;
    wasted += (load - fills) * (1 - need(ctx.base.get(group) ?? 0));
    added += load;
  }

  const totalGap = [...ctx.gap.values()].reduce((sum, load) => sum + load, 0);
  // No gap means the outgoing exercise is not in the catalog, so there is
  // nothing to restore and nothing an option can fail to restore.
  const coverage = totalGap > EPSILON ? restored / totalGap : 1;
  const waste = added > EPSILON ? wasted / added : 0;

  const loss = worstLoss(ctx, after);
  const pileOn = worstPileOn(ctx, after);

  let caveat: string | null = null;
  if (loss !== null) {
    caveat = loss.emptied
      ? `Leaves ${muscleName(loss.group)} untrained on this day`
      : `Leaves this day short on ${muscleName(loss.group)}`;
  } else if (pileOn !== null) {
    caveat = `This day already has plenty of ${muscleName(pileOn)}`;
  }

  return {
    coverage,
    waste,
    score: coverage - waste,
    deficit: loss === null ? 0 : loss.emptied ? 2 : 1,
    surplus: pileOn !== null,
    caveat,
  };
}
