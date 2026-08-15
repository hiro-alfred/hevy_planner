import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { exerciseTemplates, workouts, workoutSets } from "@/lib/db/schema";
import { WORKING_SET } from "@/lib/records/metrics";

// Account-level training statistics for the profile page.
//
// Deliberately NOT what /records shows. That page is per-exercise — "what is my
// best bench" — and its header counts rows in the cache. These answer "how has
// my training been going", which is the only question a profile page has any
// business asking, and the only one that talks back to the standing profile:
// a 4-day-per-week default is worth questioning when the average is 2.1.
//
// TWO queries, both grouped aggregates over the whole history. The per-exercise
// shape would be the N+1 the project rules ban — metrics.ts says so at a few
// hundred rows wide, and this page has no per-exercise content at all.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * MariaDB returns SUM/AVG as DECIMAL, which mysql2 hands back as a string.
 * Same guard as records/metrics.ts, for the same reason.
 */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** An ISO cutoff `daysAgo` days back. Times are ISO strings and sort as such. */
function cutoff(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString();
}

export interface MuscleShare {
  /** The Hevy muscle group, or null for history whose template is not cached. */
  group: string | null;
  sets: number;
  /** Share of all working sets, 0-100. */
  percent: number;
}

export interface TrainingStats {
  workouts: number;
  /** ISO date of the first logged workout, or null. */
  firstWorkoutAt: string | null;
  lastWorkoutAt: string | null;
  sessionsLast30: number;
  sessionsLast90: number;
  /** Sessions per week over the last 90 days, one decimal. */
  weeklyAverage: number | null;
  /** Sum of weight x reps over working sets, kg. Warm-ups never count. */
  tonnageKg: number | null;
  /** The three most-trained muscle groups by working-set count. */
  topMuscles: MuscleShare[];
}

/**
 * Everything the "training at a glance" block needs.
 *
 * The two queries are issued together: the page is not useful with one of them,
 * and running them in sequence would just add a round trip.
 */
export async function getTrainingStats(): Promise<TrainingStats> {
  const [[totals], muscleRows] = await Promise.all([
    db
      .select({
        workouts: sql<unknown>`count(*)`,
        firstWorkoutAt: sql<string | null>`min(${workouts.startTime})`,
        lastWorkoutAt: sql<string | null>`max(${workouts.startTime})`,
        last30: sql<unknown>`sum(case when ${workouts.startTime} >= ${cutoff(30)} then 1 else 0 end)`,
        last90: sql<unknown>`sum(case when ${workouts.startTime} >= ${cutoff(90)} then 1 else 0 end)`,
      })
      .from(workouts),
    // LEFT JOIN, not INNER: history can reference a template the catalog no
    // longer has — a deleted custom exercise — and an inner join would silently
    // drop those sets, making every percentage below add up to less than the
    // truth without saying so. They land in the null bucket instead.
    db
      .select({
        group: exerciseTemplates.primaryMuscleGroup,
        sets: sql<unknown>`count(*)`,
        tonnage: sql<unknown>`sum(${workoutSets.weightKg} * ${workoutSets.reps})`,
      })
      .from(workoutSets)
      .leftJoin(exerciseTemplates, eq(exerciseTemplates.id, workoutSets.exerciseTemplateId))
      .where(WORKING_SET)
      .groupBy(exerciseTemplates.primaryMuscleGroup),
  ]);

  const totalSets = muscleRows.reduce((sum, row) => sum + (num(row.sets) ?? 0), 0);
  const tonnageKg = muscleRows.reduce((sum, row) => sum + (num(row.tonnage) ?? 0), 0);

  const topMuscles = muscleRows
    .map((row) => ({ group: row.group, sets: num(row.sets) ?? 0 }))
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 3)
    .map((row) => ({
      ...row,
      percent: totalSets === 0 ? 0 : Math.round((row.sets / totalSets) * 100),
    }));

  const last90 = num(totals?.last90) ?? 0;

  return {
    workouts: num(totals?.workouts) ?? 0,
    firstWorkoutAt: totals?.firstWorkoutAt ?? null,
    lastWorkoutAt: totals?.lastWorkoutAt ?? null,
    sessionsLast30: num(totals?.last30) ?? 0,
    sessionsLast90: last90,
    // Over the window, not since the first workout ever: someone who trained
    // hard in 2023 and stopped should not read as "3.1 per week".
    weeklyAverage: last90 === 0 ? null : Math.round((last90 / (90 / 7)) * 10) / 10,
    tonnageKg: totalSets === 0 ? null : tonnageKg,
    topMuscles,
  };
}
