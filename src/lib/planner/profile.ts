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
 * LEGACY as of 2026-08-11: the form asks for the phase outright now. This is
 * kept only for requests stored before that, which carry a target weight and no
 * phase — a regenerate or a fork of one of those must still produce the plan it
 * produced the first time. New requests never reach it.
 *
 * Its weakness is the reason it was replaced: it needs BOTH weights, so a
 * trainee who gave a bodyweight and no target got no phase at all.
 *
 * Takes the two weights rather than a whole PlanRequest so the plan form can
 * call it with a PARTIAL request — the shape a saved profile has. A full
 * request still satisfies it; nothing at the existing call sites changes.
 */
export function derivePhase(
  request: Pick<PlanRequest, "bodyweightKg" | "targetWeightKg">,
): Phase | null {
  const { bodyweightKg, targetWeightKg } = request;
  if (bodyweightKg === undefined || targetWeightKg === undefined) return null;

  const delta = targetWeightKg - bodyweightKg;
  if (Math.abs(delta) <= MAINTAIN_BAND_KG) return "maintain";
  return delta < 0 ? "cut" : "bulk";
}

/**
 * The trainee's phase: what they said, or failing that what their old request
 * implies. One call site's worth of compatibility, in one place.
 */
export function resolvePhase(request: PlanRequest): Phase | null {
  return request.phase ?? derivePhase(request);
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
