import type { CatalogRow } from "@/lib/hevy/catalog";
import { sessionSeconds } from "./prescription";
import type { Plan, PlanRequest } from "./schema";

// Post-validation for a generated plan (knowledge/decisions/plan-pipeline.md,
// stage 3). Zod already guarantees the SHAPE; these are the checks Zod cannot
// express — that the plan refers to real exercises and actually answers the
// request that was made.
//
// Violations come back as plain sentences because they are fed straight back to
// the model on the retry attempt.

/** A generated session may miss the requested length by this much either way. */
const SESSION_LENGTH_TOLERANCE = 0.2;

export function collectTemplateIds(plan: Plan): string[] {
  return plan.days.flatMap((day) => day.exercises.map((exercise) => exercise.exerciseTemplateId));
}

export function validatePlan(
  plan: Plan,
  request: PlanRequest,
  catalog: Map<string, CatalogRow>,
): string[] {
  const violations: string[] = [];

  // 1. Every exercise must exist in the cached catalog — an invented id would
  //    fail at sync time, long after the user accepted the plan.
  const unknown = [...new Set(collectTemplateIds(plan))].filter((id) => !catalog.has(id));
  if (unknown.length > 0) {
    violations.push(
      `These exerciseTemplateId values are not in the catalog and must be replaced with ids from the provided list: ${unknown.join(", ")}.`,
    );
  }

  // 2. Day count must match what was asked for.
  if (plan.days.length !== request.sessionsPerWeek) {
    violations.push(
      `The plan has ${plan.days.length} training days but ${request.sessionsPerWeek} were requested.`,
    );
  }

  // 3. Each session must be plausibly the requested length.
  const target = request.sessionMinutes * 60;
  const low = target * (1 - SESSION_LENGTH_TOLERANCE);
  const high = target * (1 + SESSION_LENGTH_TOLERANCE);
  plan.days.forEach((day, index) => {
    const seconds = sessionSeconds(day.exercises);
    if (seconds < low || seconds > high) {
      violations.push(
        `Day ${index + 1} ("${day.title}") works out to about ${Math.round(seconds / 60)} minutes, ` +
          `but ${request.sessionMinutes} minutes were requested. Adjust the number of exercises, ` +
          `sets, or rest to land within ${Math.round(SESSION_LENGTH_TOLERANCE * 100)}%.`,
      );
    }
  });

  // 4. Exercises the trainee has already rejected on this plan must not come
  //    back. Candidate lists already omit them, so the model has to go out of
  //    its way to reach one — but in json_object mode id compliance is only ever
  //    REQUESTED, never enforced, so the validator is the actual barrier. A
  //    regenerate that quietly restored a swapped-away exercise would make the
  //    swap feature look broken in the one place it is meant to hold.
  const excluded = new Set(request.excludedExercises ?? []);
  if (excluded.size > 0) {
    const reintroduced = [...new Set(collectTemplateIds(plan))].filter((id) => excluded.has(id));
    if (reintroduced.length > 0) {
      violations.push(
        `The trainee has rejected these exercises and they must not appear in the plan — ` +
          `choose different ids from the candidate lists: ${reintroduced
            .map((id) => catalog.get(id)?.title ?? id)
            .join(", ")}.`,
      );
    }
  }

  // 5. Rep ranges must be the right way round — Hevy accepts start > end and
  //    then renders nonsense.
  plan.days.forEach((day, dayIndex) => {
    day.exercises.forEach((exercise) => {
      for (const set of exercise.sets) {
        if (set.repRange.start > set.repRange.end) {
          violations.push(
            `Day ${dayIndex + 1} "${exercise.name}" has a reversed rep range (${set.repRange.start}-${set.repRange.end}).`,
          );
          return;
        }
      }
    });
  });

  return violations;
}
