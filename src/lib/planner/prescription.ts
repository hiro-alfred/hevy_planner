import type { PlanRequest } from "./schema";

// Turns a free-text goal + experience level into the numbers a plan needs:
// rep range, set count, rest, and how much of a session an exercise costs.
// Shared by the rule-based generator and the LLM prompt, so both produce plans
// with the same shape and the same session-length arithmetic.

export type GoalKind = "strength" | "hypertrophy" | "endurance";

const GOAL_KEYWORDS: Array<[GoalKind, RegExp]> = [
  ["strength", /\b(strength|strong(er|est)?|powerlift\w*|power|1rm|max|heavy)\b/i],
  ["endurance", /\b(endurance|stamina|conditioning|cut|lean|fat.?loss|tone)\b/i],
  ["hypertrophy", /\b(hypertroph|muscle|mass|size|bulk|grow|build)\b/i],
];

/** Best-effort read of the free-text goal; hypertrophy is the safe default. */
export function classifyGoal(goal: string): GoalKind {
  for (const [kind, pattern] of GOAL_KEYWORDS) {
    if (pattern.test(goal)) return kind;
  }
  return "hypertrophy";
}

export interface Prescription {
  goalKind: GoalKind;
  repRange: { start: number; end: number };
  restSeconds: number;
}

const BY_GOAL: Record<GoalKind, Omit<Prescription, "goalKind">> = {
  strength: { repRange: { start: 3, end: 6 }, restSeconds: 180 },
  hypertrophy: { repRange: { start: 8, end: 12 }, restSeconds: 90 },
  endurance: { repRange: { start: 12, end: 20 }, restSeconds: 60 },
};

export function prescribe(request: PlanRequest): Prescription {
  const goalKind = classifyGoal(request.goal);
  return { goalKind, ...BY_GOAL[goalKind] };
}

/** Working time for one set, before rest. A rep is roughly three seconds. */
export const SECONDS_PER_SET = 45;

/**
 * Seconds one set costs, work plus the rest that follows it.
 *
 * The final set's rest is counted too — it is the changeover to the next
 * exercise, and it is the formula the plan design specifies, so the generator
 * and the validator agree by construction.
 */
export function setSeconds(restSeconds: number): number {
  return SECONDS_PER_SET + restSeconds;
}

export function exerciseSeconds(sets: number, restSeconds: number): number {
  return sets * setSeconds(restSeconds);
}

/** Total session time implied by a day's exercises — the validation yardstick. */
export function sessionSeconds(exercises: Array<{ sets: unknown[]; restSeconds: number }>): number {
  return exercises.reduce(
    (total, exercise) => total + exerciseSeconds(exercise.sets.length, exercise.restSeconds),
    0,
  );
}

/** Beginners get simpler sessions; the cap is on exercises, not on effort. */
const MAX_EXERCISES: Record<PlanRequest["experience"], number> = {
  beginner: 6,
  intermediate: 8,
  advanced: 8,
};

export interface Volume {
  exerciseCount: number;
  setsPerExercise: number;
}

/**
 * Splits a session's time budget into exercises x sets.
 *
 * Both dials move, and that matters: with only an exercise cap, a 90-minute
 * session could never be filled (8 exercises x 3 sets is under an hour) and
 * would fail its own length validation. So exercises fill the time first, up to
 * the cap, and sets absorb whatever time is left over.
 */
export function planVolume(request: PlanRequest, prescription: Prescription): Volume {
  const perSet = setSeconds(prescription.restSeconds);
  const total = request.sessionMinutes * 60;

  const exerciseCount = Math.min(
    MAX_EXERCISES[request.experience],
    Math.max(3, Math.floor(total / (3 * perSet))),
  );
  // The upper bound has to be generous enough that a long session with short
  // rests is still reachable — a beginner's 90-minute conditioning session hits
  // the exercise cap first, so the sets have to carry the rest of the time.
  const setsPerExercise = Math.min(8, Math.max(2, Math.round(total / (exerciseCount * perSet))));

  return { exerciseCount, setsPerExercise };
}
