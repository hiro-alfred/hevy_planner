"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, errorState, successState } from "@/lib/action-state";
import { requireIdentity } from "@/lib/auth/guard";
import { describeHevyError } from "@/lib/hevy/errors";
import { getHevyClient, NO_KEY_MESSAGE } from "@/lib/hevy/session";
import { syncPlan } from "@/lib/hevy/sync";
import { createPlan, deletePlan, getPlan, markSynced, savePlan } from "@/lib/plans";
import { generatePlan, type PlanSource } from "@/lib/planner/generate";
import type { PlanRequest } from "@/lib/planner/schema";
import { parseRequest, REQUEST_FORM_ERROR } from "./request-form";

// Server actions for the plan flow: request -> generate -> preview -> sync.
// Editing lives in plans/[id]/edit-actions.ts.

/** Where a freshly generated plan lands, and what the preview should announce. */
function previewPath(planId: number, source: PlanSource, degraded: boolean): string {
  const params = new URLSearchParams({ generated: source });
  if (degraded) params.set("degraded", "1");
  return `/plans/${planId}?${params.toString()}`;
}

/**
 * Creates the plan row, generates into it, then redirects to the preview.
 *
 * The request is persisted BEFORE generation so a plan is always reproducible;
 * if generation fails outright the empty draft is removed rather than left as
 * clutter the user has to clean up.
 */
export async function createPlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // First statement, and outside every try below: requireIdentity() signals by
  // throwing (redirect), so a surrounding catch would turn the gate into an
  // error message and let the action carry on.
  await requireIdentity();

  let request: PlanRequest;
  try {
    request = parseRequest(formData);
  } catch {
    return errorState(REQUEST_FORM_ERROR);
  }

  const planId = await createPlan(request);
  let destination: string;
  try {
    const result = await generatePlan(request);
    await savePlan(planId, result.plan);
    destination = previewPath(planId, result.source, Boolean(result.fallbackReason));
  } catch (error) {
    await deletePlan(planId);
    return errorState(describeHevyError(error, "read", "Could not generate a plan."));
  }

  revalidatePath("/");
  // redirect() throws internally — it must sit outside the try block.
  redirect(destination);
}

/**
 * Re-runs generation for an existing plan against its stored request.
 *
 * Redirects to a freshly-stamped preview URL rather than returning in place:
 * the "which generator built this" banner is driven by those query params, so
 * leaving them alone would leave the previous plan's provenance on screen
 * describing a plan that no longer exists.
 */
export async function regeneratePlanAction(planId: number): Promise<ActionState> {
  await requireIdentity();

  const row = await getPlan(planId);
  if (!row) return errorState("Plan not found.");

  let destination: string;
  try {
    const result = await generatePlan(row.request);
    await savePlan(planId, result.plan);
    destination = previewPath(planId, result.source, Boolean(result.fallbackReason));
  } catch (error) {
    return errorState(describeHevyError(error, "read", "Could not regenerate the plan."));
  }

  revalidatePath(`/plans/${planId}`);
  revalidatePath("/");
  redirect(destination);
}

/**
 * Pushes the plan to Hevy: one folder plus one routine per training day on the
 * first sync, PUT full-replace on every sync after that.
 */
export async function syncPlanAction(planId: number): Promise<ActionState> {
  // The most consequential action in the app: it WRITES to the real Hevy
  // account, and the Hevy API has no delete endpoint to undo it with.
  await requireIdentity();

  const client = await getHevyClient();
  if (!client) return errorState(NO_KEY_MESSAGE);

  const row = await getPlan(planId);
  if (!row?.plan) return errorState("Generate the plan before syncing it.");

  try {
    const summary = await syncPlan(client, planId, row.plan);
    await markSynced(planId);
    revalidatePath(`/plans/${planId}`);
    revalidatePath("/");

    const parts = [
      summary.created > 0 ? `${summary.created} created` : null,
      summary.updated > 0 ? `${summary.updated} updated` : null,
      summary.unchanged > 0 ? `${summary.unchanged} unchanged` : null,
    ].filter(Boolean);
    return successState(`Synced to Hevy — ${parts.join(", ")}.`);
  } catch (error) {
    // Whatever was created before the failure is already recorded, so a retry
    // resumes rather than duplicating routines.
    revalidatePath(`/plans/${planId}`);
    return errorState(describeHevyError(error, "write", "Sync failed."));
  }
}

export async function deletePlanAction(planId: number): Promise<ActionState> {
  await requireIdentity();

  await deletePlan(planId);
  revalidatePath("/");
  redirect("/");
}
