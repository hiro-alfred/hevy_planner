import { sql, type SQL } from "drizzle-orm";
import { workouts, workoutSets } from "@/lib/db/schema";

// How the records index can be ordered.
//
// Its own module for two reasons: metrics.ts is at the project's 300-line
// ceiling, and the SQL order and the toolbar labels have to agree — a sort the
// UI offers but the query cannot honour is worse than one it never showed.

/** The orders the index can be read in. `recent` is the default. */
export type RecordSort = "recent" | "heaviest" | "sessions" | "name";

/** The toolbar's options, in the order they are rendered. */
export const RECORD_SORTS: Array<{ id: RecordSort; label: string }> = [
  { id: "recent", label: "Recent" },
  { id: "heaviest", label: "Heaviest" },
  { id: "sessions", label: "Most trained" },
  { id: "name", label: "A–Z" },
];

/** Narrows an untrusted query-string value; anything else falls back. */
export function parseSort(value: unknown): RecordSort {
  return RECORD_SORTS.some((sort) => sort.id === value) ? (value as RecordSort) : "recent";
}

/**
 * ORDER BY per sort, in SQL rather than in memory.
 *
 * It has to be SQL because the query is capped by a LIMIT: sorting the returned
 * rows would rank only the 200 most recent exercises, so "heaviest" would hide
 * the very PR it was asked for on an account with a long history.
 *
 * `heaviest` and `sessions` fall back to the recency order for their ties,
 * which is what keeps a page of bodyweight exercises — all of them null weight
 * — in a sensible order rather than an arbitrary one.
 */
export const SORT_ORDER: Record<RecordSort, SQL> = {
  recent: sql`max(${workouts.startTime}) desc`,
  heaviest: sql`max(case when ${workoutSets.reps} >= 1 then ${workoutSets.weightKg} end) desc,
    max(${workouts.startTime}) desc`,
  sessions: sql`count(distinct ${workoutSets.workoutId}) desc, max(${workouts.startTime}) desc`,
  name: sql`max(${workoutSets.exerciseTitle}) asc`,
};
