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
  /**
   * The equipment enum value.
   *
   * THE PINNED SPEC IS WRONG HERE. docs/hevy-openapi.json declares this property
   * as `equipment_category`, but the live API sends `equipment` — verified
   * against all 452 templates on a real account, none of which carried
   * `equipment_category`. Trusting the spec made this `undefined` for every row,
   * which the catalog write then failed on. See knowledge/concepts/hevy-api.md.
   */
  equipment?: string;
  /** Only if Hevy ever ships the spec's name; never seen in practice. */
  equipment_category?: string;
  is_custom: boolean;
}

export interface HevyRoutineFolder {
  id: number;
  index: number;
  title: string;
}

// ---------------------------------------------------------------------------
// Read path: workouts (the logged training history).
//
// Routines are what the user PLANS; workouts are what they actually did. Only
// the latter carries real weights and reps, so every record and every
// progression recommendation is derived from these shapes.
//
// Every numeric field on a set is nullable, and that is not defensive typing:
// one Hevy set genuinely carries only the metrics its exercise type uses, so a
// plank set has duration and null weight/reps, while a bodyweight set can have
// null weight AND real reps.
// ---------------------------------------------------------------------------

export interface HevyWorkoutSet {
  index: number;
  /**
   * Documented as the same four values as HevySetType, but typed loosely on
   * purpose: this is a READ, and an unknown fifth value must land in the cache
   * as-is rather than fail a walk of a decade of training history. Metric code
   * filters on the known values instead.
   */
  type: string;
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  custom_metric: number | null;
}

export interface HevyWorkoutExercise {
  index: number;
  title: string;
  notes: string | null;
  exercise_template_id: string;
  supersets_id: number | null; // read side is plural — same quirk as routines
  sets: HevyWorkoutSet[];
}

export interface HevyWorkout {
  id: string;
  title: string;
  routine_id: string | null;
  description: string | null;
  start_time: string;
  end_time: string | null;
  /** The delta feed's cursor field: what `events?since=` is compared against. */
  updated_at: string;
  created_at: string;
  exercises: HevyWorkoutExercise[];
}

/**
 * One entry from `/v1/workouts/events`. A discriminated union because the two
 * arms share no fields — a delete carries only an id, so a cache update must
 * narrow on `type` before touching anything.
 */
export type HevyWorkoutEvent =
  | { type: "updated"; workout: HevyWorkout }
  | { type: "deleted"; id: string; deleted_at: string };
