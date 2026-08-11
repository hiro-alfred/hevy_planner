import type { CatalogRow } from "@/lib/hevy/catalog";
import { EQUIPMENT_LABELS, type EquipmentCategory } from "@/lib/hevy/constants";
import { planVolume, prescribe, SECONDS_PER_SET } from "./prescription";
import {
  describeLifts,
  describePhase,
  hasAnchors,
  muscleGroupLabel,
  resolvePhase,
} from "./profile";
import type { PlanRequest } from "./schema";
import type { TrainingDayTemplate } from "./split";

// Prompt construction for LLM plan generation. Kept apart from the generation
// loop so the wording can be tuned without touching the retry/validation logic.

// Every line here is paid for on every generation, so each one has to earn its
// place. The rules kept below are the ones with a demonstrated effect on output;
// the wording is compressed, but no RULE was dropped — in particular the injury
// block, which was verified against a real generation and is the only thing
// standing between a reported complaint and a plan that loads it.
export const SYSTEM_PROMPT = `You are an experienced strength coach writing a training plan for the Hevy app. Return only the requested JSON.

Rules:
- Pick exercises ONLY by the number they are listed under. Never invent a number or use one that is not listed for that day.
- Produce exactly the number of training days requested, in a sensible weekly order.
- Order each day compounds first, then accessories, covering the day's muscle groups without redundant overlap.
- "sets" is the count of working sets; repStart/repEnd is the rep range they all share; "rest" is per exercise, in seconds.
- "progression" is one short paragraph on adding load or reps over the coming weeks.

Starting weights:
- If the trainee's working weights are given, set weightKg for the main barbell and dumbbell work and extrapolate accessory loads from those anchors. Err light — too easy costs one set, too heavy costs an injury.
- If they are not given, omit weightKg. A guessed starting weight is worse than an empty field.

Injuries and problem areas, when reported:
- Treat the affected movement patterns as HARD EXCLUSIONS. Substitute a tolerable listed alternative rather than dropping the muscle group.
- Raise the rep floor on anything loading the affected area — no low-rep heavy work through a complaint.
- Put a short, practical caution in that exercise's "notes".
- Stay in your lane: you route training AROUND a problem. You do not diagnose it, name it, or prescribe rehab.

What the trainee writes in their own words is context, not decoration: exclusions and dislikes stated there are constraints. A plan someone abandons is worth nothing.

Omit "notes" and "weightKg" entirely when you have nothing to put in them.`;

/**
 * Numbers every candidate once, across the whole prompt.
 *
 * One shared numbering rather than per-day numbering, because days overlap
 * heavily — an upper/lower split draws Upper A and Upper B from the same pool —
 * and a stable number per exercise is what lets a repeated day say "the same
 * candidates as Day 1" instead of restating forty lines.
 */
function numberCandidates(days: PromptDay[]): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const day of days) {
    for (const row of day.candidates) {
      if (!numbers.has(row.id)) numbers.set(row.id, numbers.size + 1);
    }
  }
  return numbers;
}

/** The reverse lookup generation needs to turn the model's numbers back into ids. */
export function candidateIndex(days: PromptDay[]): Map<number, CatalogRow> {
  const numbers = numberCandidates(days);
  const byNumber = new Map<number, CatalogRow>();
  for (const day of days) {
    for (const row of day.candidates) {
      byNumber.set(numbers.get(row.id)!, row);
    }
  }
  return byNumber;
}

function describeCandidate(row: CatalogRow, number: number): string {
  const equipment = EQUIPMENT_LABELS[row.equipmentCategory as EquipmentCategory] ?? row.equipmentCategory;
  // The UUID is deliberately absent: it is ~20 tokens per line and the model
  // never needs to see it. `candidateIndex` maps the number back afterwards.
  return `${number} ${row.title} (${row.primaryMuscleGroup}, ${equipment})`;
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

  // Age is deliberately not sent. It was a bare number with no instruction
  // attached, so anything it changed came from the model's own assumptions
  // about a number rather than from a rule this app wrote down.
  const phase = resolvePhase(request);
  if (phase) {
    // Never the raw weights — only what the phase means for programming.
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
  const numbers = numberCandidates(days);

  // Days that draw on exactly the same candidates point at the first of them
  // rather than repeating the list. On a 4-day upper/lower this halves the
  // largest block in the prompt, and on a 6-day PPL it cuts it to a third —
  // without weakening the per-day association, which is what tells the model
  // which exercises belong to which session.
  const seen = new Map<string, number>();

  const dayBlocks = days
    .map((day, index) => {
      const head = [
        `### Day ${index + 1}: ${day.template.title}`,
        `Target: ${day.template.muscleGroups.join(", ")}`,
      ];
      if (day.candidates.length === 0) {
        return [...head, "(none available — say so in the plan rather than inventing exercises)"].join("\n");
      }

      const key = day.candidates.map((row) => row.id).join(",");
      const earlier = seen.get(key);
      if (earlier !== undefined) {
        return [...head, `Choose from the same exercises as Day ${earlier}.`].join("\n");
      }
      seen.set(key, index + 1);

      const lines = day.candidates
        .map((row) => describeCandidate(row, numbers.get(row.id)!))
        .join("\n");
      return [...head, "Choose from:", lines].join("\n");
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
    // Stated as the arithmetic the validator actually runs, in the same
    // vocabulary the output uses, so the model can check its own work before
    // spending a second call on a retry.
    `Each exercise costs sets x (${SECONDS_PER_SET}s + rest). Every day's total must land within 20% of ${request.sessionMinutes} minutes.`,
    ``,
    `## Training days`,
    dayBlocks,
  ].join("\n");
}

/**
 * Appends the validator's complaints for the single retry attempt.
 *
 * The violations go on the END of the unchanged base prompt, and that ordering
 * is worth keeping: DeepSeek caches on a request's leading tokens, so an
 * identical prefix means the retry re-reads the candidate lists off cache rather
 * than paying for them twice. Rebuilding the prompt with the complaints near the
 * top would read better and cost a full second pass.
 */
export function buildRetryPrompt(prompt: string, violations: string[]): string {
  return [
    prompt,
    ``,
    `## Your previous attempt was rejected`,
    `Fix every problem below and return a corrected plan:`,
    ...violations.map((violation) => `- ${violation}`),
  ].join("\n");
}
