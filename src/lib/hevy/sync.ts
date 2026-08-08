import type { Plan } from "@/lib/planner/schema";
import type { HevyClient } from "./client";

// Sync service: create-once-then-PUT (knowledge/decisions/plan-pipeline.md,
// stage 4). Forced by the API: no DELETE exists and POST /v1/routines has a
// routine cap, so re-creating on every sync is not viable.
//
// First sync: create one folder (plan title) + one routine per day, recording
// each Hevy id in sync_links AS EACH CREATE RETURNS (mid-failure → resume, not
// duplicate). Later syncs: PUT full-replace, skipping days whose contentHash in
// sync_links is unchanged. 403 on create = routine limit — surface, never retry.

export async function syncPlan(
  _client: HevyClient,
  _planId: number,
  _plan: Plan,
): Promise<void> {
  throw new Error("Not implemented: Hevy sync");
}
