import { describe, expect, it } from "vitest";
import {
  describeRest,
  describeSet,
  estimateMinutes,
  summariseSets,
  unwrapRoutine,
  type RoutineSet,
} from "./routine-format";
import type { HevyRoutine } from "./types";

const routine = { id: "r1", title: "Push", exercises: [] } as unknown as HevyRoutine;

const set = (over: RoutineSet = {}): RoutineSet => ({ type: "normal", ...over });

describe("unwrapRoutine", () => {
  it("accepts the shape the spec promises", () => {
    expect(unwrapRoutine({ routine })).toBe(routine);
  });

  it("accepts an array wrapper, which is the likeliest drift", () => {
    expect(unwrapRoutine({ routine: [routine] })).toBe(routine);
  });

  it("returns null rather than a half-object when the shape is unrecognisable", () => {
    expect(unwrapRoutine(null)).toBeNull();
    expect(unwrapRoutine({})).toBeNull();
    expect(unwrapRoutine({ routine: [] })).toBeNull();
    expect(unwrapRoutine({ routine: { title: "no id" } as unknown as HevyRoutine })).toBeNull();
  });
});

describe("describeSet", () => {
  it("reads weight then reps", () => {
    expect(describeSet(set({ weight_kg: 100, reps: 8 }))).toBe("100 kg × 8 reps");
  });

  it("drops the trailing zero on a half-kilo plate", () => {
    expect(describeSet(set({ weight_kg: 62.5, reps: 5 }))).toBe("62.5 kg × 5 reps");
    expect(describeSet(set({ weight_kg: 100.0, reps: 5 }))).toBe("100 kg × 5 reps");
  });

  it("shows a rep range when no exact rep count is prescribed", () => {
    expect(describeSet(set({ rep_range: { start: 8, end: 12 } }))).toBe("8–12 reps");
  });

  it("prefers an exact rep count over a range", () => {
    expect(describeSet(set({ reps: 5, rep_range: { start: 8, end: 12 } }))).toBe("5 reps");
  });

  it("describes the metrics a non-weighted exercise actually carries", () => {
    expect(describeSet(set({ duration_seconds: 45 }))).toBe("45s");
    expect(describeSet(set({ distance_meters: 500 }))).toBe("500 m");
  });

  it("returns nothing for a set that prescribes nothing", () => {
    expect(describeSet(set({ weight_kg: 0 }))).toBe("");
  });
});

describe("summariseSets", () => {
  it("collapses identical sets into a count", () => {
    const sets = [set({ rep_range: { start: 8, end: 12 } })].flatMap((one) => [one, one, one]);
    expect(summariseSets(sets)).toEqual({ working: 3, warmups: 0, text: "3 × 8–12 reps" });
  });

  it("keeps a top set separate from its back-offs", () => {
    const summary = summariseSets([
      set({ weight_kg: 100, reps: 5 }),
      set({ weight_kg: 80, reps: 8 }),
      set({ weight_kg: 80, reps: 8 }),
    ]);
    expect(summary.text).toBe("1 × 100 kg × 5 reps · 2 × 80 kg × 8 reps");
    expect(summary.working).toBe(3);
  });

  it("counts warm-ups but never describes them", () => {
    const summary = summariseSets([
      set({ type: "warmup", weight_kg: 40, reps: 10 }),
      set({ weight_kg: 100, reps: 5 }),
    ]);
    expect(summary).toEqual({ working: 1, warmups: 1, text: "1 × 100 kg × 5 reps" });
  });

  it("still says how many sets there are when they prescribe nothing", () => {
    expect(summariseSets([set(), set()]).text).toBe("2 sets");
  });

  it("survives an empty exercise", () => {
    expect(summariseSets([])).toEqual({ working: 0, warmups: 0, text: "" });
  });
});

describe("describeRest", () => {
  it("stays in seconds under two minutes", () => {
    expect(describeRest(90)).toBe("90s rest");
  });

  it("switches to minutes above that", () => {
    expect(describeRest(180)).toBe("3 min rest");
    expect(describeRest(150)).toBe("2.5 min rest");
  });

  it("treats null and zero alike as no rest set", () => {
    expect(describeRest(null)).toBe("");
    expect(describeRest(0)).toBe("");
    expect(describeRest(undefined)).toBe("");
  });
});

describe("estimateMinutes", () => {
  it("counts a minute of work plus the rest that follows each working set", () => {
    // 3 sets x (60s work + 120s rest) = 540s = 9 min.
    expect(
      estimateMinutes([
        { sets: [set(), set(), set()], restSeconds: 120 },
      ]),
    ).toBe(9);
  });

  it("ignores warm-ups and assumes 90s when no rest is set", () => {
    expect(
      estimateMinutes([
        { sets: [set({ type: "warmup" }), set(), set()], restSeconds: null },
      ]),
    ).toBe(5);
  });

  it("is zero for an empty routine", () => {
    expect(estimateMinutes([])).toBe(0);
  });
});
