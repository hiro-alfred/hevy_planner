import type { PlanRequest } from "./schema";

// Turns a free-text goal + experience level into the numbers a plan needs:
// rep range, set count, rest, and how much of a session an exercise costs.
// Shared by the rule-based generator and the LLM prompt, so both produce plans
// with the same shape and the same session-length arithmetic.

export type GoalKind = "strength" | "hypertrophy" | "endurance";

/**
 * Keyword evidence for each goal kind, most-preferred first.
 *
 * Order is the tie-break, and hypertrophy leads because it is the documented
 * safe default: 8–12 at 90 s is the sane middle between 3–6 and 12–20, so a
 * goal that genuinely names two things lands there rather than at an extreme.
 *
 * "build" used to be a hypertrophy keyword and is not one — it is a generic
 * verb that "build strength" and "build a base" wear just as well.
 */
const GOAL_KEYWORDS: Array<[GoalKind, RegExp]> = [
  ["hypertrophy", /\b(hypertroph\w*|muscle|mass|size|bulk\w*|grow\w*|aesthetic\w*)\b/gi],
  ["strength", /\b(strength|strong(er|est)?|powerlift\w*|power|1rm|max|heavy)\b/gi],
  ["endurance", /\b(endurance|stamina|conditioning|cut|lean|fat.?loss|los(e|ing) fat|tone)\b/gi],
];

/**
 * Best-effort read of the free-text goal; hypertrophy is the safe default.
 *
 * Weight of evidence, not first match. First-match is what made the form's own
 * default text — "Build muscle and get stronger" — generate a 3–6 rep, 180 s
 * STRENGTH plan: the strength pattern was simply tested first, and "stronger"
 * hit it. A form whose untouched default contradicts its own wording is a bug on
 * any reading, and counting hits fixes it without hard-coding that one string.
 *
 * The real cure is `goalKind` on the request, which skips this function
 * entirely; this stays the fallback for free text and for stored requests made
 * before that field existed.
 */
export function classifyGoal(goal: string): GoalKind {
  let best: GoalKind = "hypertrophy";
  let bestHits = 0;

  for (const [kind, pattern] of GOAL_KEYWORDS) {
    const hits = (goal.match(pattern) ?? []).length;
    // Strictly greater, so an earlier (more-preferred) kind keeps a tie.
    if (hits > bestHits) {
      best = kind;
      bestHits = hits;
    }
  }

  return best;
}

export interface Prescription {
  goalKind: GoalKind;
  repRange: { start: number; end: number };
  restSeconds: number;
}

/**
 * The rep range and rest each goal implies.
 *
 * Exported because the progression engine (lib/records/progression.ts) infers a
 * lifter's current goal from the reps they actually log and then recommends
 * against the SAME bands the generator prescribes. Two copies of these numbers
 * would let a plan and its progression advice drift apart silently.
 */
export const BY_GOAL: Record<GoalKind, Omit<Prescription, "goalKind">> = {
  strength: { repRange: { start: 3, end: 6 }, restSeconds: 180 },
  hypertrophy: { repRange: { start: 8, end: 12 }, restSeconds: 90 },
  endurance: { repRange: { start: 12, end: 20 }, restSeconds: 60 },
};

/**
 * The numbers a request implies.
 *
 * An explicit `goalKind` wins outright: someone who picked "Strength" from a
 * three-item list has said something the free text can only be guessed at, and
 * a classifier that could overrule them would make the control a decoration.
 */
export function prescribe(request: PlanRequest): Prescription {
  const goalKind = request.goalKind ?? classifyGoal(request.goal);
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
