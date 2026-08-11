"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, errorState, successState } from "@/lib/action-state";
import { describeHevyError } from "@/lib/hevy/errors";
import { withPlanLock } from "@/lib/hevy/plan-lock";
import { forkPlan, getPlan, savePlan } from "@/lib/plans";
import { exerciseAt } from "@/lib/planner/alternatives";
import { generatePlan } from "@/lib/planner/generate";
import { applyPlanEdit, exerciseEditSchema } from "@/lib/planner/plan-edit";
import { getPlanLoadSuggestions } from "@/lib/planner/plan-loads";
import type { PlanRequest } from "@/lib/planner/schema";
import { applySuggestedLoads } from "@/lib/planner/suggested-loads";
import { parseRequest, REQUEST_FORM_ERROR } from "../request-form";

// Editing actions, in two flavours that differ in one important way.
//
// A per-exercise tweak edits the plan IN PLACE. A request change FORKS: it
// writes a new plan and leaves the original alone (the owner's decision). The
// asymmetry is deliberate — a request change re-runs generation and replaces
// every day, so the old plan would be gone; a tweak changes one exercise, and
// forking per tweak would leave a dozen near-identical plans behind after an
// afternoon of adjusting one day.

/**
 * Changes one exercise's set count, rep range and rest.
 *
 * In place, under the plan lock, with `expectedTemplateId` re-checked inside it
 * so a second tab editing a stale view is refused rather than silently winning.
 * Only `plans.plan` is written; the request is untouched.
 */
export async function editExerciseAction(
  planId: number,
  dayIndex: number,
  exerciseIndex: number,
  expectedTemplateId: string,
  input: {
    sets: number;
    repStart: number;
    repEnd: number;
    restSeconds: number;
    weightKg?: number | null;
  },
): Promise<ActionState> {
  const parsed = exerciseEditSchema.safeParse(input);
  if (!parsed.success) {
    return errorState(
      "Sets must be 1–12, reps 1–100, rest 0–900 seconds, and any weight 0–1000 kg.",
    );
  }
  // Hevy accepts a reversed range and then renders nonsense, so refuse it here
  // rather than letting it through to the validator as a warning.
  if (parsed.data.repStart > parsed.data.repEnd) {
    return errorState("The rep range is the wrong way round.");
  }

  const result = await withPlanLock(planId, async (): Promise<ActionState> => {
    const row = await getPlan(planId);
    if (!row?.plan) return errorState("Plan not found.");

    const exercise = exerciseAt(row.plan, dayIndex, exerciseIndex);
    if (!exercise) return errorState("This exercise is no longer in the plan.");
    if (exercise.exerciseTemplateId !== expectedTemplateId) {
      return errorState(
        "This exercise changed since the page was loaded — reload the plan and try again.",
      );
    }

    await savePlan(planId, applyPlanEdit(row.plan, dayIndex, exerciseIndex, parsed.data));
    return successState("Updated.");
  });

  if (result.status === "success") {
    revalidatePath(`/plans/${planId}`);
    revalidatePath("/");
  }
  return result;
}

/**
 * Writes the loads suggested from the trainee's history into the plan.
 *
 * The deliberate click that a suggested weight needs before it becomes a plan
 * weight. Until it happens `weightKg` stays null and a sync sends Hevy an empty
 * load field, exactly as before this feature existed; after it, the numbers are
 * ordinary plan data that the per-exercise Edit form can change and the next
 * sync will push. Given that Hevy has no DELETE, that gap between "the app
 * worked out what you should lift" and "your account now says so" is the point,
 * not friction to be optimised away later.
 *
 * The suggestions are RECOMPUTED here from the database rather than taken from
 * the page, for the usual reason a server action never trusts its caller — and
 * for a second one: the page may have been open since before this morning's
 * workout synced, and the loads that get written should be the ones the history
 * implies now.
 */
export async function applySuggestedLoadsAction(planId: number): Promise<ActionState> {
  const result = await withPlanLock(planId, async (): Promise<ActionState> => {
    const row = await getPlan(planId);
    if (!row?.plan) return errorState("Plan not found.");

    const suggestions = await getPlanLoadSuggestions(row.plan);
    const { plan, applied } = applySuggestedLoads(row.plan, suggestions);
    if (applied === 0) {
      return successState("Nothing to change — these loads are already what your history says.");
    }

    await savePlan(planId, plan);
    return successState(
      `Starting loads set on ${applied} exercise${applied === 1 ? "" : "s"}. Nothing has gone to Hevy yet — check them, then sync.`,
    );
  });

  if (result.status === "success") {
    revalidatePath(`/plans/${planId}`);
    revalidatePath("/");
  }
  return result;
}

/**
 * Copies a plan as-is into a new one.
 *
 * The deliberate fork: the plan document and the request (rejections included)
 * carry over, nothing regenerates, and the copy starts unsynced. Useful before
 * a run of tweaks that you want to be able to abandon.
 */
export async function duplicatePlanAction(planId: number): Promise<ActionState> {
  const row = await getPlan(planId);
  if (!row) return errorState("Plan not found.");

  const newId = await forkPlan(planId, row.request, row.plan);
  revalidatePath("/");
  redirect(`/plans/${newId}`);
}

/**
 * Saves an edited request as a NEW plan and generates into it.
 *
 * Never touches the original. That is the point: the original may already have
 * routines in Hevy, and Hevy has no DELETE — so an edit that regenerated in
 * place would rewrite, on the next sync, routines the user might have wanted
 * kept. Forking makes that impossible rather than merely unlikely.
 *
 * The fork carries no `sync_links`, so its first sync CREATES routines rather
 * than replacing the original's. That is the honest cost of not overwriting,
 * and the plan page states it before the button is pressed.
 */
export async function saveRequestAsNewPlanAction(
  sourcePlanId: number,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const source = await getPlan(sourcePlanId);
  if (!source) return errorState("The plan being edited no longer exists.");

  let request: PlanRequest;
  try {
    // The rejection list has no form input, so it is carried across explicitly.
    // A fork that lost it would re-suggest every exercise already swapped away.
    request = parseRequest(formData, {
      excludedExercises: source.request.excludedExercises,
    });
  } catch {
    return errorState(REQUEST_FORM_ERROR);
  }

  // The row is created before generation, exactly as createPlanAction does, so
  // the request that produced a plan is always recorded even if generation dies.
  const newId = await forkPlan(sourcePlanId, request, null);

  let destination: string;
  try {
    const result = await generatePlan(request);
    await savePlan(newId, result.plan);
    const params = new URLSearchParams({ generated: result.source });
    if (result.fallbackReason) params.set("degraded", "1");
    destination = `/plans/${newId}?${params.toString()}`;
  } catch (error) {
    // The empty fork is left in place rather than deleted: unlike a failed new
    // plan, this one records an edit the user made and would have to retype.
    return errorState(describeHevyError(error, "read", "Could not generate the edited plan."));
  }

  revalidatePath("/");
  redirect(destination);
}
