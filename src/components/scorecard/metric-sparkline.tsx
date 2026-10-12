import type { MetricDirection, MetricTrendPoint } from "@/lib/types";
import { cn, formatMetricValue } from "@/lib/utils";

export interface MetricSparklineProps {
  points: MetricTrendPoint[];
  target: number;
  direction: MetricDirection;
  unit: string;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Hand-rolled SVG sparkline of a metric's eval-run values (oldest first) with
 * a dashed target line; the champion run is a filled dot, the latest a ring.
 * Its text alternative names the first and latest values and the run count.
 * Server-safe (no hooks).
 */
export function MetricSparkline({
  points,
  target,
  direction,
  unit,
  width = 88,
  height = 28,
  className,
}: MetricSparklineProps) {
  if (points.length === 0) return null;
  const pad = 3;
  const values = [...points.map((point) => point.value), target];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const x = (index: number) =>
    points.length === 1 ? width / 2 : pad + (index * (width - pad * 2)) / (points.length - 1);
  const y = (value: number) => pad + (1 - (value - min) / span) * (height - pad * 2);

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const lastMet = direction === "higher" ? last.value >= target : last.value <= target;
  const champion = points.findIndex((point) => point.is_champion);
  const summary =
    points.length === 1
      ? `Eval trend: one run, ${formatMetricValue(last.value, unit)}`
      : `Eval trend over ${points.length} runs: ${formatMetricValue(first.value, unit)} to ${formatMetricValue(last.value, unit)}`;

  return (
    <svg
      role="img"
      aria-label={summary}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <title>{summary}</title>
      <line
        x1={0}
        x2={width}
        y1={y(target)}
        y2={y(target)}
        className="stroke-fg-subtle"
        strokeWidth={1}
        strokeDasharray="2 3"
      />
      {points.length > 1 ? (
        <path
          d={path}
          fill="none"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-accent"
        />
      ) : null}
      {champion >= 0 ? (
        <circle cx={x(champion)} cy={y(points[champion].value)} r={2.5} className="fill-accent-2" />
      ) : null}
      <circle
        cx={x(points.length - 1)}
        cy={y(last.value)}
        r={3}
        strokeWidth={1.75}
        className={cn("fill-surface", lastMet ? "stroke-success" : "stroke-accent")}
      />
    </svg>
  );
}
