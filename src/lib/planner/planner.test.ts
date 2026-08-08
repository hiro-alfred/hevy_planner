import { describe, expect, it } from "vitest";
import type { CatalogRow } from "@/lib/hevy/catalog";
import { classifyGoal, exerciseSeconds, planVolume, prescribe, sessionSeconds } from "./prescription";
import { buildRuleBasedPlan, type DayCandidates } from "./rules";
import type { Plan, PlanRequest } from "./schema";
import { buildTrainingDays, resolveSplit } from "./split";
import { validatePlan } from "./validate";

// Pure planner logic — no database, no network. The generator is deterministic
// by design, so these assert exact output rather than "looks plausible".

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

let nextId = 0;
function row(overrides: Partial<CatalogRow> = {}): CatalogRow {
  nextId += 1;
  return {
    id: `ex-${nextId}`,
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

describe("split", () => {
  it("picks a split from training frequency when asked to choose", () => {
    expect(resolveSplit("auto", 2)).toBe("full_body");
    expect(resolveSplit("auto", 4)).toBe("upper_lower");
    expect(resolveSplit("auto", 6)).toBe("push_pull_legs");
    expect(resolveSplit("full_body", 6)).toBe("full_body");
  });

  it("produces exactly one day per requested session", () => {
    for (const sessionsPerWeek of [2, 3, 4, 5, 6]) {
      const days = buildTrainingDays(request({ sessionsPerWeek }));
      expect(days).toHaveLength(sessionsPerWeek);
    }
  });

  it("suffixes only titles that actually repeat", () => {
    const ppl = buildTrainingDays(request({ split: "push_pull_legs", sessionsPerWeek: 3 }));
    expect(ppl.map((day) => day.title)).toEqual(["Push", "Pull", "Legs"]);

    const upperLower = buildTrainingDays(request({ split: "upper_lower", sessionsPerWeek: 4 }));
    expect(upperLower.map((day) => day.title)).toEqual(["Upper A", "Lower A", "Upper B", "Lower B"]);
  });
});

describe("prescription", () => {
  it("reads the goal from free text and defaults to hypertrophy", () => {
    expect(classifyGoal("get as strong as possible")).toBe("strength");
    expect(classifyGoal("improve conditioning")).toBe("endurance");
    expect(classifyGoal("put on size")).toBe("hypertrophy");
    expect(classifyGoal("just feel better")).toBe("hypertrophy");
  });

  it("charges every set its work plus its rest", () => {
    expect(exerciseSeconds(3, 60)).toBe(3 * (45 + 60));
  });

  it("keeps beginners to shorter sessions", () => {
    const beginner = planVolume(request({ experience: "beginner" }), prescribe(request()));
    const advanced = planVolume(request({ experience: "advanced" }), prescribe(request()));
    expect(beginner.exerciseCount).toBeLessThan(advanced.exerciseCount);
  });

  /**
   * The regression this guards: with only an exercise cap, a 90-minute session
   * could not be filled and every plan failed its own length validation. Sets
   * have to absorb the leftover time.
   */
  it("can fill any offered session length within tolerance", () => {
    for (const goal of ["get strong", "build muscle", "improve conditioning"]) {
      for (const experience of ["beginner", "intermediate", "advanced"] as const) {
        for (const sessionMinutes of [30, 45, 60, 75, 90]) {
          const req = request({ goal, experience, sessionMinutes });
          const prescription = prescribe(req);
          const volume = planVolume(req, prescription);
          const seconds = volume.exerciseCount * exerciseSeconds(volume.setsPerExercise, prescription.restSeconds);
          const target = sessionMinutes * 60;
          expect(
            Math.abs(seconds - target) / target,
            `${goal} / ${experience} / ${sessionMinutes}min → ${Math.round(seconds / 60)}min`,
          ).toBeLessThanOrEqual(0.2);
        }
      }
    }
  });
});

describe("rule-based generation", () => {
  const candidates = [
    row({ primaryMuscleGroup: "chest", equipmentCategory: "barbell", title: "Bench Press" }),
    row({ primaryMuscleGroup: "chest", equipmentCategory: "dumbbell", title: "DB Press" }),
    row({ primaryMuscleGroup: "lats", equipmentCategory: "barbell", title: "Row" }),
    row({ primaryMuscleGroup: "quadriceps", equipmentCategory: "barbell", title: "Squat" }),
    row({ primaryMuscleGroup: "biceps", equipmentCategory: "dumbbell", title: "Curl" }),
    row({ primaryMuscleGroup: "shoulders", equipmentCategory: "dumbbell", title: "Lateral Raise" }),
  ];

  function days(count: number, req = request()): DayCandidates[] {
    return buildTrainingDays({ ...req, sessionsPerWeek: count }).map((template) => ({
      template,
      candidates,
    }));
  }

  it("is deterministic", () => {
    const req = request();
    const a = buildRuleBasedPlan(req, days(3, req));
    const b = buildRuleBasedPlan(req, days(3, req));
    expect(a).toEqual(b);
  });

  it("produces one day per session and never repeats an exercise within a day", () => {
    const req = request({ sessionsPerWeek: 3 });
    const plan = buildRuleBasedPlan(req, days(3, req));

    expect(plan.days).toHaveLength(3);
    for (const day of plan.days) {
      const ids = day.exercises.map((exercise) => exercise.exerciseTemplateId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThan(0);
    }
  });

  it("leads with compounds", () => {
    const req = request({ sessionsPerWeek: 2 });
    const plan = buildRuleBasedPlan(req, days(2, req));
    // Barbell work ranks above dumbbell work, so the first pick is a barbell lift.
    const first = plan.days[0]!.exercises[0]!;
    expect(["Bench Press", "Row", "Squat"]).toContain(first.name);
  });

  it("leaves starting weights unset", () => {
    const plan = buildRuleBasedPlan(request(), days(3));
    const weights = plan.days.flatMap((day) =>
      day.exercises.flatMap((exercise) => exercise.sets.map((set) => set.weightKg)),
    );
    expect(weights.every((weight) => weight === null)).toBe(true);
  });

  it("terminates on a catalog too thin to fill the session", () => {
    const req = request({ sessionsPerWeek: 1, split: "full_body" });
    const thin = buildTrainingDays(req).map((template) => ({
      template,
      candidates: [candidates[0]!],
    }));
    const plan = buildRuleBasedPlan(req, thin);
    expect(plan.days[0]!.exercises).toHaveLength(1);
  });

  it("produces a plan its own validator accepts, given enough exercises", () => {
    // A catalog rich enough to fill every slot: 12 exercises per muscle group.
    const rich = [
      "chest",
      "lats",
      "upper_back",
      "shoulders",
      "biceps",
      "triceps",
      "quadriceps",
      "hamstrings",
      "glutes",
      "calves",
      "abdominals",
    ].flatMap((group) =>
      Array.from({ length: 12 }, () => row({ primaryMuscleGroup: group, equipmentCategory: "barbell" })),
    );
    const req = request({ sessionMinutes: 60, sessionsPerWeek: 3 });
    const plan = buildRuleBasedPlan(
      req,
      buildTrainingDays(req).map((template) => ({ template, candidates: rich })),
    );
    const catalog = new Map(rich.map((candidate) => [candidate.id, candidate]));

    expect(validatePlan(plan, req, catalog)).toEqual([]);
    for (const day of plan.days) {
      expect(sessionSeconds(day.exercises)).toBeLessThanOrEqual(60 * 60 * 1.2);
    }
  });

  it("reports a too-thin catalog through validation rather than silently shipping a short day", () => {
    const req = request({ sessionMinutes: 60, sessionsPerWeek: 3 });
    const plan = buildRuleBasedPlan(req, days(3, req));
    const catalog = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    // Only six exercises exist, so the sessions come up short — and say so.
    expect(validatePlan(plan, req, catalog).join(" ")).toMatch(/minutes were requested/);
  });
});

describe("validatePlan", () => {
  const req = request({ sessionsPerWeek: 1, sessionMinutes: 45 });
  const known = row({ id: "known" });
  const catalog = new Map([[known.id, known]]);

  function plan(overrides: Partial<Plan> = {}): Plan {
    return {
      title: "Test",
      progression: "Add weight.",
      days: [
        {
          title: "Day",
          exercises: [
            {
              exerciseTemplateId: "known",
              name: "Known",
              restSeconds: 90,
              notes: null,
              // 20 sets x (45s + 90s) = 45 minutes exactly.
              sets: Array.from({ length: 20 }, () => ({
                type: "normal" as const,
                repRange: { start: 8, end: 12 },
                weightKg: null,
              })),
            },
          ],
        },
      ],
      ...overrides,
    };
  }

  it("accepts a plan that matches the request", () => {
    expect(validatePlan(plan(), req, catalog)).toEqual([]);
  });

  it("rejects exercise ids that are not in the catalog", () => {
    const bad = plan();
    bad.days[0]!.exercises[0]!.exerciseTemplateId = "hallucinated";
    expect(validatePlan(bad, req, catalog).join(" ")).toMatch(/hallucinated/);
  });

  it("rejects the wrong number of training days", () => {
    const bad = plan();
    bad.days = [bad.days[0]!, { ...bad.days[0]! }];
    expect(validatePlan(bad, req, catalog).join(" ")).toMatch(/2 training days but 1/);
  });

  it("rejects sessions that miss the requested length", () => {
    const bad = plan();
    bad.days[0]!.exercises[0]!.sets = bad.days[0]!.exercises[0]!.sets.slice(0, 2);
    expect(validatePlan(bad, req, catalog).join(" ")).toMatch(/minutes were requested/);
  });

  it("rejects a reversed rep range", () => {
    const bad = plan();
    bad.days[0]!.exercises[0]!.sets[0]!.repRange = { start: 12, end: 8 };
    expect(validatePlan(bad, req, catalog).join(" ")).toMatch(/reversed rep range/);
  });
});
