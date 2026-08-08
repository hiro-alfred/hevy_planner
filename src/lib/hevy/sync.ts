import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { syncLinks } from "@/lib/db/schema";
import type { Plan } from "@/lib/planner/schema";
import { dayToRoutine, routineHash } from "@/lib/planner/to-hevy";
import type { HevyClient } from "./client";

// Stage 4 of the pipeline: push a plan to Hevy.
//
// CREATE-ONCE-THEN-PUT. The API has no DELETE and POST /v1/routines is capped,
// so re-creating routines on every sync would permanently burn the user's quota
// (knowledge/concepts/hevy-api.md). Instead each training day is created once,
// its Hevy id is recorded, and every later sync is a PUT full-replace.
//
// Ids are written to sync_links AS EACH CREATE RETURNS, not in a batch at the
// end: a failure halfway through must leave the run resumable, never duplicated.

export interface SyncSummary {
  created: number;
  updated: number;
  unchanged: number;
  folderId: number;
}

export function planFolderTitle(plan: Plan): string {
  return plan.title;
}

/**
 * Syncs every training day, skipping days whose content hash is unchanged.
 *
 * Throws on the first API failure — with whatever succeeded already recorded, so
 * a retry resumes. A 403 from create means the routine limit is exhausted and
 * must reach the user; retrying it would never succeed.
 */
export async function syncPlan(
  client: HevyClient,
  planId: number,
  plan: Plan,
): Promise<SyncSummary> {
  const existing = await db.select().from(syncLinks).where(eq(syncLinks.planId, planId));
  const byDay = new Map(existing.map((link) => [link.dayIndex, link]));

  // One folder per plan. Reuse the one a previous sync created — folders cannot
  // be deleted either, so creating a second would leave an orphan behind.
  let folderId = existing[0]?.hevyFolderId ?? null;
  if (folderId === null) {
    const { routine_folder } = await client.createRoutineFolder(planFolderTitle(plan));
    folderId = routine_folder.id;
  }

  const summary: SyncSummary = { created: 0, updated: 0, unchanged: 0, folderId };
  const notes = plan.progression;

  for (const [dayIndex, day] of plan.days.entries()) {
    const routine = dayToRoutine(day, folderId, notes);
    const hash = routineHash(routine);
    const link = byDay.get(dayIndex);
    const now = new Date().toISOString();

    if (!link) {
      const { routine: created } = await client.createRoutine(routine);
      await db.insert(syncLinks).values({
        planId,
        dayIndex,
        hevyFolderId: folderId,
        hevyRoutineId: created.id,
        contentHash: hash,
        lastSyncedAt: now,
      });
      summary.created += 1;
      continue;
    }

    if (link.contentHash === hash) {
      summary.unchanged += 1;
      continue;
    }

    await client.updateRoutine(link.hevyRoutineId, routine);
    await db
      .update(syncLinks)
      .set({ contentHash: hash, lastSyncedAt: now })
      .where(eq(syncLinks.id, link.id));
    summary.updated += 1;
  }

  return summary;
}

export interface SyncState {
  syncedDays: number;
  lastSyncedAt: string | null;
  /** True when the stored plan differs from what was last pushed. */
  hasPendingChanges: boolean;
}

/** Sync status for the preview UI, in one query. */
export async function getSyncState(planId: number, plan: Plan | null): Promise<SyncState> {
  const links = await db.select().from(syncLinks).where(eq(syncLinks.planId, planId));
  if (links.length === 0) {
    return { syncedDays: 0, lastSyncedAt: null, hasPendingChanges: plan !== null };
  }

  const lastSyncedAt = links.reduce<string | null>(
    (latest, link) => (latest === null || link.lastSyncedAt > latest ? link.lastSyncedAt : latest),
    null,
  );

  let hasPendingChanges = false;
  if (plan) {
    const byDay = new Map(links.map((link) => [link.dayIndex, link]));
    const folderId = links[0]!.hevyFolderId;
    hasPendingChanges = plan.days.some((day, dayIndex) => {
      const link = byDay.get(dayIndex);
      if (!link) return true;
      return link.contentHash !== routineHash(dayToRoutine(day, folderId, plan.progression));
    });
  }

  return { syncedDays: links.length, lastSyncedAt, hasPendingChanges };
}
