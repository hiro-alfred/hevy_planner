// Typed mirror of the write path in docs/hevy-openapi.json (spec v0.0.1).
// The API is explicitly unstable — on drift, re-fetch the spec, diff against the
// pinned copy, and update here (see knowledge/concepts/hevy-api.md).

export type HevySetType = "warmup" | "normal" | "failure" | "dropset";

export interface HevyRoutineSetPayload {
  type: HevySetType;
  weight_kg: number | null;
  reps: number | null;
  rep_range: { start: number; end: number } | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  custom_metric: number | null;
}

export interface HevyRoutineExercisePayload {
  exercise_template_id: string;
  superset_id: number | null; // read side is `supersets_id` (plural) — API quirk
  rest_seconds: number | null; // rest lives on the exercise, not the set
  notes: string | null;
  sets: HevyRoutineSetPayload[];
}

export interface HevyRoutinePayload {
  title: string;
  folder_id: number | null; // null = default "My Routines" folder
  notes: string;
  exercises: HevyRoutineExercisePayload[];
}

export interface HevyRoutine extends Omit<HevyRoutinePayload, "exercises"> {
  id: string;
  exercises: Array<
    Omit<HevyRoutineExercisePayload, "superset_id"> & {
      index: number;
      supersets_id: number | null;
    }
  >;
}

export interface HevyExerciseTemplate {
  id: string;
  title: string;
  type: string;
  primary_muscle_group: string;
  secondary_muscle_groups: string[];
  equipment_category: string;
  is_custom: boolean;
}

export interface HevyRoutineFolder {
  id: number;
  index: number;
  title: string;
}
