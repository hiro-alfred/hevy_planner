import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { plans, syncLinks } from "@/lib/db/schema";
import type { Plan, PlanRequest } from "@/lib/planner/schema";

// Persistence for plans. The plan itself is a JSON document, not normalised
// tables: it is generated, edited, and synced as a whole, and no query wants to
// reach across plans into individual sets (knowledge/decisions/plan-pipeline.md).

export type PlanRow = typeof plans.$inferSelect;
export type PlanStatus = PlanRow["status"];

export interface PlanListItem {
  id: number;
  title: string;
  status: PlanStatus;
  sessionsPerWeek: number;
  goal: string;
  createdAt: string;
  syncedDays: number;
}

/**
 * Plans for the dashboard, with their synced-day counts.
 *
 * The count comes from a grouped sub-select joined in one statement — counting
 * per plan in a loop would be exactly the N+1 the project rules ban.
 */
export async function listPlans(): Promise<PlanListItem[]> {
  const counts = db
    .select({
      planId: syncLinks.planId,
      syncedDays: sql<number>`count(*)`.as("synced_days"),
    })
    .from(syncLinks)
    .groupBy(syncLinks.planId)
    .as("counts");

  const rows = await db
    .select({
      id: plans.id,
      request: plans.request,
      plan: plans.plan,
      status: plans.status,
      createdAt: plans.createdAt,
      syncedDays: counts.syncedDays,
    })
    .from(plans)
    .leftJoin(counts, eq(counts.planId, plans.id))
    .orderBy(desc(plans.createdAt));

  return rows.map((row) => ({
    id: row.id,
    title: row.plan?.title ?? "Untitled plan",
    status: row.status,
    sessionsPerWeek: row.request.sessionsPerWeek,
    goal: row.request.goal,
    createdAt: row.createdAt,
    syncedDays: row.syncedDays ?? 0,
  }));
}

export async function getPlan(id: number): Promise<PlanRow | null> {
  const [row] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return row ?? null;
}

/** Records the request before generation runs, so a plan is always reproducible. */
export async function createPlan(request: PlanRequest): Promise<number> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(plans)
    .values({ request, plan: null, status: "draft", createdAt: now, updatedAt: now })
    .returning({ id: plans.id });
  return row!.id;
}

export async function savePlan(id: number, plan: Plan): Promise<void> {
  await db
    .update(plans)
    .set({ plan, status: "generated", updatedAt: new Date().toISOString() })
    .where(eq(plans.id, id));
}

export async function markSynced(id: number): Promise<void> {
  await db
    .update(plans)
    .set({ status: "synced", updatedAt: new Date().toISOString() })
    .where(eq(plans.id, id));
}

export async function deletePlan(id: number): Promise<void> {
  // sync_links rows reference the plan; clear them first so the FK holds.
  // The Hevy routines themselves survive — the API has no DELETE.
  await db.delete(syncLinks).where(eq(syncLinks.planId, id));
  await db.delete(plans).where(eq(plans.id, id));
}
