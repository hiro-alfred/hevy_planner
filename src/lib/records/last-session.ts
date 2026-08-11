import "server-only";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workouts, workoutSets } from "@/lib/db/schema";
import type { ExerciseSession } from "./metrics";
import { WORKING_SET } from "./metrics";
import { PROGRESSION_WINDOW } from "./progression";

// "What did I do last time?" — answered from the local workout cache.
//
// This is what makes a Hevy routine readable as something to TRAIN rather than
// a list of names: the routine says three sets of 8-12, the cache says the last
// time you did it you got 100 kg for 8, 8, 7. Neither number means much alone.
//
// Every function here takes a LIST of ids and answers for all of them in one
// round trip, because their callers render a routine's worth of exercises, an
// account's worth of routines or a week's worth of training days — the per-item
// shape would be exactly the N+1 the project rules ban.

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

/**
 * The newest few sessions of each given exercise, keyed by template id.
 *
 * What `getLastSessions` is to "what did I lift last time", this is to "what
 * should I lift next time": the progression engine needs a short run of
 * sessions to see whether the reps are climbing or stuck, and a plan asks that
 * question for up to seven days of exercises at once.
 *
 * ONE query for the whole plan. `dense_rank()` numbers each exercise's sessions
 * newest-first inside the database and the outer select keeps only the first
 * few, so a five-year-old squat entry contributes three sessions rather than
 * three hundred rows fetched and then thrown away in JS. Ranking on the DATE
 * rather than the workout id is deliberate — every set of one session shares a
 * rank, which is what makes the cut land between sessions instead of inside one.
 *
 * The default depth is the engine's own window, imported rather than restated:
 * fetching four sessions for rules that read three is waste, and fetching two
 * would silently disable the stall rule.
 *
 * Exercises with no logged history are absent from the map. That is the normal
 * state for a newly generated plan, not an error.
 */
export async function getRecentSessions(
  templateIds: string[],
  sessionLimit: number = PROGRESSION_WINDOW,
): Promise<Map<string, ExerciseSession[]>> {
  const ids = [...new Set(templateIds)];
  if (ids.length === 0) return new Map();

  const ranked = db
    .select({
      templateId: workoutSets.exerciseTemplateId,
      workoutId: workoutSets.workoutId,
      workoutTitle: workouts.title,
      startTime: workouts.startTime,
      setIndex: workoutSets.setIndex,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
      rpe: workoutSets.rpe,
      sessionRank:
        sql<number>`dense_rank() over (partition by ${workoutSets.exerciseTemplateId} order by ${workouts.startTime} desc)`.as(
          "session_rank",
        ),
    })
    .from(workoutSets)
    .innerJoin(workouts, eq(workouts.id, workoutSets.workoutId))
    .where(and(inArray(workoutSets.exerciseTemplateId, ids), WORKING_SET))
    .as("ranked");

  const rows = await db
    .select()
    .from(ranked)
    .where(lte(ranked.sessionRank, sessionLimit))
    .orderBy(ranked.templateId, desc(ranked.startTime), ranked.setIndex);

  const byTemplate = new Map<string, ExerciseSession[]>();
  for (const row of rows) {
    const sessions = byTemplate.get(row.templateId) ?? [];
    if (sessions.length === 0) byTemplate.set(row.templateId, sessions);

    const open = sessions[sessions.length - 1];
    if (open?.startTime === row.startTime) {
      // Two workouts can share a start_time (a duplicated log, or an import),
      // and both then carry the same rank. The first one wins whole rather than
      // being merged with the second into a session nobody performed.
      if (open.workoutId !== row.workoutId) continue;
    } else {
      sessions.push({
        workoutId: row.workoutId,
        workoutTitle: row.workoutTitle,
        startTime: row.startTime,
        sets: [],
      });
    }

    sessions[sessions.length - 1]!.sets.push({
      weightKg: num(row.weightKg),
      reps: row.reps,
      rpe: num(row.rpe),
    });
  }

  return byTemplate;
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
