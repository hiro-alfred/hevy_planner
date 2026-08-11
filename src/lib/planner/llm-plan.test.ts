import { describe, expect, it } from "vitest";
import type { CatalogRow } from "@/lib/hevy/catalog";
import { expandPlan, llmPlanSchema, type LlmPlan } from "./llm-plan";
import { sessionSeconds } from "./prescription";
import { buildPrompt, candidateIndex, SYSTEM_PROMPT, type PromptDay } from "./prompt";
import type { PlanRequest } from "./schema";
import { buildTrainingDays } from "./split";

// The compact LLM output shape and the numbered prompt that feeds it. Both exist
// to cut generation latency, so the cost assertions below are part of the
// contract rather than trivia — if a future edit re-inflates the prompt, that is
// the thing worth failing a build over.

let nextId = 0;
function row(overrides: Partial<CatalogRow> = {}): CatalogRow {
  nextId += 1;
  return {
    // A realistic Hevy id: 36 characters, which is the whole reason the prompt
    // numbers candidates instead of naming them.
    id: `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
    title: `Exercise ${nextId}`,
    type: "weight_reps",
    primaryMuscleGroup: "chest",
    secondaryMuscleGroups: [],
    equipmentCategory: "barbell",
    isCustom: false,
    fetchedAt: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

function request(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return {
    goal: "Build muscle",
    sessionMinutes: 60,
    sessionsPerWeek: 4,
    split: "auto",
    experience: "intermediate",
    equipment: ["barbell", "dumbbell"],
    ...overrides,
  };
}

/** Day list with a shared candidate pool, as an upper/lower split produces. */
function days(count: number, pool: CatalogRow[]): PromptDay[] {
  return buildTrainingDays(request({ sessionsPerWeek: count })).map((template) => ({
    template,
    candidates: pool,
  }));
}

describe("expandPlan", () => {
  const pool = [row(), row(), row()];
  const byNumber = candidateIndex(days(2, pool));

  const output: LlmPlan = {
    title: "Test plan",
    progression: "Add reps, then load.",
    days: [
      {
        title: "Upper A",
        exercises: [{ ex: 1, sets: 4, repStart: 8, repEnd: 12, rest: 90, weightKg: 60 }],
      },
      {
        title: "Lower A",
        exercises: [{ ex: 2, sets: 3, repStart: 6, repEnd: 10, rest: 120 }],
      },
    ],
  };

  it("resolves numbers back to catalog ids and titles", () => {
    const { plan, unknownNumbers } = expandPlan(output, byNumber);
    expect(unknownNumbers).toEqual([]);
    expect(plan.days[0]!.exercises[0]!.exerciseTemplateId).toBe(pool[0]!.id);
    expect(plan.days[0]!.exercises[0]!.name).toBe(pool[0]!.title);
    expect(plan.days[1]!.exercises[0]!.exerciseTemplateId).toBe(pool[1]!.id);
  });

  it("expands a set count into that many identical sets", () => {
    const { plan } = expandPlan(output, byNumber);
    const sets = plan.days[0]!.exercises[0]!.sets;
    expect(sets).toHaveLength(4);
    expect(sets.every((set) => set.type === "normal")).toBe(true);
    expect(sets.every((set) => set.repRange.start === 8 && set.repRange.end === 12)).toBe(true);
    expect(sets.every((set) => set.weightKg === 60)).toBe(true);
  });

  it("leaves weight and notes null when the model omitted them", () => {
    const { plan } = expandPlan(output, byNumber);
    const exercise = plan.days[1]!.exercises[0]!;
    expect(exercise.notes).toBeNull();
    expect(exercise.sets.every((set) => set.weightKg === null)).toBe(true);
  });

  it("keeps the session arithmetic the prompt promised", () => {
    const { plan } = expandPlan(output, byNumber);
    // 4 sets x (45 + 90) — the formula the prompt states and the validator runs.
    expect(sessionSeconds(plan.days[0]!.exercises)).toBe(4 * (45 + 90));
  });

  it("DROPS an unresolvable number rather than inventing an id for it", () => {
    const bad: LlmPlan = {
      ...output,
      days: [
        {
          title: "Upper A",
          exercises: [
            { ex: 1, sets: 3, repStart: 8, repEnd: 12, rest: 90 },
            { ex: 99, sets: 3, repStart: 8, repEnd: 12, rest: 90 },
          ],
        },
      ],
    };

    const { plan, unknownNumbers } = expandPlan(bad, byNumber);
    expect(unknownNumbers).toEqual([99]);
    // The point: nothing unresolvable survives into a plan that could be synced.
    expect(plan.days[0]!.exercises).toHaveLength(1);
    expect(plan.days[0]!.exercises[0]!.exerciseTemplateId).toBe(pool[0]!.id);
  });

  it("accepts the shape the model is asked for", () => {
    expect(llmPlanSchema.safeParse(output).success).toBe(true);
    // A set count of zero is meaningless, and a missing number is unresolvable.
    expect(
      llmPlanSchema.safeParse({
        ...output,
        days: [{ title: "x", exercises: [{ ex: 1, sets: 0, repStart: 8, repEnd: 12, rest: 90 }] }],
      }).success,
    ).toBe(false);
  });
});

describe("candidateIndex", () => {
  it("numbers each exercise once, no matter how many days share it", () => {
    const pool = [row(), row()];
    const index = candidateIndex(days(4, pool));
    expect([...index.keys()].sort((a, b) => a - b)).toEqual([1, 2]);
    expect(index.get(1)!.id).toBe(pool[0]!.id);
  });

  it("agrees with the numbers the prompt actually printed", () => {
    const pool = [row({ title: "Alpha" }), row({ title: "Beta" })];
    const promptDays = days(2, pool);
    const text = buildPrompt(request({ sessionsPerWeek: 2 }), promptDays);
    const index = candidateIndex(promptDays);

    for (const [number, catalogRow] of index) {
      expect(text).toContain(`${number} ${catalogRow.title} (`);
    }
  });
});

describe("buildPrompt cost", () => {
  const pool = Array.from({ length: 40 }, () => row({ title: "Barbell Bench Press" }));

  it("never prints a template UUID — that was ~20 tokens per candidate line", () => {
    const text = buildPrompt(request({ sessionsPerWeek: 4 }), days(4, pool));
    for (const candidate of pool) {
      expect(text).not.toContain(candidate.id);
    }
  });

  it("lists a repeated candidate pool once and refers back to it", () => {
    const promptDays = days(4, pool);
    const text = buildPrompt(request({ sessionsPerWeek: 4 }), promptDays);

    // Four days, one pool: the list is printed once, and three days point at it.
    expect(text.split("Choose from:").length - 1).toBe(1);
    expect(text.split("Choose from the same exercises as Day 1.").length - 1).toBe(3);
  });

  it("still prints a genuinely different pool per day", () => {
    const other = Array.from({ length: 5 }, () => row({ primaryMuscleGroup: "quadriceps" }));
    const promptDays = days(2, pool);
    promptDays[1] = { ...promptDays[1]!, candidates: other };

    const text = buildPrompt(request({ sessionsPerWeek: 2 }), promptDays);
    expect(text.split("Choose from:").length - 1).toBe(2);
  });

  it("keeps the whole prompt an order of magnitude under the old one", () => {
    const text = buildPrompt(request({ sessionsPerWeek: 6, split: "push_pull_legs" }), days(6, pool));
    // A 6-day PPL used to print 240 UUID-bearing candidate lines. Characters are
    // a crude proxy for tokens, but the ceiling is far below where it sat.
    expect(text.length).toBeLessThan(6000);
  });

  it("keeps every rule that has a demonstrated effect on the plan", () => {
    // The injury block is the one verified against a real generation; a future
    // round of trimming must not quietly take it out.
    expect(SYSTEM_PROMPT).toContain("HARD EXCLUSIONS");
    expect(SYSTEM_PROMPT).toContain("Raise the rep floor");
    expect(SYSTEM_PROMPT).toContain("do not diagnose");
    expect(SYSTEM_PROMPT).toContain("Err light");
  });
});
