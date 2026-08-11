import type { CatalogRow } from "@/lib/hevy/catalog";
import { sessionSeconds } from "./prescription";
import type { Plan, PlanDay, PlanRequest } from "./schema";
import { buildTrainingDays } from "./split";

// Post-validation for a generated plan (knowledge/decisions/plan-pipeline.md,
// stage 3). Zod already guarantees the SHAPE; these are the checks Zod cannot
// express — that the plan refers to real exercises and actually answers the
// request that was made.
//
// Violations come back as plain sentences because they are fed straight back to
// the model on the retry attempt.

/** A generated session may miss the requested length by this much either way. */
const SESSION_LENGTH_TOLERANCE = 0.2;

/** Exercises on one primary muscle before a day is leaning on it. */
const CROWDING_THRESHOLD = 3;

/** A day targeting fewer groups than this is allowed to be lopsided. */
const MIN_TARGETS_TO_JUDGE = 3;

/**
 * Flags a day that spent its exercises on one muscle while missing another it
 * was built to train.
 *
 * Deliberately the narrowest rule that still catches something real, because a
 * violation is not free: it costs a whole extra LLM generation on the retry, and
 * the rule-based fallback is validated against these same checks, so a noisy
 * rule would make the offline generator report problems with its own output.
 *
 * Both halves must hold. Crowding alone is normal — a legs day with squat, leg
 * press and extension is three quad movements and nobody is upset. A missing
 * group alone is normal too — a 3-exercise full-body day cannot reach six groups,
 * and secondary work covers more of them than the exercise count suggests. It is
 * only the two TOGETHER that say the day had room and spent it badly.
 */
function crowdedDay(day: PlanDay, targets: string[], catalog: Map<string, CatalogRow>): string | null {
  if (targets.length < MIN_TARGETS_TO_JUDGE) return null;

  const rows = day.exercises.map((e) => catalog.get(e.exerciseTemplateId)).filter(Boolean);
  const primaryCounts = new Map<string, number>();
  const touched = new Set<string>();
  for (const row of rows as CatalogRow[]) {
    primaryCounts.set(row.primaryMuscleGroup, (primaryCounts.get(row.primaryMuscleGroup) ?? 0) + 1);
    touched.add(row.primaryMuscleGroup);
    for (const group of row.secondaryMuscleGroups ?? []) touched.add(group);
  }

  const crowded = [...primaryCounts].filter(([, n]) => n >= CROWDING_THRESHOLD).map(([g]) => g);
  // Untouched means untouched: a group reached even as a SECONDARY is covered
  // for this purpose, which is what keeps quad-heavy legs days out of the net.
  const missed = targets.filter((group) => !touched.has(group));
  if (crowded.length === 0 || missed.length === 0) return null;

  return (
    `has ${crowded.map((g) => `${primaryCounts.get(g)} ${g.replace(/_/g, " ")} exercises`).join(" and ")} ` +
    `but nothing at all for ${missed.map((g) => g.replace(/_/g, " ")).join(", ")}. ` +
    `Replace one of the duplicates with a movement for the missing group`
  );
}

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

  // 5. A day must not spend its exercises on one muscle while skipping another
  //    it was built to train. The swap picker enforces this one exercise at a
  //    time (knowledge/decisions/exercise-alternatives.md); this is the same
  //    rule at the point the day is first written, so a lopsided day is caught
  //    before anyone has to repair it by hand.
  const targets = buildTrainingDays(request);
  plan.days.forEach((day, index) => {
    const problem = crowdedDay(day, targets[index]?.muscleGroups ?? [], catalog);
    if (problem) {
      violations.push(`Day ${index + 1} ("${day.title}") ${problem}.`);
    }
  });

  // 6. Rep ranges must be the right way round — Hevy accepts start > end and
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
