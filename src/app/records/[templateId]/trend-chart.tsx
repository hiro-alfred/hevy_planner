import { formatDay, formatKg } from "@/lib/records/format";
import { buildTrend, type TrendMetric, type TrendPoint } from "@/lib/records/trend";

// The progress line: one point per session, oldest on the left.
//
// Inline SVG rendered on the server, with no charting library and no client
// JavaScript. The chart has one series, so it needs no legend and no colour
// scheme — the accent draws the line, everything else is the recessive frame,
// and the numbers on the axis are the only labels. Hover text comes from the
// SVG <title> in each point, which browsers show natively.
//
// Time is the x axis in real proportion (see buildTrend), so a layoff looks
// like a layoff.

const WIDTH = 640;
const HEIGHT = 170;
/** Room at the right for the last value's label. */
const PAD = 14;

function label(value: number, metric: TrendMetric): string {
  return metric === "e1rm" ? `${formatKg(value)} kg` : `${Math.round(value)} reps`;
}

export function TrendChart({ points, metric }: { points: TrendPoint[]; metric: TrendMetric }) {
  const trend = buildTrend(points, WIDTH, HEIGHT, PAD);
  if (!trend) return null;

  const last = trend.points[trend.points.length - 1]!;
  const first = trend.points[0]!;
  const peak = trend.points.reduce((best, point) => (point.value > best.value ? point : best), first);
  const change = last.value - first.value;

  return (
    <div className="flex flex-col gap-3">
      <svg
        className="ui-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${metric === "e1rm" ? "Estimated one-rep max" : "Best set reps"} across ${points.length} sessions, from ${label(first.value, metric)} on ${formatDay(first.at)} to ${label(last.value, metric)} on ${formatDay(last.at)}.`}
      >
        {/* Baseline only. A full grid would out-ink a dozen data points. */}
        <line className="ui-chart__grid" x1={0} y1={HEIGHT - 1} x2={WIDTH} y2={HEIGHT - 1} />
        <path className="ui-chart__area" d={trend.area} />
        <path className="ui-chart__line" d={trend.line} />
        {trend.points.map((point, index) => (
          <circle
            key={`${point.at}-${index}`}
            className={`ui-chart__dot${point === last ? " ui-chart__dot--last" : ""}`}
            cx={point.x}
            cy={point.y}
            r={index === trend.points.length - 1 || point === peak ? 5 : 3.5}
          >
            <title>
              {formatDay(point.at)} — {label(point.value, metric)}
            </title>
          </circle>
        ))}
        {/* Two labels, not twelve: where it started and where it is now. */}
        <text className="ui-chart__label" x={0} y={16} textAnchor="start">
          {label(first.value, metric)}
        </text>
        <text
          className="ui-chart__label ui-chart__label--value"
          x={WIDTH}
          y={Math.min(Math.max(last.y - 12, 14), HEIGHT - 6)}
          textAnchor="end"
        >
          {label(last.value, metric)}
        </text>
      </svg>

      <p className="ui-item__meta">
        {formatDay(first.at)} → {formatDay(last.at)} · {points.length} sessions ·{" "}
        {change === 0
          ? "no net change"
          : `${change > 0 ? "+" : "−"}${label(Math.abs(change), metric)} overall`}
        {peak !== last && ` · peak ${label(peak.value, metric)} on ${formatDay(peak.at)}`}
      </p>
    </div>
  );
}
