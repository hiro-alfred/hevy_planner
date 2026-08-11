import { describe, expect, it } from "vitest";
import type { CatalogRow } from "@/lib/hevy/catalog";
import { buildDayContext, fitAgainstDay, workingSets } from "./muscle-balance";
import type { PlanDay, PlanExercise } from "./schema";

// The day-balance arithmetic behind the swap picker
// (knowledge/decisions/exercise-alternatives.md).
//
// The two properties worth holding down are the two redundant recommendations
// this module exists to stop: an option that takes away work the day was giving
// a muscle, and an option that spends its stimulus on a muscle the day already
// hammers. Everything else here is scaffolding for those.

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

function exercise(templateId: string, sets = 3): PlanExercise {
  return {
    exerciseTemplateId: templateId,
    name: templateId,
    restSeconds: 90,
    notes: null,
    sets: Array.from({ length: sets }, () => ({
      type: "normal" as const,
      repRange: { start: 8, end: 12 },
      weightKg: null,
    })),
  };
}

/** A day built from catalog rows, always swapping the first one. */
function context(rows: CatalogRow[]) {
  const day: PlanDay = { title: "Push", exercises: rows.map((r) => exercise(r.id)) };
  return buildDayContext(day, 0, new Map(rows.map((r) => [r.id, r])));
}

const bench = row({
  id: "bench",
  primaryMuscleGroup: "chest",
  secondaryMuscleGroups: ["triceps", "shoulders"],
});

describe("workingSets", () => {
  it("does not count warm-ups as volume", () => {
    const e = exercise("x", 3);
    e.sets[0]!.type = "warmup";
    expect(workingSets(e)).toBe(2);
  });

  it("falls back to the raw count rather than returning zero", () => {
    // Not something the generator writes, but a hand-edited plan can be
    // anything, and a zero here would flatten every candidate's score alike.
    const e = exercise("x", 2);
    e.sets.forEach((set) => (set.type = "warmup"));
    expect(workingSets(e)).toBe(2);
  });
});

describe("buildDayContext", () => {
  it("splits the day into what stays, what goes, and what the sum was", () => {
    const pushdown = row({ id: "pd", primaryMuscleGroup: "triceps" });
    const { base, gap, before, sets } = context([bench, pushdown]);

    expect(sets).toBe(3);
    // The outgoing bench is excluded from base and is exactly the gap.
    expect(base.get("chest")).toBeUndefined();
    expect(base.get("triceps")).toBe(3);
    expect(gap.get("chest")).toBe(3);
    expect(gap.get("triceps")).toBe(1.5);
    expect(before.get("chest")).toBe(3);
    expect(before.get("triceps")).toBe(4.5);
  });

  it("ignores an exercise the catalog cannot resolve rather than failing", () => {
    const day: PlanDay = { title: "Push", exercises: [exercise("bench"), exercise("ghost")] };
    const { base, gap } = buildDayContext(day, 0, new Map([["bench", bench]]));
    expect(base.size).toBe(0);
    expect(gap.get("chest")).toBe(3);
  });
});

describe("fitAgainstDay — the muscle must not lose its portion", () => {
  const ctx = context([bench, row({ id: "pd", primaryMuscleGroup: "triceps" })]);

  it("scores a like-for-like replacement as full coverage, with no caveat", () => {
    const incline = row({
      primaryMuscleGroup: "chest",
      secondaryMuscleGroups: ["triceps", "shoulders"],
    });
    const fit = fitAgainstDay(incline, ctx);
    expect(fit.coverage).toBe(1);
    expect(fit.deficit).toBe(0);
    expect(fit.caveat).toBeNull();
  });

  it("halves the coverage of an option that only hits the muscle as a secondary", () => {
    const closeGrip = row({
      primaryMuscleGroup: "triceps",
      secondaryMuscleGroups: ["chest", "shoulders"],
    });
    const fit = fitAgainstDay(closeGrip, ctx);
    // It gives the triceps and shoulders back in full but only half the chest —
    // 4.5 of the outgoing bench's 6 weighted sets — and chest was the point.
    expect(fit.coverage).toBeCloseTo(0.75, 5);
    expect(fit.deficit).toBe(1);
    expect(fit.caveat).toBe("Leaves this day short on chest");
  });

  it("reports a muscle emptied outright ahead of one merely thinned", () => {
    // A pure chest movement restores every chest set but takes the day's only
    // shoulder work with it — the bench was carrying that as a secondary. Both
    // shoulders (emptied) and triceps (thinned) qualify; the caveat names the
    // worse one rather than the first one found.
    const fly = row({ primaryMuscleGroup: "chest" });
    const fit = fitAgainstDay(fly, ctx);
    expect(fit.coverage).toBe(0.5);
    expect(fit.deficit).toBe(2);
    expect(fit.caveat).toBe("Leaves shoulders untrained on this day");
  });

  it("says nothing about incidental coverage that was never a real portion", () => {
    // The bench's shoulder share is below a full weighted set here, so losing it
    // is not worth a warning — one set of one secondary is not a day's portion.
    const light = row({
      id: "light",
      primaryMuscleGroup: "chest",
      secondaryMuscleGroups: ["shoulders"],
    });
    const day: PlanDay = { title: "Push", exercises: [exercise("light", 1)] };
    const single = buildDayContext(day, 0, new Map([["light", light]]));

    expect(fitAgainstDay(row({ primaryMuscleGroup: "chest" }), single).caveat).toBeNull();
  });
});

describe("fitAgainstDay — the same muscle must not be worked unnecessarily", () => {
  // A push day already carrying two triceps movements: six weighted triceps sets
  // before the swap even happens.
  const ctx = context([
    row({ id: "bench", primaryMuscleGroup: "chest" }),
    row({ id: "pd", primaryMuscleGroup: "triceps" }),
    row({ id: "sc", primaryMuscleGroup: "triceps" }),
  ]);

  it("charges an option for stimulus spent on a muscle the day already covers", () => {
    const clean = row({ primaryMuscleGroup: "chest" });
    const tricepsHeavy = row({ primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps"] });

    expect(fitAgainstDay(clean, ctx).waste).toBe(0);
    expect(fitAgainstDay(tricepsHeavy, ctx).waste).toBeGreaterThan(0);
    // Both restore the chest work in full; only the score separates them.
    expect(fitAgainstDay(clean, ctx).coverage).toBe(1);
    expect(fitAgainstDay(tricepsHeavy, ctx).coverage).toBe(1);
    expect(fitAgainstDay(clean, ctx).score).toBeGreaterThan(fitAgainstDay(tricepsHeavy, ctx).score);
  });

  it("flags the pile-on, and only when the swap actually adds to it", () => {
    const tricepsHeavy = row({ primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps"] });
    expect(fitAgainstDay(tricepsHeavy, ctx).surplus).toBe(true);
    expect(fitAgainstDay(tricepsHeavy, ctx).caveat).toBe("This day already has plenty of triceps");

    // Same saturated day, but this option adds nothing to the triceps, so the
    // existing six sets are not its problem to answer for.
    expect(fitAgainstDay(row({ primaryMuscleGroup: "chest" }), ctx).surplus).toBe(false);
  });

  it("costs nothing to hit a muscle the rest of the day leaves alone", () => {
    const withFreshMuscle = row({
      primaryMuscleGroup: "chest",
      secondaryMuscleGroups: ["shoulders"],
    });
    // Shoulders are untouched elsewhere on this day, so the extra load is free.
    expect(fitAgainstDay(withFreshMuscle, ctx).waste).toBe(0);
  });
});
