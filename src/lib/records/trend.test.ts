import { describe, expect, it } from "vitest";
import type { ExerciseSession } from "./metrics";
import { buildTrend, trendSeries, type TrendPoint } from "./trend";

/** Sessions arrive newest-first everywhere in the records code. */
function session(startTime: string, sets: Array<[number | null, number | null]>): ExerciseSession {
  return {
    workoutId: startTime,
    workoutTitle: "Session",
    startTime,
    sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, rpe: null })),
  };
}

describe("trendSeries", () => {
  it("takes the best estimated 1RM of each session, oldest first", () => {
    const series = trendSeries([
      session("2026-08-10T09:00:00Z", [[100, 5], [90, 8]]),
      session("2026-08-03T09:00:00Z", [[95, 5]]),
    ]);

    expect(series.metric).toBe("e1rm");
    expect(series.points.map((point) => point.at)).toEqual([
      "2026-08-03T09:00:00Z",
      "2026-08-10T09:00:00Z",
    ]);
    // 90 x 8 estimates 114, above 100 x 5's 116.67? No: 116.67 wins.
    expect(series.points[1]!.value).toBeCloseTo(100 * (1 + 5 / 30), 5);
  });

  it("ignores high-rep sets, which estimate a 1RM nobody has lifted", () => {
    const series = trendSeries([
      session("2026-08-10T09:00:00Z", [[60, 30], [100, 3]]),
      session("2026-08-03T09:00:00Z", [[100, 3]]),
    ]);
    expect(series.points[1]!.value).toBeCloseTo(100 * (1 + 3 / 30), 5);
  });

  it("falls back to reps when the exercise carries no weight", () => {
    const series = trendSeries([
      session("2026-08-10T09:00:00Z", [[null, 12], [null, 10]]),
      session("2026-08-03T09:00:00Z", [[null, 8]]),
    ]);
    expect(series.metric).toBe("reps");
    expect(series.points.map((point) => point.value)).toEqual([8, 12]);
  });

  it("has no points when nothing was completed", () => {
    expect(trendSeries([session("2026-08-10T09:00:00Z", [[100, null]])]).points).toEqual([]);
  });
});

describe("buildTrend", () => {
  const points: TrendPoint[] = [
    { at: "2026-01-01T00:00:00Z", value: 100 },
    { at: "2026-01-02T00:00:00Z", value: 110 },
    { at: "2026-01-11T00:00:00Z", value: 120 },
  ];

  it("refuses to draw a line through fewer than two points", () => {
    expect(buildTrend([])).toBeNull();
    expect(buildTrend([points[0]!])).toBeNull();
  });

  it("spaces the x axis by real time, not by session number", () => {
    const trend = buildTrend(points, 100, 100, 0)!;
    // Ten days total; the second session is one day in, so it sits at 10%.
    expect(trend.points.map((point) => point.x)).toEqual([0, 10, 100]);
  });

  it("puts the highest value at the top and pads the range", () => {
    const trend = buildTrend(points, 100, 100, 0)!;
    expect(trend.points[0]!.y).toBeGreaterThan(trend.points[2]!.y);
    expect(trend.min).toBeLessThan(100);
    expect(trend.max).toBeGreaterThan(120);
  });

  it("centres a flat series instead of dividing by zero", () => {
    const flat = buildTrend(
      [
        { at: "2026-01-01T00:00:00Z", value: 80 },
        { at: "2026-01-08T00:00:00Z", value: 80 },
      ],
      100,
      100,
      0,
    )!;
    expect(flat.points.every((point) => Number.isFinite(point.y))).toBe(true);
    expect(flat.points[0]!.y).toBeCloseTo(50, 5);
  });

  it("spaces same-instant sessions evenly rather than stacking them", () => {
    const same = buildTrend(
      [
        { at: "2026-01-01T00:00:00Z", value: 80 },
        { at: "2026-01-01T00:00:00Z", value: 90 },
      ],
      100,
      100,
      0,
    )!;
    expect(same.points.map((point) => point.x)).toEqual([0, 100]);
  });

  it("closes the area path back to the baseline", () => {
    const trend = buildTrend(points, 100, 100, 0)!;
    expect(trend.line.startsWith("M0")).toBe(true);
    expect(trend.area.endsWith("Z")).toBe(true);
  });
});
