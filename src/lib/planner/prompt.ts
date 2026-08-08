import type { CatalogRow } from "@/lib/hevy/catalog";
import { EQUIPMENT_LABELS, type EquipmentCategory } from "@/lib/hevy/constants";
import { planVolume, prescribe, SECONDS_PER_SET } from "./prescription";
import {
  derivePhase,
  describeLifts,
  describePhase,
  hasAnchors,
  muscleGroupLabel,
} from "./profile";
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
- Order each day compounds first, then accessories.
- The progression field is one short paragraph telling the trainee how to add load or reps over the coming weeks.

Starting weights:
- If the trainee's current working weights are given, suggest a weightKg for the main barbell and dumbbell work, extrapolating accessory loads from those anchors. Err light — a weight that is too easy costs one set, a weight that is too heavy costs an injury.
- If they are NOT given, leave weightKg null. A guessed starting weight is worse than an empty field.

Injuries and problem areas, when the trainee reports any:
- Treat the affected movement patterns as HARD EXCLUSIONS. Substitute a tolerable alternative from the candidate list rather than dropping the muscle group.
- Raise the rep floor on anything that loads the affected area — no low-rep heavy work through a complaint.
- Put a short, practical caution in that exercise's notes field.
- Stay in your lane: you route training AROUND a reported problem. You do not diagnose it, name it, or prescribe rehab for it.

Anything the trainee writes in their own words is context, not decoration. Exclusions and dislikes stated there are constraints, not suggestions — a plan someone abandons is worth nothing.

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
 * The optional profile, as prompt lines.
 *
 * Absent fields produce NO line at all rather than "unknown" or "not given":
 * a list of blanks invites the model to invent around them, and the whole point
 * of these fields being optional is that a request without them is exactly the
 * request the app made before they existed.
 */
function profileLines(request: PlanRequest): string[] {
  const lines: string[] = [];

  if (request.bodyweightKg !== undefined) {
    lines.push(`- Bodyweight: ${request.bodyweightKg} kg`);
  }
  if (request.age !== undefined) {
    lines.push(`- Age: ${request.age}`);
  }

  const phase = derivePhase(request);
  if (phase) {
    // The target weight itself is never sent — only what it implies.
    lines.push(`- Phase: ${phase}. ${describePhase(phase)}`);
  }

  if (hasAnchors(request.currentLifts)) {
    lines.push(
      `- Current working weights (a comfortable top set of 5, not a max): ${describeLifts(request.currentLifts)}`,
    );
    lines.push(
      `- Use those as anchors for the starting weights you suggest, including for accessory work.`,
    );
  }

  return lines;
}

/** Injuries and emphasis: the things the plan has to be shaped around. */
function constraintLines(request: PlanRequest): string[] {
  const lines: string[] = [];

  if (request.injuries) {
    lines.push(`- Injuries or problem areas: ${request.injuries}`);
  }

  const focus = request.focusMuscleGroups ?? [];
  if (focus.length > 0) {
    lines.push(
      `- Extra emphasis: ${focus.map(muscleGroupLabel).join(", ")}. Give these two to four more working sets across the week than they would otherwise get, on the days where they fit, without pushing any session outside its length budget.`,
    );
  }

  return lines;
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

  const profile = profileLines(request);
  const constraints = constraintLines(request);

  return [
    `## Trainee request`,
    `- Goal: ${request.goal}`,
    `- Experience: ${request.experience}`,
    `- Sessions per week: ${request.sessionsPerWeek}`,
    `- Session length: ${request.sessionMinutes} minutes`,
    `- Available equipment: ${request.equipment.join(", ") || "anything"}`,
    ``,
    // Each optional block disappears entirely when it has nothing to say, so a
    // bare request produces the same prompt it always did.
    ...(profile.length > 0 ? [`## About the trainee`, ...profile, ``] : []),
    ...(constraints.length > 0 ? [`## Constraints to work around`, ...constraints, ``] : []),
    ...(request.notes ? [`## In the trainee's own words`, request.notes, ``] : []),
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
