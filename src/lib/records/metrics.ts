import "server-only";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workouts, workoutSets } from "@/lib/db/schema";
import { E1RM_MAX_REPS, epley } from "./e1rm";
import { SORT_ORDER, type RecordSort } from "./record-sort";

// Personal records, computed from the local workout cache (lib/hevy/workout-sync).
//
// Two rules run through everything here:
//
//   1. WARM-UPS ARE NOT RECORDS. Every query and every reducer filters them out.
//      Leaving them in would not just add noise — a warm-up set logged with a
//      mistyped weight is exactly the kind of row that invents a fake PR.
//   2. Nothing is a record unless the reps back it up. A weight logged with no
//      reps is an abandoned set, not a lift, so it is excluded from the weight
//      records rather than treated as a 1-rep max.

/** Set types that count. `warmup` is the only one excluded. */
export const WORKING_SET = sql`${workoutSets.setType} <> 'warmup'`;

// The 1RM estimate lives in ./e1rm so the chart code can use it without
// opening a database connection; re-exported here because every existing
// caller (and its tests) reaches for it through this module.
export { E1RM_MAX_REPS, epley };

/** True when a set can support a weight record: real load, real reps. */
function isLoaded(set: { weightKg: number | null; reps: number | null }): boolean {
  return set.weightKg !== null && set.weightKg > 0 && set.reps !== null && set.reps >= 1;
}

/**
 * MariaDB returns DECIMAL-typed expressions as strings through mysql2, and
 * `weight_kg * (1 + reps/30)` is DECIMAL because `reps` is an integer column.
 * Coercing here rather than casting in SQL keeps the same guard over every
 * driver-shaped surprise, including plain NULLs.
 */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface ExerciseRecordSummary {
  templateId: string;
  title: string;
  /** Best estimated 1RM across all working sets of 1-12 reps. */
  bestE1rmKg: number | null;
  /** Heaviest load ever moved for at least one rep. */
  heaviestKg: number | null;
  /** Most reps in a single working set — the only record a bodyweight lift has. */
  bestReps: number | null;
  sessionCount: number;
  lastPerformedAt: string;
}

/**
 * One row per exercise ever logged, for the records index.
 *
 * ONE grouped query over the whole history, not a query per exercise: the index
 * lists every exercise the account has ever touched, so the per-exercise shape
 * would be the N+1 the project rules ban, at a few hundred rows wide.
 *
 * Sorted by last-performed by default rather than by weight, because a lifter
 * opening this page is checking the lifts they are training now, not admiring a
 * bench PR set three years ago.
 */
export async function listExerciseRecords(
  query = "",
  sort: RecordSort = "recent",
  limit = 200,
): Promise<ExerciseRecordSummary[]> {
  const conditions: SQL[] = [WORKING_SET];

  const trimmed = query.trim();
  if (trimmed !== "") {
    // "!" as the escape character, not backslash: MariaDB processes backslash
    // escapes inside string literals, so `escape '\'` fails to parse while the
    // doubled form breaks under NO_BACKSLASH_ESCAPES. Same choice as the catalog.
    const pattern = `%${trimmed.replace(/[!%_]/g, "!$&")}%`;
    conditions.push(sql`${workoutSets.exerciseTitle} like ${pattern} escape '!'`);
  }

  const rows = await db
    .select({
      templateId: workoutSets.exerciseTemplateId,
      title: sql<string>`max(${workoutSets.exerciseTitle})`,
      // The reps guard lives inside the aggregate so the estimate skips high-rep
      // sets without dropping them from the volume and rep records below.
      bestE1rm: sql<unknown>`max(case
        when ${workoutSets.reps} between 1 and ${E1RM_MAX_REPS} and ${workoutSets.weightKg} > 0
        then ${workoutSets.weightKg} * (1 + ${workoutSets.reps} / 30) end)`,
      heaviest: sql<unknown>`max(case when ${workoutSets.reps} >= 1 then ${workoutSets.weightKg} end)`,
      bestReps: sql<unknown>`max(${workoutSets.reps})`,
      sessionCount: sql<unknown>`count(distinct ${workoutSets.workoutId})`,
      lastPerformedAt: sql<string>`max(${workouts.startTime})`,
    })
    .from(workoutSets)
    .innerJoin(workouts, eq(workouts.id, workoutSets.workoutId))
    .where(and(...conditions))
    .groupBy(workoutSets.exerciseTemplateId)
    .orderBy(SORT_ORDER[sort] ?? SORT_ORDER.recent)
    .limit(limit);

  return rows.map((row) => ({
    templateId: row.templateId,
    title: row.title,
    bestE1rmKg: num(row.bestE1rm),
    heaviestKg: num(row.heaviest),
    bestReps: num(row.bestReps),
    sessionCount: num(row.sessionCount) ?? 0,
    lastPerformedAt: row.lastPerformedAt,
  }));
}

export interface LoggedSet {
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
}

/** One exercise as it was performed in one workout. */
export interface ExerciseSession {
  workoutId: string;
  workoutTitle: string;
  startTime: string;
  sets: LoggedSet[];
}

/** A record, kept with the set and date that produced it so the UI can show it. */
export interface RecordSet {
  weightKg: number | null;
  reps: number;
  /** The metric's value: kg for weight records, kg-reps for volume. */
  value: number;
  performedAt: string;
}

export interface ExerciseRecords {
  templateId: string;
  title: string;
  bestE1rm: RecordSet | null;
  heaviest: RecordSet | null;
  bestVolume: RecordSet | null;
  bestReps: RecordSet | null;
  /** Heaviest weight moved for AT LEAST n reps, for n in 1..10. */
  repMaxes: Array<{ reps: number; weightKg: number; performedAt: string }>;
  /** Every session this exercise appears in, newest first. */
  sessions: ExerciseSession[];
}

const REP_MAX_RANGE = 10;

/** Keeps whichever candidate scores higher; ties keep the earlier (first) one. */
function best(current: RecordSet | null, candidate: RecordSet): RecordSet {
  return current === null || candidate.value > current.value ? candidate : current;
}

/**
 * Everything the exercise detail page needs, from ONE query.
 *
 * All of this exercise's working sets are pulled once and reduced in memory
 * rather than asking the database for each record separately: the records, the
 * rep-max table and the session history are seven different reductions over the
 * same rows, and seven queries would read the same index seven times.
 */
export async function getExerciseRecords(templateId: string): Promise<ExerciseRecords | null> {
  const rows = await db
    .select({
      workoutId: workoutSets.workoutId,
      workoutTitle: workouts.title,
      startTime: workouts.startTime,
      title: workoutSets.exerciseTitle,
      setIndex: workoutSets.setIndex,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
      rpe: workoutSets.rpe,
    })
    .from(workoutSets)
    .innerJoin(workouts, eq(workouts.id, workoutSets.workoutId))
    .where(and(eq(workoutSets.exerciseTemplateId, templateId), WORKING_SET))
    .orderBy(desc(workouts.startTime), workoutSets.setIndex);

  if (rows.length === 0) return null;

  let bestE1rm: RecordSet | null = null;
  let heaviest: RecordSet | null = null;
  let bestVolume: RecordSet | null = null;
  let bestReps: RecordSet | null = null;
  // Index n holds the heaviest weight moved for at least n reps.
  const repMax = new Map<number, { weightKg: number; performedAt: string }>();
  const sessions = new Map<string, ExerciseSession>();

  for (const row of rows) {
    const weightKg = num(row.weightKg);
    const reps = num(row.reps);

    let session = sessions.get(row.workoutId);
    if (!session) {
      session = {
        workoutId: row.workoutId,
        workoutTitle: row.workoutTitle,
        startTime: row.startTime,
        sets: [],
      };
      sessions.set(row.workoutId, session);
    }
    session.sets.push({ weightKg, reps, rpe: num(row.rpe) });

    if (reps !== null && reps >= 1) {
      bestReps = best(bestReps, { weightKg, reps, value: reps, performedAt: row.startTime });
    }
    if (!isLoaded({ weightKg, reps })) continue;

    const load = weightKg!;
    const count = reps!;
    heaviest = best(heaviest, { weightKg: load, reps: count, value: load, performedAt: row.startTime });
    bestVolume = best(bestVolume, {
      weightKg: load,
      reps: count,
      value: load * count,
      performedAt: row.startTime,
    });
    if (count <= E1RM_MAX_REPS) {
      bestE1rm = best(bestE1rm, {
        weightKg: load,
        reps: count,
        value: epley(load, count),
        performedAt: row.startTime,
      });
    }

    // "5RM" means the most weight moved for five OR MORE reps — a set of 8 at
    // 100 kg proves a 5-rep capability at 100 kg, so it fills every row up to 5.
    for (let n = 1; n <= Math.min(count, REP_MAX_RANGE); n += 1) {
      const held = repMax.get(n);
      if (!held || load > held.weightKg) {
        repMax.set(n, { weightKg: load, performedAt: row.startTime });
      }
    }
  }

  const repMaxes = [...repMax.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([reps, entry]) => ({ reps, ...entry }));

  return {
    templateId,
    // Titles can change upstream; the newest row wins because rows are sorted
    // newest-first, so a renamed exercise shows its current name.
    title: rows[0]!.title,
    bestE1rm,
    heaviest,
    bestVolume,
    bestReps,
    repMaxes,
    sessions: [...sessions.values()],
  };
}
