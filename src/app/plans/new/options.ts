// The choice lists behind the plan request's fixed fields.
//
// A plain module, extracted when the profile page grew a second form over the
// same questions. Two copies of these arrays would drift the first time a split
// is renamed, and the drift would be invisible: both forms would still compile,
// still submit, and quietly disagree about what the user picked.
//
// Labels here are the wording, not the values — the values must match
// planRequestSchema and savedProfileSchema.

export const SESSIONS = [2, 3, 4, 5, 6];
export const MINUTES = [30, 45, 60, 75, 90];

export const SPLITS = [
  { value: "auto", label: "Pick for me" },
  { value: "full_body", label: "Full body" },
  { value: "upper_lower", label: "Upper / lower" },
  { value: "push_pull_legs", label: "Push / pull / legs" },
];

export const EXPERIENCE = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

/**
 * The rep range and rest, statable rather than guessable.
 *
 * "Read it from what I wrote" stays the default so the goal sentence keeps
 * meaning something — a select that silently overrode the text would be worse
 * than the guessing it replaced. Picking one pins it beyond argument.
 */
export const GOAL_KINDS = [
  { value: "", label: "Read it from what I wrote" },
  { value: "hypertrophy", label: "Muscle — 8-12 reps, 90s rest" },
  { value: "strength", label: "Strength — 3-6 reps, 3min rest" },
  { value: "endurance", label: "Endurance — 12-20 reps, 60s rest" },
];

/** Prefixed to a select whose value is optional on the profile but not on a plan. */
export const NO_DEFAULT = { value: "", label: "No default — ask me each time" };
