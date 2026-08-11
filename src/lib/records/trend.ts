import { E1RM_MAX_REPS, epley } from "./e1rm";
import type { ExerciseSession } from "./metrics";

// The shape of the progress line: one point per session, laid out for an SVG.
//
// Pure geometry and arithmetic, no React and no database, so the whole chart is
// testable as numbers. The component that consumes this only maps the points to
// elements.

export type TrendMetric = "e1rm" | "reps";

export interface TrendPoint {
  /** ISO timestamp of the session. */
  at: string;
  value: number;
}

/**
 * One value per session: the best estimated 1RM of that day, oldest first.
 *
 * Best-of-session rather than every set, because a chart of every set is a
 * cloud of back-off work with the actual progression buried in it. The same
 * 12-rep cap as the records themselves applies — a 20-rep set estimates a 1RM
 * the lifter has never touched, and one of those spikes ruins the scale for
 * every honest point beside it.
 *
 * Bodyweight exercises have no weight to estimate from, so they fall back to
 * the best rep count. The caller is told which metric it got, because the two
 * are labelled differently and must never be silently mixed on one axis.
 */
export function trendSeries(sessions: ExerciseSession[]): {
  metric: TrendMetric;
  points: TrendPoint[];
} {
  const loaded: TrendPoint[] = [];
  const repped: TrendPoint[] = [];

  for (const session of sessions) {
    let bestE1rm = 0;
    let bestReps = 0;
    for (const set of session.sets) {
      const reps = set.reps ?? 0;
      if (reps < 1) continue;
      if (reps > bestReps) bestReps = reps;
      if (set.weightKg !== null && set.weightKg > 0 && reps <= E1RM_MAX_REPS) {
        bestE1rm = Math.max(bestE1rm, epley(set.weightKg, reps));
      }
    }
    if (bestE1rm > 0) loaded.push({ at: session.startTime, value: bestE1rm });
    if (bestReps > 0) repped.push({ at: session.startTime, value: bestReps });
  }

  const chosen = loaded.length > 0 ? loaded : repped;
  return {
    metric: loaded.length > 0 ? "e1rm" : "reps",
    // Sessions arrive newest-first everywhere else in this module; a time axis
    // has to run the other way.
    points: chosen.slice().reverse(),
  };
}

export interface PlottedPoint extends TrendPoint {
  x: number;
  y: number;
}

export interface TrendGeometry {
  points: PlottedPoint[];
  /** SVG path for the line, and the same line closed to the baseline. */
  line: string;
  area: string;
  min: number;
  max: number;
  width: number;
  height: number;
}

/** Rounds to a tenth so the emitted path stays short and readable. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Lays the series out in an SVG viewbox.
 *
 * The x axis is REAL TIME, not the session index. Training is irregular — a
 * deload week, an injury, a holiday — and spacing sessions evenly would draw a
 * three-month layoff as one tidy step, which is precisely the thing a lifter
 * looking at a progress line needs to see.
 *
 * The y axis is padded by a tenth of the range so the best and worst points do
 * not sit exactly on the frame, and a flat series (every session identical)
 * centres instead of dividing by zero.
 *
 * Fewer than two points has no line to draw and returns null; one session is a
 * dot, not a trend, and the page says so instead.
 */
export function buildTrend(
  points: TrendPoint[],
  width = 640,
  height = 160,
  pad = 10,
): TrendGeometry | null {
  if (points.length < 2) return null;

  const times = points.map((point) => new Date(point.at).getTime());
  const firstTime = times[0]!;
  const lastTime = times[times.length - 1]!;
  const span = lastTime - firstTime;

  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const margin = (high - low) * 0.1 || Math.max(high * 0.05, 1);
  const min = low - margin;
  const max = high + margin;

  const plotted: PlottedPoint[] = points.map((point, index) => {
    // Sessions logged on the same instant would otherwise stack on one x; the
    // index fallback spaces them evenly, which is the only sane thing left.
    const ratio = span > 0 ? (times[index]! - firstTime) / span : index / (points.length - 1);
    return {
      ...point,
      x: round(pad + ratio * (width - pad * 2)),
      y: round(height - pad - ((point.value - min) / (max - min)) * (height - pad * 2)),
    };
  });

  const line = plotted
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
  const first = plotted[0]!;
  const last = plotted[plotted.length - 1]!;

  return {
    points: plotted,
    line,
    area: `${line} L${last.x} ${height} L${first.x} ${height} Z`,
    min,
    max,
    width,
    height,
  };
}
