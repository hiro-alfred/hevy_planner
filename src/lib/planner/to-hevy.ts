import { createHash } from "node:crypto";
import type { HevyRoutineExercisePayload, HevyRoutinePayload } from "@/lib/hevy/types";
import type { PlanDay, PlanExercise } from "./schema";

// Translation layer: internal plan model -> Hevy routine payload.
//
// The two shapes are deliberately different (knowledge/decisions/plan-pipeline.md),
// so every field the API expects is set explicitly here — including the ones we
// never use. The spec does not document which fields are optional, so omitting
// them is a gamble; sending explicit nulls is not.

function toSets(exercise: PlanExercise) {
  return exercise.sets.map((set) => ({
    type: set.type,
    // kg is the only internal unit — the API has no unit field at all.
    weight_kg: set.weightKg,
    // A set carries EITHER a fixed rep count or a range; we always plan ranges.
    reps: null,
    rep_range: { start: set.repRange.start, end: set.repRange.end },
    distance_meters: null,
    duration_seconds: null,
    custom_metric: null,
  }));
}

function toExercise(exercise: PlanExercise): HevyRoutineExercisePayload {
  return {
    exercise_template_id: exercise.exerciseTemplateId,
    // No supersets in phase 1. Write field is superset_id; the read side calls
    // it supersets_id — normalising that quirk belongs here if we ever read back.
    superset_id: null,
    // Rest lives on the exercise, not the set.
    rest_seconds: exercise.restSeconds,
    notes: exercise.notes,
    sets: toSets(exercise),
  };
}

/**
 * One training day becomes one Hevy routine.
 *
 * Ordering is array order — `index` exists on reads but is not writable — so the
 * plan's exercise order is the routine's exercise order.
 */
export function dayToRoutine(
  day: PlanDay,
  folderId: number | null,
  notes: string,
): HevyRoutinePayload {
  return {
    title: day.title,
    folder_id: folderId,
    notes,
    exercises: day.exercises.map(toExercise),
  };
}

/**
 * Fingerprint of what was pushed for a day.
 *
 * Hashing the ROUTINE PAYLOAD rather than the plan day means the hash changes
 * exactly when the bytes Hevy would receive change: a rename in our model that
 * doesn't reach the API won't trigger a pointless PUT, and a mapping change that
 * does reach it won't be missed.
 */
export function routineHash(routine: HevyRoutinePayload): string {
  return createHash("sha256").update(JSON.stringify(routine)).digest("hex");
}
