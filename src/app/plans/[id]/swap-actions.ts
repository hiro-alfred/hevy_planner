"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, errorState, successState } from "@/lib/action-state";
import { getCandidates, getTemplateById } from "@/lib/hevy/catalog";
import { withPlanLock } from "@/lib/hevy/plan-lock";
import { getPlan, savePlanEdit, saveRequest } from "@/lib/plans";
import {
  type Alternative,
  applySwap,
  dayTemplateIds,
  exerciseAt,
  rankAlternatives,
  toAlternative,
} from "@/lib/planner/alternatives";
import { planRequestSchema } from "@/lib/planner/schema";

// Server actions for the exercise swap (knowledge/decisions/exercise-alternatives.md).
//
// Kept out of plans/actions.ts so neither file drifts past the 300-line rule,
// and because these three share a set of lookups the plan-level actions do not.

/** Pool size for one picker-open. Paged client-side, so this is fetched once. */
const POOL_SIZE = 40;

/** The per-plan rejection cap, matching planRequestSchema's `.max(100)`. */
const MAX_EXCLUSIONS = 100;

export interface AlternativesResult {
  options: Alternative[];
  /** Set when the pool came back empty or short — the picker says so plainly. */
  message: string | null;
}

/**
 * The ranked alternative pool for one exercise.
 *
 * ONE query per picker-open, not one per option shown: the whole ranked pool
 * comes back and "more alternatives" advances a client-side offset, so the first
 * click costs a local query and every later click costs nothing. Alternatives
 * come from the catalog and never from the LLM — browsing tolerates ~100 ms, not
 * the 1–3.5 minutes a generation call measures, and a hallucinated id here would
 * be a sync-time landmine rather than a cosmetic error.
 */
export async function loadAlternativesAction(
  planId: number,
  dayIndex: number,
  exerciseIndex: number,
): Promise<AlternativesResult> {
  const row = await getPlan(planId);
  if (!row?.plan) return { options: [], message: "This plan is no longer available." };

  const exercise = exerciseAt(row.plan, dayIndex, exerciseIndex);
  if (!exercise) return { options: [], message: "This exercise is no longer in the plan." };

  const outgoing = await getTemplateById(exercise.exerciseTemplateId);
  if (!outgoing) {
    return {
      options: [],
      message:
        "This exercise is not in the cached catalog, so there is nothing to compare against. Refresh the catalog on the settings page.",
    };
  }

  // Excluded from the pool: everything already on this day (a day must not
  // contain the same movement twice), the outgoing exercise itself, and
  // everything previously rejected on this plan.
  const excludeIds = [
    ...new Set([
      ...dayTemplateIds(row.plan, dayIndex),
      ...(row.request.excludedExercises ?? []),
    ]),
  ];

  const pool = await getCandidates({
    equipment: row.request.equipment,
    muscleGroups: [outgoing.primaryMuscleGroup],
    excludeIds,
    limit: POOL_SIZE,
  });

  // Exhaustion is real — bodyweight-only calves can be a pool of two. Say so
  // rather than looping back to the start of the list, which reads as broken.
  const message =
    pool.length === 0
      ? "No other exercise in the catalog matches this muscle group with your equipment. Widen the equipment selection, or clear some rejected exercises below."
      : null;

  return { options: rankAlternatives(pool, outgoing).map(toAlternative), message };
}

/**
 * Replaces one exercise, and records the outgoing one as rejected for this plan.
 *
 * Read-modify-write under `withPlanLock`, with `expectedTemplateId` checked
 * inside the lock: a second tab showing a stale preview gets a clean refusal
 * instead of silently clobbering a swap it never saw.
 *
 * This writes `plans.plan` and `plans.request` and touches NOTHING else. Every
 * existing mechanism then does its job unmodified — the day's content hash stops
 * matching `sync_links`, the chip flips to "Changes pending", and the next
 * EXPLICIT sync takes the PUT branch against the stored routine id: zero POSTs,
 * zero quota consumed, nothing stranded. There is deliberately no auto-sync
 * here; every Hevy write is irreversible.
 */
export async function swapExerciseAction(
  planId: number,
  dayIndex: number,
  exerciseIndex: number,
  expectedTemplateId: string,
  replacementId: string,
): Promise<ActionState> {
  // Never trust the client's id: the picker cannot produce an unknown one, but
  // the action is a public entry point, and an id the catalog does not know
  // would fail at sync time — long after the user accepted the plan.
  const replacement = await getTemplateById(replacementId);
  if (!replacement) {
    return errorState("That exercise is not in the cached catalog. Refresh it on the settings page.");
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

    const excluded = row.request.excludedExercises ?? [];
    if (!excluded.includes(expectedTemplateId) && excluded.length >= MAX_EXCLUSIONS) {
      return errorState(
        `This plan has already rejected ${MAX_EXCLUSIONS} exercises. Clear some from the rejected list before swapping again.`,
      );
    }

    // A swap is a permanent rejection FOR THIS PLAN. Options merely browsed past
    // are not recorded — scrolling past an exercise is not a verdict on it, and
    // treating it as one would starve the pool within a few sessions.
    const request = planRequestSchema.parse({
      ...row.request,
      excludedExercises: [...new Set([...excluded, expectedTemplateId])],
    });

    await savePlanEdit(planId, applySwap(row.plan, dayIndex, exerciseIndex, replacement), request);
    return successState(`Swapped in ${replacement.title}.`);
  });

  if (result.status === "success") {
    revalidatePath(`/plans/${planId}`);
    revalidatePath("/");
  }
  return result;
}

/**
 * Un-rejects one exercise, or all of them, for this plan.
 *
 * Without this the first accidental swap is permanent — the design flagged that
 * gap explicitly, so the list and its undo ship in the same pass as the swap.
 * Clearing only restores an exercise to the CANDIDATE POOL; it does not put it
 * back into the plan, which would undo a swap the user may since have built on.
 */
export async function clearExclusionAction(
  planId: number,
  templateId: string | null,
): Promise<ActionState> {
  const result = await withPlanLock(planId, async (): Promise<ActionState> => {
    const row = await getPlan(planId);
    if (!row) return errorState("Plan not found.");

    const excluded = row.request.excludedExercises ?? [];
    const kept = templateId === null ? [] : excluded.filter((id) => id !== templateId);
    if (kept.length === excluded.length) return errorState("That exercise was not on the list.");

    const request = planRequestSchema.parse({
      ...row.request,
      excludedExercises: kept.length > 0 ? kept : undefined,
    });

    // Request-only: restoring an exercise to the pool does not alter the plan on
    // screen, so nothing here should mark it edited or touch its sync state.
    await saveRequest(planId, request);

    return successState(
      templateId === null
        ? "Cleared every rejected exercise. Regenerate to let them back in."
        : "Restored to the pool. Regenerate, or swap, to let it back in.",
    );
  });

  if (result.status === "success") revalidatePath(`/plans/${planId}`);
  return result;
}
