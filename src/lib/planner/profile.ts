import type { MuscleGroup } from "@/lib/hevy/constants";
import type { CurrentLifts, PlanRequest } from "./schema";

// The optional trainee profile: what the extra intake fields mean, and what is
// DERIVED from them rather than asked for.
//
// Nothing here is a question on the form. Bodyweight versus target weight is a
// phase; relative strength is something the model infers from the anchors. The
// rule is that a field only exists if something consumes it — so the derivations
// live beside the fields they consume.

export type Phase = "cut" | "maintain" | "bulk";

/** Inside this band of the target, the trainee is holding weight, not chasing it. */
const MAINTAIN_BAND_KG = 2;

/**
 * Reads a training phase out of current versus target bodyweight.
 *
 * This is the ONLY reason targetWeightKg is collected — the raw number never
 * reaches the model. A phase changes real things: a deficit means holding load
 * rather than chasing PRs, a surplus licenses weekly jumps.
 */
export function derivePhase(request: PlanRequest): Phase | null {
  const { bodyweightKg, targetWeightKg } = request;
  if (bodyweightKg === undefined || targetWeightKg === undefined) return null;

  const delta = targetWeightKg - bodyweightKg;
  if (Math.abs(delta) <= MAINTAIN_BAND_KG) return "maintain";
  return delta < 0 ? "cut" : "bulk";
}

const PHASE_GUIDANCE: Record<Phase, string> = {
  cut: "The trainee is in a deficit. Keep volume at maintenance, favour holding load over adding it, and say so in the progression paragraph. Conditioning finishers are welcome.",
  maintain:
    "The trainee is holding bodyweight. Progress load steadily; nothing needs to be held back.",
  bulk: "The trainee is in a surplus. The progression paragraph may authorise adding load week to week.",
};

export function describePhase(phase: Phase): string {
  return PHASE_GUIDANCE[phase];
}

/** True when at least one anchor lift is known. */
export function hasAnchors(lifts: CurrentLifts | undefined): lifts is CurrentLifts {
  return (
    lifts !== undefined &&
    Object.values(lifts).some((value) => typeof value === "number" && value > 0)
  );
}

const LIFT_LABELS: Array<[keyof CurrentLifts, string]> = [
  ["squatKg", "Back squat"],
  ["benchKg", "Bench press"],
  ["deadliftKg", "Deadlift"],
  ["overheadPressKg", "Overhead press"],
];

/** "Back squat 100 kg, Bench press 80 kg" — only the lifts actually given. */
export function describeLifts(lifts: CurrentLifts): string {
  return LIFT_LABELS.filter(([key]) => typeof lifts[key] === "number")
    .map(([key, label]) => `${label} ${lifts[key]} kg`)
    .join(", ");
}

/**
 * Muscle groups offered as an emphasis choice.
 *
 * A curated subset of the Hevy enum: "cardio", "full_body" and "other" are not
 * things anyone emphasises, and offering them would produce a candidate query
 * that widens to nothing useful.
 */
export const FOCUS_MUSCLE_GROUPS = [
  "chest",
  "lats",
  "upper_back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "abdominals",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
] as const satisfies readonly MuscleGroup[];

/** "upper_back" -> "Upper back". Enough for a checkbox label. */
export function muscleGroupLabel(group: string): string {
  const spaced = group.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
