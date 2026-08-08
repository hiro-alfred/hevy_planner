import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { plans, syncLinks } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/errors";
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
  // An empty day would POST a routine with no exercises — permanently consuming
  // part of the routine cap for something useless. Refuse before writing.
  const emptyDay = plan.days.findIndex((day) => day.exercises.length === 0);
  if (emptyDay !== -1) {
    throw new UserFacingError(
      `Day ${emptyDay + 1} ("${plan.days[emptyDay]!.title}") has no exercises, so it cannot be synced. ` +
        `Regenerate the plan, or widen the equipment selection so every day can be filled.`,
    );
  }

  const existing = await db.select().from(syncLinks).where(eq(syncLinks.planId, planId));
  const byDay = new Map(existing.map((link) => [link.dayIndex, link]));

  // One folder per plan, and exactly one ever. The id is read from the plans
  // row and written back the instant the create returns — NOT inferred from a
  // sync_links row, because those only exist after a routine create succeeds.
  // If the first routine create fails (the routine-cap 403 this design
  // expects), a folder id kept only on sync_links is lost and the retry creates
  // a second folder that no API call can ever delete.
  const [planRow] = await db
    .select({ hevyFolderId: plans.hevyFolderId })
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);

  let folderId = planRow?.hevyFolderId ?? existing[0]?.hevyFolderId ?? null;
  if (folderId === null) {
    const { routine_folder } = await client.createRoutineFolder(planFolderTitle(plan));
    folderId = routine_folder.id;
    await db.update(plans).set({ hevyFolderId: folderId }).where(eq(plans.id, planId));
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
  /** Routines in Hevy for days the plan no longer has. Cannot be deleted. */
  staleRoutines: number;
}

/** Sync status for the preview UI, in one query. */
export async function getSyncState(planId: number, plan: Plan | null): Promise<SyncState> {
  const links = await db.select().from(syncLinks).where(eq(syncLinks.planId, planId));
  if (links.length === 0) {
    return {
      syncedDays: 0,
      lastSyncedAt: null,
      hasPendingChanges: plan !== null,
      staleRoutines: 0,
    };
  }

  const lastSyncedAt = links.reduce<string | null>(
    (latest, link) => (latest === null || link.lastSyncedAt > latest ? link.lastSyncedAt : latest),
    null,
  );

  let hasPendingChanges = false;
  let staleRoutines = 0;
  if (plan) {
    const byDay = new Map(links.map((link) => [link.dayIndex, link]));
    const folderId = links[0]!.hevyFolderId;
    hasPendingChanges = plan.days.some((day, dayIndex) => {
      const link = byDay.get(dayIndex);
      if (!link) return true;
      return link.contentHash !== routineHash(dayToRoutine(day, folderId, plan.progression));
    });

    // A plan that lost days leaves routines in Hevy that nothing will update
    // again — and no API call can delete them. Never report "up to date" while
    // one is stranded; say so instead.
    staleRoutines = links.filter((link) => link.dayIndex >= plan.days.length).length;
    if (staleRoutines > 0) hasPendingChanges = true;
  }

  return { syncedDays: links.length, lastSyncedAt, hasPendingChanges, staleRoutines };
}
