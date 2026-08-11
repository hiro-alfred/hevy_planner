import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workouts, workoutSets } from "@/lib/db/schema";
import { WORKING_SET } from "./metrics";

// "What did I do last time?" — answered from the local workout cache.
//
// This is what makes a Hevy routine readable as something to TRAIN rather than
// a list of names: the routine says three sets of 8-12, the cache says the last
// time you did it you got 100 kg for 8, 8, 7. Neither number means much alone.
//
// Both functions here take a LIST of ids and answer for all of them in one
// round trip, because their only callers render a routine's worth of exercises
// or an account's worth of routines — the per-item shape would be exactly the
// N+1 the project rules ban.

export interface LastSet {
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
}

export interface LastSession {
  workoutId: string;
  workoutTitle: string;
  startTime: string;
  sets: LastSet[];
}

/** mysql2 hands DECIMAL/DOUBLE back as strings often enough to guard here. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The most recent session of each given exercise, keyed by template id.
 *
 * ONE query for the whole routine. The derived table picks each exercise's
 * latest workout date and the outer select joins back to it, so the database
 * returns only the sets of the newest session per exercise instead of the whole
 * history — which for a five-year-old squat entry would be thousands of rows
 * fetched to display three.
 *
 * Exercises with no logged history are simply absent from the map; a routine
 * that has never been trained is a normal state, not an error.
 */
export async function getLastSessions(templateIds: string[]): Promise<Map<string, LastSession>> {
  const ids = [...new Set(templateIds)];
  if (ids.length === 0) return new Map();

  const latest = db
    .select({
      templateId: workoutSets.exerciseTemplateId,
      lastAt: sql<string>`max(${workouts.startTime})`.as("last_at"),
    })
    .from(workoutSets)
    .innerJoin(workouts, eq(workouts.id, workoutSets.workoutId))
    .where(and(inArray(workoutSets.exerciseTemplateId, ids), WORKING_SET))
    .groupBy(workoutSets.exerciseTemplateId)
    .as("latest");

  const rows = await db
    .select({
      templateId: workoutSets.exerciseTemplateId,
      workoutId: workoutSets.workoutId,
      workoutTitle: workouts.title,
      startTime: workouts.startTime,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
      rpe: workoutSets.rpe,
    })
    .from(workoutSets)
    .innerJoin(workouts, eq(workouts.id, workoutSets.workoutId))
    .innerJoin(
      latest,
      and(
        eq(latest.templateId, workoutSets.exerciseTemplateId),
        eq(latest.lastAt, workouts.startTime),
      ),
    )
    .where(and(inArray(workoutSets.exerciseTemplateId, ids), WORKING_SET))
    .orderBy(workoutSets.exerciseTemplateId, workoutSets.setIndex);

  const sessions = new Map<string, LastSession>();
  for (const row of rows) {
    const held = sessions.get(row.templateId);
    // Two workouts can share a start_time (a duplicated log, or an import), and
    // the join would then return both. First workout id wins so the row shows
    // one session rather than a merged one.
    if (held && held.workoutId !== row.workoutId) continue;
    const session =
      held ??
      {
        workoutId: row.workoutId,
        workoutTitle: row.workoutTitle,
        startTime: row.startTime,
        sets: [],
      };
    session.sets.push({ weightKg: num(row.weightKg), reps: row.reps, rpe: num(row.rpe) });
    if (!held) sessions.set(row.templateId, session);
  }

  return sessions;
}

export interface RoutineActivity {
  lastPerformedAt: string;
  sessionCount: number;
}

/**
 * How often each routine has actually been trained, keyed by Hevy routine id.
 *
 * Hevy stamps a completed workout with the routine it was started from, so this
 * is the honest answer to "do I still use this routine" — the thing the account
 * list could never say before. Routines never trained (or trained before the
 * history cache was filled) are absent.
 */
export async function getRoutineActivity(
  routineIds: string[],
): Promise<Map<string, RoutineActivity>> {
  const ids = [...new Set(routineIds)];
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({
      routineId: workouts.routineId,
      lastPerformedAt: sql<string>`max(${workouts.startTime})`,
      sessionCount: sql<unknown>`count(*)`,
    })
    .from(workouts)
    .where(inArray(workouts.routineId, ids))
    .groupBy(workouts.routineId);

  return new Map(
    rows
      .filter((row): row is typeof row & { routineId: string } => row.routineId !== null)
      .map((row) => [
        row.routineId,
        { lastPerformedAt: row.lastPerformedAt, sessionCount: num(row.sessionCount) ?? 0 },
      ]),
  );
}
