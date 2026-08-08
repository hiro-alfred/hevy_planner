import { describe, expect, it } from "vitest";
import type { CatalogRow } from "@/lib/hevy/catalog";
import { derivePhase, describeLifts, hasAnchors } from "./profile";
import { buildPrompt, type PromptDay } from "./prompt";
import { planRequestSchema, type PlanRequest } from "./schema";
import { buildTrainingDays } from "./split";

// The optional trainee profile: what gets derived, and what reaches the prompt.
// The load-bearing property is that an ABSENT field produces no prompt text at
// all — a bare request must still build the prompt it always did.

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

function candidate(id: string): CatalogRow {
  return {
    id,
    title: `Exercise ${id}`,
    type: "weight_reps",
    primaryMuscleGroup: "chest",
    secondaryMuscleGroups: [],
    equipmentCategory: "barbell",
    isCustom: false,
    fetchedAt: "2026-08-08T00:00:00.000Z",
  };
}

function promptFor(overrides: Partial<PlanRequest> = {}): string {
  const req = request(overrides);
  const days: PromptDay[] = buildTrainingDays(req).map((template) => ({
    template,
    candidates: [candidate("ex-1")],
  }));
  return buildPrompt(req, days);
}

describe("derivePhase", () => {
  it("returns null unless BOTH weights are known", () => {
    expect(derivePhase(request())).toBeNull();
    expect(derivePhase(request({ bodyweightKg: 82 }))).toBeNull();
    expect(derivePhase(request({ targetWeightKg: 78 }))).toBeNull();
  });

  it("reads a phase from the gap between current and target", () => {
    expect(derivePhase(request({ bodyweightKg: 82, targetWeightKg: 74 }))).toBe("cut");
    expect(derivePhase(request({ bodyweightKg: 74, targetWeightKg: 82 }))).toBe("bulk");
  });

  it("treats a target within 2 kg as holding weight, in both directions", () => {
    expect(derivePhase(request({ bodyweightKg: 82, targetWeightKg: 82 }))).toBe("maintain");
    expect(derivePhase(request({ bodyweightKg: 82, targetWeightKg: 80 }))).toBe("maintain");
    expect(derivePhase(request({ bodyweightKg: 82, targetWeightKg: 84 }))).toBe("maintain");
    // Just outside the band is not maintenance.
    expect(derivePhase(request({ bodyweightKg: 82, targetWeightKg: 79.5 }))).toBe("cut");
  });
});

describe("anchors", () => {
  it("does not count an empty or absent lifts object as anchors", () => {
    expect(hasAnchors(undefined)).toBe(false);
    expect(hasAnchors({})).toBe(false);
    expect(hasAnchors({ squatKg: undefined })).toBe(false);
  });

  it("counts a single known lift", () => {
    expect(hasAnchors({ benchKg: 80 })).toBe(true);
  });

  it("describes only the lifts that were given", () => {
    expect(describeLifts({ squatKg: 100, benchKg: 80 })).toBe("Back squat 100 kg, Bench press 80 kg");
    expect(describeLifts({ deadliftKg: 140 })).toBe("Deadlift 140 kg");
  });
});

describe("buildPrompt with an optional profile", () => {
  it("omits every optional section when nothing was filled in", () => {
    const prompt = promptFor();
    expect(prompt).not.toContain("## About the trainee");
    expect(prompt).not.toContain("## Constraints to work around");
    expect(prompt).not.toContain("## In the trainee's own words");
    // Nothing may leak as an empty placeholder either.
    expect(prompt).not.toContain("undefined");
    expect(prompt).not.toContain("unknown");
  });

  it("sends the derived phase and never the raw target weight", () => {
    const prompt = promptFor({ bodyweightKg: 82, targetWeightKg: 74 });
    expect(prompt).toContain("## About the trainee");
    expect(prompt).toContain("Bodyweight: 82 kg");
    expect(prompt).toContain("Phase: cut");
    expect(prompt).not.toContain("74");
  });

  it("asks for anchored starting weights only when a lift is known", () => {
    expect(promptFor()).not.toContain("anchors");
    const prompt = promptFor({ currentLifts: { squatKg: 100 } });
    expect(prompt).toContain("Back squat 100 kg");
    expect(prompt).toContain("anchors");
  });

  it("carries injuries, emphasis and notes through to their own sections", () => {
    const prompt = promptFor({
      injuries: "right shoulder impingement",
      focusMuscleGroups: ["upper_back"],
      notes: "I run on Tuesdays",
    });
    expect(prompt).toContain("Injuries or problem areas: right shoulder impingement");
    expect(prompt).toContain("Extra emphasis: Upper back");
    expect(prompt).toContain("## In the trainee's own words");
    expect(prompt).toContain("I run on Tuesdays");
  });
});

describe("planRequestSchema", () => {
  it("still accepts a request with no profile at all", () => {
    expect(() => planRequestSchema.parse(request())).not.toThrow();
  });

  it("rejects implausible numbers rather than storing them", () => {
    expect(() => planRequestSchema.parse(request({ bodyweightKg: 5 }))).toThrow();
    expect(() => planRequestSchema.parse(request({ age: 4 }))).toThrow();
  });

  it("caps emphasis at two muscle groups", () => {
    expect(() =>
      planRequestSchema.parse(request({ focusMuscleGroups: ["chest", "biceps", "calves"] })),
    ).toThrow();
  });
});
