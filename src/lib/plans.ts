import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { plans, syncLinks } from "@/lib/db/schema";
import { withPlanLock } from "@/lib/hevy/plan-lock";
import { dayToRoutine, routineHash } from "@/lib/planner/to-hevy";
import type { Plan, PlanRequest } from "@/lib/planner/schema";

// Persistence for plans. The plan itself is a JSON document, not normalised
// tables: it is generated, edited, and synced as a whole, and no query wants to
// reach across plans into individual sets (knowledge/decisions/plan-pipeline.md).

export type PlanRow = typeof plans.$inferSelect;
export type PlanStatus = PlanRow["status"];

/** What the dashboard says about a plan's relationship to Hevy. */
export type PlanSyncLabel = "draft" | "not_synced" | "changes_pending" | "synced";

export interface PlanListItem {
  id: number;
  title: string;
  syncLabel: PlanSyncLabel;
  sessionsPerWeek: number;
  goal: string;
  createdAt: string;
  syncedDays: number;
}

/**
 * Plans for the dashboard.
 *
 * The sync label is derived from sync_links content hashes — the SAME rule the
 * plan page uses — rather than from the `status` column. The two used to
 * disagree: regenerating a synced plan reset status to "generated" even when
 * the deterministic generator reproduced a byte-identical plan, so the
 * dashboard said "Not synced" while the plan page said "up to date". Hashes are
 * the truth; a status enum that has to be kept in step with them is a second
 * source waiting to drift.
 *
 * Two queries total, not one per plan.
 */
export async function listPlans(): Promise<PlanListItem[]> {
  const [rows, links] = await Promise.all([
    db
      .select({
        id: plans.id,
        request: plans.request,
        plan: plans.plan,
        createdAt: plans.createdAt,
      })
      .from(plans)
      .orderBy(desc(plans.createdAt)),
    db.select().from(syncLinks),
  ]);

  const linksByPlan = new Map<number, (typeof links)[number][]>();
  for (const link of links) {
    const list = linksByPlan.get(link.planId);
    if (list) list.push(link);
    else linksByPlan.set(link.planId, [link]);
  }

  return rows.map((row) => {
    const planLinks = linksByPlan.get(row.id) ?? [];
    return {
      id: row.id,
      title: row.plan?.title ?? "Untitled plan",
      syncLabel: describeSyncLabel(row.plan, planLinks),
      sessionsPerWeek: row.request.sessionsPerWeek,
      goal: row.request.goal,
      createdAt: row.createdAt,
      syncedDays: planLinks.length,
    };
  });
}

type SyncLinkRow = typeof syncLinks.$inferSelect;

function describeSyncLabel(plan: Plan | null, links: SyncLinkRow[]): PlanSyncLabel {
  if (!plan) return "draft";
  if (links.length === 0) return "not_synced";

  const byDay = new Map(links.map((link) => [link.dayIndex, link]));
  const folderId = links[0]!.hevyFolderId;

  const changed = plan.days.some((day, dayIndex) => {
    const link = byDay.get(dayIndex);
    if (!link) return true;
    return link.contentHash !== routineHash(dayToRoutine(day, folderId, plan.progression));
  });
  // Routines for days the plan no longer has are stranded in Hevy; that is not
  // "synced" either.
  const stranded = links.some((link) => link.dayIndex >= plan.days.length);

  return changed || stranded ? "changes_pending" : "synced";
}

export async function getPlan(id: number): Promise<PlanRow | null> {
  const [row] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return row ?? null;
}

/** Records the request before generation runs, so a plan is always reproducible. */
export async function createPlan(request: PlanRequest): Promise<number> {
  const now = new Date().toISOString();
  // MariaDB has no RETURNING, so the new id comes from the result header's
  // insertId rather than from the statement itself. It is per-connection state
  // in the driver, not a re-read, so a concurrent insert cannot alias it.
  const [result] = await db
    .insert(plans)
    .values({ request, plan: null, status: "draft", createdAt: now, updatedAt: now });
  return result.insertId;
}

export async function savePlan(id: number, plan: Plan): Promise<void> {
  await db
    .update(plans)
    .set({ plan, status: "generated", updatedAt: new Date().toISOString() })
    .where(eq(plans.id, id));
}

/**
 * Writes an edited plan together with the request that now describes it.
 *
 * One statement, not a savePlan + a second update: an exercise swap changes the
 * plan AND appends to the request's rejection list, and a crash between two
 * writes would leave a plan whose rejected exercise is still in it, or a
 * rejection for an exercise the plan no longer has.
 *
 * Status stays "generated" for the same reason savePlan sets it: the plan no
 * longer matches what is in Hevy, and the dashboard derives its label from
 * content hashes regardless.
 */
export async function savePlanEdit(id: number, plan: Plan, request: PlanRequest): Promise<void> {
  await db
    .update(plans)
    .set({ plan, request, status: "generated", updatedAt: new Date().toISOString() })
    .where(eq(plans.id, id));
}

/**
 * Writes the request alone, leaving the plan and its status untouched.
 *
 * Clearing a rejected exercise changes what the NEXT generation may choose; it
 * does not change the plan on screen, so it must not mark the plan edited or —
 * on a draft, where `plan` is still null — write a null plan back under a
 * "generated" status.
 */
export async function saveRequest(id: number, request: PlanRequest): Promise<void> {
  await db
    .update(plans)
    .set({ request, updatedAt: new Date().toISOString() })
    .where(eq(plans.id, id));
}

export async function markSynced(id: number): Promise<void> {
  await db
    .update(plans)
    .set({ status: "synced", updatedAt: new Date().toISOString() })
    .where(eq(plans.id, id));
}

export async function deletePlan(id: number): Promise<void> {
  // Serialised against syncing THIS plan. A delete landing mid-sync would pull
  // the plans row out from under the loop: the next createRoutine still
  // succeeds against Hevy, but recording its id fails on the foreign key —
  // leaving a permanent routine whose id nothing holds. Sync checks the plan
  // exists, but only once at the start, so the check alone is not enough.
  await withPlanLock(id, async () => {
    // sync_links rows reference the plan; clear them first so the FK holds.
    // The Hevy routines themselves survive — the API has no DELETE.
    await db.delete(syncLinks).where(eq(syncLinks.planId, id));
    await db.delete(plans).where(eq(plans.id, id));
  });
}
