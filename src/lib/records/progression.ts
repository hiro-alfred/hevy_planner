import { BY_GOAL, type GoalKind } from "@/lib/planner/prescription";
import type { ExerciseSession } from "./metrics";

// Progressive-overload engine: what to do next, from what was actually logged.
//
// DETERMINISTIC, not LLM-driven, and that is a design decision rather than a
// stopgap. Progression is arithmetic over a handful of sets — an LLM would add
// nondeterminism, latency and an API key requirement to a calculation whose
// correct answer is not in dispute. It also has to work with no provider
// configured, exactly like the rule-based plan generator it sits beside.
//
// The strategy is DOUBLE PROGRESSION: reps climb inside a fixed range, and only
// when every set reaches the top of the range does the weight move and the reps
// reset to the bottom. It is the same progression the generated plans describe
// in prose, which is why the rep bands are imported from prescription.ts rather
// than restated here.
//
// Pure: no database, no clock of its own, no Hevy access. `now` is a parameter.

export type RecommendationKind = "add_weight" | "add_reps" | "hold" | "deload" | "baseline";

export interface Recommendation {
  kind: RecommendationKind;
  /** Null when the exercise carries no external load (a bodyweight movement). */
  targetWeightKg: number | null;
  targetReps: number;
  repRange: { start: number; end: number };
  /** Inferred from the reps logged, not from any plan this exercise appears in. */
  goalKind: GoalKind;
  /** One sentence, written for the lifter. */
  reason: string;
}

export interface ProgressionInput {
  sessions: ExerciseSession[];
  /** Hevy exercise type, e.g. weight_reps, reps_only, bodyweight_assisted. */
  exerciseType: string;
  /** Hevy equipment category; sets the smallest load step available. */
  equipmentCategory: string;
}

/**
 * Smallest load step the equipment allows.
 *
 * Dumbbells come in 2 kg pairs and kettlebells in 4 kg jumps in most gyms, so a
 * 2.5 kg recommendation on either is advice the lifter cannot follow. A
 * heuristic, deliberately not configurable yet — one dial per gym is a setting
 * to add when a real gym disagrees, not before.
 */
const INCREMENT_KG: Record<string, number> = {
  dumbbell: 2,
  kettlebell: 4,
};
const DEFAULT_INCREMENT_KG = 2.5;

/** Sessions to look back over when inferring the working rep range. */
const BAND_WINDOW = 3;

/** Repeats at the same weight without progress before the weight comes down. */
const STALL_SESSIONS = 3;

/** A layoff long enough that the last session no longer describes the lifter. */
const LAYOFF_DAYS = 28;

/**
 * The most sessions any rule here reads.
 *
 * Exported so a caller loading history can fetch exactly this many per exercise
 * instead of a whole training career — the newest three sessions are all the
 * evidence the rules below ever consult, and `getRecentSessions` derives its
 * default from this constant so the two cannot drift apart.
 */
export const PROGRESSION_WINDOW = Math.max(BAND_WINDOW, STALL_SESSIONS);

const DELOAD_FACTOR = 0.9;

/** Assistance makes a lift EASIER, so less of it is the harder set. */
function assistanceBased(exerciseType: string): boolean {
  return exerciseType === "bodyweight_assisted";
}

function roundToIncrement(value: number, increment: number): number {
  return Number((Math.round(value / increment) * increment).toFixed(2));
}

interface WorkingSet {
  weightKg: number | null;
  reps: number;
}

/** Sets with real reps. Warm-ups are already gone — metrics.ts filters them. */
function workingSets(session: ExerciseSession): WorkingSet[] {
  return session.sets
    .filter((set) => set.reps !== null && set.reps >= 1)
    .map((set) => ({ weightKg: set.weightKg, reps: set.reps! }));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Reads the lifter's goal off the reps they log, rather than asking.
 *
 * Someone doing sets of 5 is training strength whatever a plan's free-text goal
 * says, and the rep range that matters for the next session is the one they are
 * actually working in. Median over the recent window so one AMRAP set at the end
 * of a session cannot reclassify the whole exercise.
 */
function inferGoal(sessions: ExerciseSession[]): GoalKind {
  const reps = sessions.slice(0, BAND_WINDOW).flatMap((s) => workingSets(s).map((set) => set.reps));
  if (reps.length === 0) return "hypertrophy";
  const typical = median(reps);
  if (typical <= BY_GOAL.strength.repRange.end) return "strength";
  if (typical <= BY_GOAL.hypertrophy.repRange.end) return "hypertrophy";
  return "endurance";
}

/** The hardest load in a session: heaviest normally, least assistance if assisted. */
function topWeight(sets: WorkingSet[], assisted: boolean): number | null {
  const weights = sets.map((s) => s.weightKg).filter((w): w is number => w !== null && w > 0);
  if (weights.length === 0) return null;
  return assisted ? Math.min(...weights) : Math.max(...weights);
}

/** Sets performed at the session's hardest load — the ones progression judges. */
function setsAtTop(sets: WorkingSet[], top: number | null): WorkingSet[] {
  if (top === null) return sets;
  return sets.filter((set) => set.weightKg === top);
}

function daysBetween(from: string, to: Date): number {
  return (to.getTime() - new Date(from).getTime()) / 86_400_000;
}

/**
 * Three sessions in a row at the same load with no added reps.
 *
 * Total reps rather than best set: adding a rep to the last set is real progress
 * even when the top set is unchanged, and calling that a stall would deload a
 * lifter who is moving forward.
 */
function isStalled(sessions: ExerciseSession[], top: number | null, assisted: boolean): boolean {
  if (sessions.length < STALL_SESSIONS) return false;
  const window = sessions.slice(0, STALL_SESSIONS);

  let previousTotal: number | null = null;
  for (const session of window) {
    const sets = workingSets(session);
    if (topWeight(sets, assisted) !== top) return false;
    const total = setsAtTop(sets, top).reduce((sum, set) => sum + set.reps, 0);
    // Sessions run newest first, so "no progress" means each older session was
    // at least as good as the newer one.
    if (previousTotal !== null && total < previousTotal) return false;
    previousTotal = total;
  }
  return true;
}

/** Bodyweight work has no load to add, so reps are the only dial. */
function bodyweightAdvice(
  sets: WorkingSet[],
  range: { start: number; end: number },
  goalKind: GoalKind,
): Recommendation {
  const bestReps = Math.max(...sets.map((set) => set.reps));
  if (sets.every((set) => set.reps >= range.end)) {
    return {
      kind: "hold",
      targetWeightKg: null,
      targetReps: range.end,
      repRange: range,
      goalKind,
      reason: `Every set is at ${range.end} reps — there is no weight to add here, so move to a harder variation or start adding load.`,
    };
  }
  return {
    kind: "add_reps",
    targetWeightKg: null,
    targetReps: Math.min(bestReps + 1, range.end),
    repRange: range,
    goalKind,
    reason: `Add a rep. Keep going until every set reaches ${range.end}.`,
  };
}

/**
 * What to do in the next session with this exercise.
 *
 * @param now injected so the layoff rule is testable and the function stays pure.
 */
export function recommendProgression(
  { sessions, exerciseType, equipmentCategory }: ProgressionInput,
  now: Date = new Date(),
): Recommendation {
  const goalKind = inferGoal(sessions);
  const range = BY_GOAL[goalKind].repRange;
  const assisted = assistanceBased(exerciseType);
  const increment = INCREMENT_KG[equipmentCategory] ?? DEFAULT_INCREMENT_KG;

  const latest = sessions[0];
  const latestSets = latest ? workingSets(latest) : [];

  // One session is a data point, not a trend: it cannot show whether the last
  // weight was easy or brutal, so the honest answer is to log one more.
  if (sessions.length < 2 || latestSets.length === 0) {
    const top = topWeight(latestSets, assisted);
    return {
      kind: "baseline",
      targetWeightKg: top,
      targetReps: range.start,
      repRange: range,
      goalKind,
      reason:
        sessions.length === 0
          ? "No sets logged for this exercise yet — log one session and a recommendation appears here."
          : "Only one session logged. Repeat it and log the result; two sessions are the minimum for a progression.",
    };
  }

  const top = topWeight(latestSets, assisted);

  // A layoff outranks every other rule: whatever the last session showed, it
  // describes a lifter from a month ago.
  const layoff = daysBetween(latest!.startTime, now);
  if (layoff > LAYOFF_DAYS) {
    const eased = top === null ? null : roundToIncrement(top * DELOAD_FACTOR, increment);
    return {
      kind: "deload",
      targetWeightKg: eased,
      targetReps: range.start,
      repRange: range,
      goalKind,
      reason: `It has been ${Math.round(layoff)} days since this exercise was trained. Start back about 10% lighter and rebuild.`,
    };
  }

  if (top === null) return bodyweightAdvice(latestSets, range, goalKind);

  const working = setsAtTop(latestSets, top);
  const bestReps = Math.max(...working.map((set) => set.reps));
  const worstReps = Math.min(...working.map((set) => set.reps));
  // Assistance goes DOWN to get harder; load goes up.
  const nextWeight = assisted
    ? Math.max(0, roundToIncrement(top - increment, increment))
    : roundToIncrement(top + increment, increment);

  if (worstReps >= range.end) {
    return {
      kind: "add_weight",
      targetWeightKg: nextWeight,
      targetReps: range.start,
      repRange: range,
      goalKind,
      reason: assisted
        ? `Every set hit ${range.end} reps, so cut the assistance to ${nextWeight} kg and rebuild from ${range.start} reps.`
        : `Every set hit ${range.end} reps at ${top} kg. Move up to ${nextWeight} kg and start again at ${range.start} reps.`,
    };
  }

  if (isStalled(sessions, top, assisted)) {
    const eased = roundToIncrement(top * DELOAD_FACTOR, increment);
    return {
      kind: "deload",
      // A 10% cut that rounds back to the same number is not a deload; step
      // down at least once, and never below the bar itself.
      targetWeightKg: eased < top ? eased : Math.max(0, roundToIncrement(top - increment, increment)),
      targetReps: range.start,
      repRange: range,
      goalKind,
      reason: `${STALL_SESSIONS} sessions at ${top} kg with no added reps. Drop about 10% and build back up — the reps come faster the second time.`,
    };
  }

  if (worstReps >= range.start) {
    return {
      kind: "add_reps",
      targetWeightKg: top,
      targetReps: Math.min(bestReps + 1, range.end),
      repRange: range,
      goalKind,
      reason: `Stay at ${top} kg and add a rep. The weight goes up once every set reaches ${range.end}.`,
    };
  }

  return {
    kind: "hold",
    targetWeightKg: top,
    targetReps: range.start,
    repRange: range,
    goalKind,
    reason: `Some sets are under ${range.start} reps at ${top} kg. Repeat this weight until every set clears ${range.start}.`,
  };
}
