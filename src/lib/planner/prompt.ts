import type { CatalogRow } from "@/lib/hevy/catalog";
import { EQUIPMENT_LABELS, type EquipmentCategory } from "@/lib/hevy/constants";
import { planVolume, prescribe, SECONDS_PER_SET } from "./prescription";
import type { PlanRequest } from "./schema";
import type { TrainingDayTemplate } from "./split";

// Prompt construction for LLM plan generation. Kept apart from the generation
// loop so the wording can be tuned without touching the retry/validation logic.

export const SYSTEM_PROMPT = `You are an experienced strength coach writing a training plan that will be pushed into the Hevy app.

Rules you must follow:
- Use ONLY exercises from the candidate list you are given, and copy their id exactly. Never invent an id or use an exercise that is not listed.
- Produce exactly the number of training days requested, in a sensible weekly order.
- Every set uses a rep range. Give the same rep range across an exercise's working sets.
- Rest is per exercise, in seconds, not per set.
- Leave weightKg null. You do not know the trainee's current loads, and a wrong starting weight is worse than an empty field.
- Order each day compounds first, then accessories.
- The progression field is one short paragraph telling the trainee how to add load or reps over the coming weeks.

Write for a real person: exercise selection should cover the day's muscle groups without redundant overlap.`;

function describeCandidate(row: CatalogRow): string {
  const equipment = EQUIPMENT_LABELS[row.equipmentCategory as EquipmentCategory] ?? row.equipmentCategory;
  return `${row.id} — ${row.title} (${row.primaryMuscleGroup}, ${equipment})`;
}

export interface PromptDay {
  template: TrainingDayTemplate;
  candidates: CatalogRow[];
}

/**
 * Builds the user prompt: the request, the per-day candidate lists, and the
 * session-length arithmetic the plan will be validated against.
 *
 * Candidates are listed per day rather than as one pooled list so the model
 * sees which exercises belong to which session.
 */
export function buildPrompt(request: PlanRequest, days: PromptDay[]): string {
  const prescription = prescribe(request);
  const volume = planVolume(request, prescription);

  const dayBlocks = days
    .map((day, index) => {
      const lines = day.candidates.map(describeCandidate).join("\n");
      return [
        `### Day ${index + 1}: ${day.template.title}`,
        `Target muscle groups: ${day.template.muscleGroups.join(", ")}`,
        `Candidate exercises:`,
        lines || "(none available — say so in the plan rather than inventing exercises)",
      ].join("\n");
    })
    .join("\n\n");

  return [
    `## Trainee request`,
    `- Goal: ${request.goal}`,
    `- Experience: ${request.experience}`,
    `- Sessions per week: ${request.sessionsPerWeek}`,
    `- Session length: ${request.sessionMinutes} minutes`,
    `- Available equipment: ${request.equipment.join(", ") || "anything"}`,
    ``,
    `## Prescription to follow`,
    `- Goal type: ${prescription.goalKind}`,
    `- Rep range: ${prescription.repRange.start}-${prescription.repRange.end}`,
    `- Working sets per exercise: ${volume.setsPerExercise}`,
    `- Rest between sets: ${prescription.restSeconds} seconds`,
    `- Roughly ${volume.exerciseCount} exercises per day`,
    ``,
    `## Session length check`,
    `A session is scored as: sum over every set of (${SECONDS_PER_SET}s of work + that exercise's rest).`,
    `The result must land within 20% of ${request.sessionMinutes} minutes for every day.`,
    ``,
    `## Training days and their candidate exercises`,
    dayBlocks,
  ].join("\n");
}

/** Appends the validator's complaints for the single retry attempt. */
export function buildRetryPrompt(prompt: string, violations: string[]): string {
  return [
    prompt,
    ``,
    `## Your previous attempt was rejected`,
    `Fix every problem below and return a corrected plan:`,
    ...violations.map((violation) => `- ${violation}`),
  ].join("\n");
}
