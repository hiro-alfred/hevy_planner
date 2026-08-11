import { inArray } from "drizzle-orm";
import type { db } from "@/lib/db/client";
import { workouts, workoutSets } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/errors";
import type { HevyWorkout } from "./types";

// Turning a Hevy workout into cache rows, and writing them.
//
// Split out of workout-sync.ts so that file stays about the two sync STRATEGIES
// (backfill vs delta) rather than about column mapping. Everything here is
// shared by both.

type WorkoutRow = typeof workouts.$inferInsert;
type SetRow = typeof workoutSets.$inferInsert;

/** Drizzle hands a transaction the same query surface as the base client. */
export type Db = typeof db;

export interface MappedWorkout {
  workout: WorkoutRow;
  sets: SetRow[];
}

/**
 * Rows per statement.
 *
 * MariaDB caps a prepared statement at 65535 placeholders and the whole packet
 * at max_allowed_packet; 100 rows of 12 columns keeps a single multi-row insert
 * far inside both, as it does for the catalog.
 */
export const CHUNK = 100;

/**
 * Maps one workout to its rows, refusing anything the tables cannot store.
 *
 * The refusal follows the catalog's hard lesson: the pinned spec has already
 * been wrong about a field NAME once (`equipment_category` vs `equipment`), and
 * trusting it produced undefined columns that died inside the insert with an
 * error naming nothing a reader would recognise. Callers map before opening a
 * transaction, so a changed API shape leaves the existing cache intact.
 *
 * `updated_at` is deliberately NOT in that refusal set. It is the cursor field,
 * so a missing one is the single most likely thing to break on a future API
 * revision — and falling back to `start_time` costs only a slightly early
 * cursor, which the delta feed re-serves harmlessly. Refusing instead would turn
 * one renamed field into a records page that can never sync at all.
 */
export function toRows(workout: HevyWorkout, fetchedAt: string): MappedWorkout {
  if (workout.id == null || workout.start_time == null) {
    throw new UserFacingError(
      `Hevy returned a workout with no "${workout.id == null ? "id" : "start_time"}" ` +
        `(title ${workout.title ?? "unknown"}). The API shape has changed, so the ` +
        `history cache was left unchanged. This needs a code fix.`,
    );
  }

  const sets: SetRow[] = [];
  for (const exercise of workout.exercises ?? []) {
    if (exercise.exercise_template_id == null) {
      throw new UserFacingError(
        `Hevy returned a logged exercise with no "exercise_template_id" (workout ` +
          `${workout.title || workout.id}, exercise ${exercise.title ?? "unknown"}). The API ` +
          `shape has changed, so the history cache was left unchanged. This needs a code fix.`,
      );
    }
    for (const set of exercise.sets ?? []) {
      sets.push({
        workoutId: workout.id,
        exerciseTemplateId: exercise.exercise_template_id,
        exerciseTitle: exercise.title ?? exercise.exercise_template_id,
        exerciseIndex: exercise.index ?? 0,
        setIndex: set.index ?? 0,
        setType: set.type ?? "normal",
        weightKg: set.weight_kg ?? null,
        reps: set.reps ?? null,
        rpe: set.rpe ?? null,
        durationSeconds: set.duration_seconds ?? null,
        distanceMeters: set.distance_meters ?? null,
      });
    }
  }

  return {
    workout: {
      id: workout.id,
      title: workout.title ?? "Workout",
      routineId: workout.routine_id ?? null,
      startTime: workout.start_time,
      endTime: workout.end_time ?? null,
      hevyUpdatedAt: workout.updated_at ?? workout.start_time,
      fetchedAt,
    },
    sets,
  };
}

/** Largest ISO-8601 string wins; they sort correctly as text. */
export function latest(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

/** Deletes the given workouts and their sets. Sets first — the FK points here. */
export async function removeWorkouts(tx: Db, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    await tx.delete(workoutSets).where(inArray(workoutSets.workoutId, slice));
    await tx.delete(workouts).where(inArray(workouts.id, slice));
  }
}

/** Inserts mapped workouts and their sets, chunked. Callers delete first. */
export async function insertWorkouts(tx: Db, mapped: MappedWorkout[]): Promise<void> {
  const workoutRows = mapped.map((m) => m.workout);
  for (let i = 0; i < workoutRows.length; i += CHUNK) {
    await tx.insert(workouts).values(workoutRows.slice(i, i + CHUNK));
  }
  const setRows = mapped.flatMap((m) => m.sets);
  for (let i = 0; i < setRows.length; i += CHUNK) {
    await tx.insert(workoutSets).values(setRows.slice(i, i + CHUNK));
  }
}
