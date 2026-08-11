import { describe, expect, it } from "vitest";
import type { CatalogRow } from "@/lib/hevy/catalog";
import { applySwap, dayTemplateIds, exerciseAt, rankAlternatives, substitute } from "./alternatives";
import { buildDayContext, type DayContext } from "./muscle-balance";
import { sessionSeconds } from "./prescription";
import type { Plan, PlanDay, PlanExercise, PlanRequest } from "./schema";
import { validatePlan } from "./validate";

// The swap picker's pure half (knowledge/decisions/exercise-alternatives.md).
// The session-length case is the important one: the substitution rule claims a
// swap can NEVER break the ±20% contract, and that is only worth claiming if a
// test holds it down.

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

function exercise(overrides: Partial<PlanExercise> = {}): PlanExercise {
  return {
    exerciseTemplateId: "out",
    name: "Barbell Bench Press",
    restSeconds: 90,
    notes: "Keep the wrists stacked — your left wrist complaint.",
    sets: [
      { type: "normal", repRange: { start: 8, end: 12 }, weightKg: 80 },
      { type: "normal", repRange: { start: 8, end: 12 }, weightKg: 80 },
      { type: "normal", repRange: { start: 6, end: 10 }, weightKg: 85 },
    ],
    ...overrides,
  };
}

function plan(): Plan {
  return {
    title: "Test plan",
    progression: "Add 2.5 kg when you hit the top of the range.",
    days: [
      { title: "Push", exercises: [exercise(), exercise({ exerciseTemplateId: "keep" })] },
      { title: "Pull", exercises: [exercise({ exerciseTemplateId: "other-day" })] },
    ],
  };
}

/** The day context for replacing the sole exercise of a one-exercise day. */
function soloContext(outgoing: CatalogRow): DayContext {
  const day: PlanDay = {
    title: "Push",
    exercises: [exercise({ exerciseTemplateId: outgoing.id })],
  };
  return buildDayContext(day, 0, new Map([[outgoing.id, outgoing]]));
}

/** A day of `rows`, swapping the first one. Every exercise gets three sets. */
function dayContext(rows: CatalogRow[]): DayContext {
  const day: PlanDay = {
    title: "Push",
    exercises: rows.map((r) => exercise({ exerciseTemplateId: r.id })),
  };
  return buildDayContext(day, 0, new Map(rows.map((r) => [r.id, r])));
}

describe("rankAlternatives", () => {
  it("sinks an option that would strip the day of a muscle it was training", () => {
    // The pool matches primary OR secondary, so a triceps movement listing chest
    // as a secondary is a legitimate candidate for a bench press. On a day whose
    // only chest work IS that bench, taking it leaves chest at half — which is
    // the redundant recommendation this ranking exists to prevent.
    const outgoing = row({ primaryMuscleGroup: "chest", equipmentCategory: "barbell" });
    const secondary = row({
      primaryMuscleGroup: "triceps",
      secondaryMuscleGroups: ["chest"],
      equipmentCategory: "barbell",
    });
    const primary = row({ primaryMuscleGroup: "chest", equipmentCategory: "suspension" });

    const ranked = rankAlternatives([secondary, primary], outgoing, soloContext(outgoing));
    expect(ranked.map((r) => r.row.id)).toEqual([primary.id, secondary.id]);
    expect(ranked[0]!.fit.caveat).toBeNull();
    expect(ranked[1]!.fit.caveat).toBe("Leaves this day short on chest");
  });

  it("prefers the option that does not pile onto a muscle the day already hammers", () => {
    // A push day already carrying two triceps movements. Both candidates restore
    // the chest work in full, so the old ranking would have split them on
    // equipment alone and put the barbell press first.
    const outgoing = row({ id: "bench", primaryMuscleGroup: "chest", equipmentCategory: "barbell" });
    const pushdown = row({ id: "pd", primaryMuscleGroup: "triceps", equipmentCategory: "machine" });
    const skullcrusher = row({ id: "sc", primaryMuscleGroup: "triceps", equipmentCategory: "barbell" });
    const context = dayContext([outgoing, pushdown, skullcrusher]);

    const closeGrip = row({
      title: "Close-Grip Bench Press",
      primaryMuscleGroup: "chest",
      secondaryMuscleGroups: ["triceps"],
      equipmentCategory: "barbell",
    });
    // Note the machine fly wins DESPITE the close-grip press matching the
    // outgoing barbell: not piling onto the triceps outranks equipment.
    const fly = row({
      title: "Machine Chest Fly",
      primaryMuscleGroup: "chest",
      equipmentCategory: "machine",
    });

    const ranked = rankAlternatives([closeGrip, fly], outgoing, context);
    expect(ranked.map((r) => r.row.title)).toEqual(["Machine Chest Fly", "Close-Grip Bench Press"]);
    expect(ranked[0]!.fit.caveat).toBeNull();
    expect(ranked[1]!.fit.caveat).toBe("This day already has plenty of triceps");
  });

  it("prefers the outgoing exercise's own equipment before the generator's ranking", () => {
    const outgoing = row({ primaryMuscleGroup: "chest", equipmentCategory: "dumbbell" });
    // Barbell outranks dumbbell in EQUIPMENT_RANK, but "the same thing, just not
    // this one" is what a swap usually means — so same-equipment wins first.
    const barbell = row({ primaryMuscleGroup: "chest", equipmentCategory: "barbell" });
    const dumbbell = row({ primaryMuscleGroup: "chest", equipmentCategory: "dumbbell" });

    const ranked = rankAlternatives([barbell, dumbbell], outgoing, soloContext(outgoing));
    expect(ranked.map((r) => r.row.id)).toEqual([dumbbell.id, barbell.id]);
  });

  it("falls back to EQUIPMENT_RANK, then to title, so the order never reshuffles", () => {
    // Outgoing is bodyweight, so nothing here matches on equipment and the
    // generator's own ranking decides: machine (1) before band (6).
    const outgoing = row({ primaryMuscleGroup: "chest", equipmentCategory: "none" });
    const context = soloContext(outgoing);
    const machine = row({ primaryMuscleGroup: "chest", equipmentCategory: "machine", title: "M" });
    const bandB = row({ primaryMuscleGroup: "chest", equipmentCategory: "resistance_band", title: "B" });
    const bandA = row({ primaryMuscleGroup: "chest", equipmentCategory: "resistance_band", title: "A" });

    expect(rankAlternatives([bandB, machine, bandA], outgoing, context).map((r) => r.row.title)).toEqual([
      "M",
      "A",
      "B",
    ]);
    // Same pool in a different incoming order ranks identically — the picker
    // must not reorder under the cursor between two opens.
    expect(rankAlternatives([bandA, bandB, machine], outgoing, context).map((r) => r.row.title)).toEqual([
      "M",
      "A",
      "B",
    ]);
  });

  it("does not mutate the pool it was given", () => {
    const outgoing = row();
    const pool = [row({ equipmentCategory: "other" }), row({ equipmentCategory: "barbell" })];
    const before = pool.map((r) => r.id);
    rankAlternatives(pool, outgoing, soloContext(outgoing));
    expect(pool.map((r) => r.id)).toEqual(before);
  });
});

describe("substitute", () => {
  it("carries sets and rest over verbatim", () => {
    const outgoing = exercise();
    const replacement = row({ title: "Machine Chest Press", equipmentCategory: "machine" });
    const result = substitute(outgoing, replacement);

    expect(result.exerciseTemplateId).toBe(replacement.id);
    expect(result.name).toBe("Machine Chest Press");
    expect(result.restSeconds).toBe(outgoing.restSeconds);
    expect(result.sets).toHaveLength(outgoing.sets.length);
    expect(result.sets.map((s) => s.repRange)).toEqual(outgoing.sets.map((s) => s.repRange));
    expect(result.sets.map((s) => s.type)).toEqual(outgoing.sets.map((s) => s.type));
  });

  it("drops the load and the notes, which do not transfer between movements", () => {
    const result = substitute(exercise(), row());
    expect(result.sets.every((set) => set.weightKg === null)).toBe(true);
    expect(result.notes).toBeNull();
  });

  it("leaves the outgoing exercise untouched", () => {
    const outgoing = exercise();
    substitute(outgoing, row());
    expect(outgoing.sets[0]!.weightKg).toBe(80);
    expect(outgoing.notes).not.toBeNull();
  });
});

describe("applySwap", () => {
  it("replaces exactly one exercise and moves nothing else", () => {
    const before = plan();
    const after = applySwap(before, 0, 0, row({ id: "in", title: "Machine Chest Press" }));

    expect(after.days).toHaveLength(2);
    expect(after.days.map((d) => d.title)).toEqual(["Push", "Pull"]);
    expect(after.days[0]!.exercises.map((e) => e.exerciseTemplateId)).toEqual(["in", "keep"]);
    expect(after.days[1]!.exercises.map((e) => e.exerciseTemplateId)).toEqual(["other-day"]);
  });

  it("cannot change how long any session takes — the ±20% contract holds by construction", () => {
    const before = plan();
    // A replacement from a different movement class entirely.
    const after = applySwap(before, 0, 0, row({ equipmentCategory: "resistance_band" }));

    before.days.forEach((day, index) => {
      expect(sessionSeconds(after.days[index]!.exercises)).toBe(sessionSeconds(day.exercises));
    });
  });

  it("leaves the original plan object alone", () => {
    const before = plan();
    applySwap(before, 0, 0, row({ id: "in" }));
    expect(before.days[0]!.exercises[0]!.exerciseTemplateId).toBe("out");
  });
});

describe("exerciseAt / dayTemplateIds", () => {
  it("reads a position, and reports null rather than throwing when it is gone", () => {
    const p = plan();
    expect(exerciseAt(p, 0, 1)?.exerciseTemplateId).toBe("keep");
    expect(exerciseAt(p, 9, 0)).toBeNull();
    expect(exerciseAt(p, 0, 9)).toBeNull();
  });

  it("lists a day's template ids so the picker never offers a duplicate", () => {
    expect(dayTemplateIds(plan(), 0)).toEqual(["out", "keep"]);
    expect(dayTemplateIds(plan(), 9)).toEqual([]);
  });
});

describe("validatePlan, rejected exercises", () => {
  function request(excludedExercises?: string[]): PlanRequest {
    return {
      goal: "Build muscle",
      sessionMinutes: 25,
      sessionsPerWeek: 2,
      split: "auto",
      experience: "intermediate",
      equipment: ["barbell"],
      excludedExercises,
    };
  }

  const catalog = new Map<string, CatalogRow>([
    ["out", row({ id: "out", title: "Barbell Bench Press" })],
    ["keep", row({ id: "keep" })],
    ["other-day", row({ id: "other-day" })],
  ]);

  it("flags an exercise the trainee already rejected, by name", () => {
    const violations = validatePlan(plan(), request(["out"]), catalog);
    expect(violations.some((v) => v.includes("rejected") && v.includes("Barbell Bench Press"))).toBe(
      true,
    );
  });

  it("says nothing when the rejected exercise is absent", () => {
    const violations = validatePlan(plan(), request(["not-in-plan"]), catalog);
    expect(violations.some((v) => v.includes("rejected"))).toBe(false);
  });

  it("says nothing when there are no rejections at all", () => {
    const violations = validatePlan(plan(), request(), catalog);
    expect(violations.some((v) => v.includes("rejected"))).toBe(false);
  });
});
