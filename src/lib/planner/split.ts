import type { MuscleGroup } from "@/lib/hevy/constants";
import type { PlanRequest } from "./schema";

// Maps a requested split onto concrete training days. This is the piece that
// decides WHICH muscle groups each day trains — and therefore which catalog
// candidates that day is allowed to draw from.
//
// Candidates are fetched per training day, never once per plan: getCandidates
// returns one flat ordered list, so a whole-plan query can let `limit`
// alphabetically starve a muscle group (see knowledge/systems/catalog-service.md).

export interface TrainingDayTemplate {
  title: string;
  /** Muscle groups this day trains, in priority order. */
  muscleGroups: MuscleGroup[];
}

const PUSH: TrainingDayTemplate = {
  title: "Push",
  muscleGroups: ["chest", "shoulders", "triceps"],
};

const PULL: TrainingDayTemplate = {
  title: "Pull",
  muscleGroups: ["lats", "upper_back", "biceps", "traps"],
};

const LEGS: TrainingDayTemplate = {
  title: "Legs",
  muscleGroups: ["quadriceps", "hamstrings", "glutes", "calves"],
};

const UPPER: TrainingDayTemplate = {
  title: "Upper",
  muscleGroups: ["chest", "lats", "upper_back", "shoulders", "biceps", "triceps"],
};

const LOWER: TrainingDayTemplate = {
  title: "Lower",
  muscleGroups: ["quadriceps", "hamstrings", "glutes", "calves", "abdominals"],
};

const FULL_BODY: TrainingDayTemplate = {
  title: "Full Body",
  muscleGroups: [
    "quadriceps",
    "chest",
    "lats",
    "hamstrings",
    "shoulders",
    "glutes",
    "upper_back",
    "abdominals",
  ],
};

const CYCLES: Record<Exclude<PlanRequest["split"], "auto">, TrainingDayTemplate[]> = {
  push_pull_legs: [PUSH, PULL, LEGS],
  upper_lower: [UPPER, LOWER],
  full_body: [FULL_BODY],
};

/**
 * Picks a split when the user asked for "auto".
 *
 * Frequency drives the choice: a split only works if every muscle group gets
 * trained often enough, so few sessions means fewer, broader days.
 */
export function resolveSplit(
  split: PlanRequest["split"],
  sessionsPerWeek: number,
): Exclude<PlanRequest["split"], "auto"> {
  if (split !== "auto") return split;
  if (sessionsPerWeek <= 2) return "full_body";
  if (sessionsPerWeek <= 4) return "upper_lower";
  return "push_pull_legs";
}

/**
 * Expands a split into exactly `sessionsPerWeek` training days.
 *
 * The cycle repeats until the week is full; repeated days are suffixed A/B/C so
 * the routine titles stay distinct in Hevy (where they become routine names).
 */
export function buildTrainingDays(request: PlanRequest): TrainingDayTemplate[] {
  const cycle = CYCLES[resolveSplit(request.split, request.sessionsPerWeek)];
  const days: TrainingDayTemplate[] = [];

  for (let i = 0; i < request.sessionsPerWeek; i += 1) {
    days.push({ ...cycle[i % cycle.length]! });
  }

  // Suffix only the titles that actually recur, so a 3-day PPL stays "Push",
  // "Pull", "Legs" rather than "Push A", "Pull A", "Legs A".
  const counts = new Map<string, number>();
  for (const day of days) counts.set(day.title, (counts.get(day.title) ?? 0) + 1);

  const seen = new Map<string, number>();
  return days.map((day) => {
    if ((counts.get(day.title) ?? 0) < 2) return day;
    const n = (seen.get(day.title) ?? 0) + 1;
    seen.set(day.title, n);
    return { ...day, title: `${day.title} ${String.fromCharCode(64 + n)}` };
  });
}
