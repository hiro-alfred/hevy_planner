import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workouts, workoutSets } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/errors";
import { getWorkoutSyncCursor, setWorkoutSyncCursor } from "@/lib/settings";
import type { HevyClient } from "./client";
import type { HevyWorkout, HevyWorkoutEvent } from "./types";
import {
  insertWorkouts,
  latest,
  removeWorkouts,
  toRows,
  type Db,
  type MappedWorkout,
} from "./workout-rows";

// Keeps a local mirror of the account's logged workouts, which is what /records
// computes every personal record and every progression recommendation from.
//
// Two strategies, chosen by whether a cursor exists:
//   backfill — walk /v1/workouts once and replace the cache wholesale
//   delta    — walk /v1/workouts/events?since=<cursor> and patch it
//
// The split exists because pageSize caps at 10 on both endpoints. A first sync
// of a long training history is genuinely hundreds of requests; every sync after
// it is one or two. Neither ever runs on a page render — only on an explicit
// user action, exactly like the catalog refresh.
//
// STRICTLY read-only against Hevy: this module issues GETs and nothing else.

/** Safety valve against a looping or misreporting pagination response. */
const MAX_PAGES = 1000; // 10k workouts at 10 per page

export type SyncMode = "backfill" | "delta";

export interface WorkoutSyncResult {
  mode: SyncMode;
  /** Workouts written (backfill: all of them; delta: the updated ones). */
  written: number;
  /** Workouts removed because the account deleted them. Backfill: always 0. */
  deleted: number;
  cursor: string;
}

async function cachedWorkoutCount(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(workouts);
  return row?.count ?? 0;
}

/**
 * First sync: walks the entire history and replaces the cache.
 *
 * The network walk completes entirely before the transaction opens, so a fetch
 * that dies on page 40 of 200 leaves the previous cache exactly as it was rather
 * than truncating the history to a prefix.
 */
async function backfill(client: HevyClient, fetchedAt: string): Promise<WorkoutSyncResult> {
  const fetched: HevyWorkout[] = [];
  let page = 1;
  let pageCount = 1;
  do {
    const res = await client.getWorkouts(page);
    fetched.push(...(res.workouts ?? []));
    // page_count is a page total, not an item total (see hevy-api).
    pageCount = res.page_count || 1;
    if (pageCount > MAX_PAGES) {
      throw new UserFacingError(
        `History sync aborted: Hevy reported ${pageCount} pages of workouts (max ${MAX_PAGES}); ` +
          `the cache was left unchanged.`,
      );
    }
    page += 1;
  } while (page <= pageCount);

  // De-duplicate: a workout logged while the walk is in progress shifts every
  // later page by one, which serves some workouts twice. Last write wins.
  const mapped: MappedWorkout[] = [
    ...new Map(fetched.map((w) => [w.id, toRows(w, fetchedAt)])).values(),
  ];

  if (mapped.length === 0 && (await cachedWorkoutCount()) > 0) {
    // An account with history does not become empty. Far likelier an API fault,
    // and replacing the table here would destroy every record on the page.
    throw new UserFacingError(
      "Hevy returned no workouts, but history is already cached; the cache was left unchanged.",
    );
  }

  let cursor: string | null = null;
  for (const m of mapped) cursor = latest(cursor, m.workout.hevyUpdatedAt);

  await db.transaction(async (tx) => {
    await tx.delete(workoutSets);
    await tx.delete(workouts);
    await insertWorkouts(tx as unknown as Db, mapped);
  });

  return { mode: "backfill", written: mapped.length, deleted: 0, cursor: cursor ?? fetchedAt };
}

/**
 * Incremental sync: applies every event since the cursor.
 *
 * Applying an event twice is a no-op by construction (an update deletes the
 * workout's rows and re-inserts them; a delete removes rows that are already
 * gone), which is what makes it safe not to know whether `since` is inclusive or
 * exclusive — an overlap costs a few redundant writes and corrupts nothing.
 */
async function delta(
  client: HevyClient,
  fetchedAt: string,
  cursor: string,
): Promise<WorkoutSyncResult> {
  const events: HevyWorkoutEvent[] = [];
  let page = 1;
  let pageCount = 1;
  do {
    const res = await client.getWorkoutEvents(page, cursor);
    events.push(...(res.events ?? []));
    pageCount = res.page_count || 1;
    if (pageCount > MAX_PAGES) {
      throw new UserFacingError(
        `History sync aborted: Hevy reported ${pageCount} pages of events (max ${MAX_PAGES}); ` +
          `the cache was left unchanged.`,
      );
    }
    page += 1;
  } while (page <= pageCount);

  // Events run newest first, so the FIRST event seen for a workout is its final
  // state. A workout edited twice then deleted must end up deleted, not restored.
  const resolved = new Map<string, HevyWorkoutEvent>();
  let next: string | null = cursor;
  for (const event of events) {
    const id = event.type === "deleted" ? event.id : event.workout?.id;
    if (!id) continue;
    if (!resolved.has(id)) resolved.set(id, event);
    next = latest(next, event.type === "deleted" ? event.deleted_at : event.workout.updated_at);
  }

  const settled = [...resolved.values()];
  const mapped = settled
    .filter((e) => e.type === "updated")
    // Map before the transaction, same reason as the backfill.
    .map((e) => toRows(e.workout, fetchedAt));

  await db.transaction(async (tx) => {
    const scoped = tx as unknown as Db;
    // Updated workouts are removed and re-inserted rather than patched: a set
    // deleted inside the Hevy app leaves no event of its own, so anything short
    // of replacing the workout's sets would keep a set that no longer exists —
    // and a phantom set is a phantom personal record.
    await removeWorkouts(scoped, [...resolved.keys()]);
    await insertWorkouts(scoped, mapped);
  });

  return {
    mode: "delta",
    written: mapped.length,
    deleted: settled.length - mapped.length,
    cursor: next ?? cursor,
  };
}

/**
 * Brings the local history cache up to date, backfilling on the first run.
 *
 * @param full force a complete re-walk, discarding the cursor. The recovery path
 *   if Hevy ever backdates an edit's `updated_at` and a delta misses it.
 */
export async function syncWorkoutHistory(
  client: HevyClient,
  full = false,
): Promise<WorkoutSyncResult> {
  const fetchedAt = new Date().toISOString();
  const cursor = full ? null : await getWorkoutSyncCursor();

  const result =
    cursor === null ? await backfill(client, fetchedAt) : await delta(client, fetchedAt, cursor);

  // Written only after the transaction commits: a cursor moved past data that
  // failed to store would skip those workouts forever.
  await setWorkoutSyncCursor(result.cursor);
  return result;
}

export interface HistoryStatus {
  workouts: number;
  sets: number;
  /** Start time of the most recent workout in the cache. */
  lastWorkoutAt: string | null;
  /** When the cache last absorbed anything from Hevy. */
  lastSyncedAt: string | null;
  /** False when the history has never been synced. */
  everSynced: boolean;
}

/** Cache size and freshness for the records page header. Two queries, no join. */
export async function getHistoryStatus(): Promise<HistoryStatus> {
  const [[workoutRow], [setRow], cursor] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)`,
        lastWorkoutAt: sql<string | null>`max(${workouts.startTime})`,
        lastSyncedAt: sql<string | null>`max(${workouts.fetchedAt})`,
      })
      .from(workouts),
    db.select({ count: sql<number>`count(*)` }).from(workoutSets),
    getWorkoutSyncCursor(),
  ]);

  return {
    workouts: workoutRow?.count ?? 0,
    sets: setRow?.count ?? 0,
    lastWorkoutAt: workoutRow?.lastWorkoutAt ?? null,
    lastSyncedAt: workoutRow?.lastSyncedAt ?? null,
    everSynced: cursor !== null,
  };
}
