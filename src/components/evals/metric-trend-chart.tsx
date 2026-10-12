import type { CSSProperties } from "react";
import { Star } from "lucide-react";
import { METRIC_DIRECTION_CONFIG } from "@/lib/constants";
import type { MetricDirection } from "@/lib/types";
import { cn, formatDate, formatMetricValue } from "@/lib/utils";

export interface MetricTrendChartPoint {
  id?: string;
  /** Eval run label. */
  label: string;
  value: number;
  /** Workspace date "YYYY-MM-DD". */
  date: string;
  isChampion: boolean;
}

export interface MetricTrendChartProps {
  /** Oldest first. */
  points: readonly MetricTrendChartPoint[];
  metricName: string;
  unit: string;
  direction: MetricDirection;
  target?: number | null;
  baseline?: number | null;
  /** Plot height in px (default 220). */
  height?: number;
  className?: string;
}

const PLOT = { top: 14, right: 14, bottom: 30, left: 56 } as const;
const MAX_X_LABELS = 6;

function niceDomain(values: number[]): [number, number] {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const pad = Math.abs(min) > 1 ? Math.abs(min) * 0.1 : 0.05;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.12;
  min -= pad;
  max += pad;
  // Rates (all values inside 0-1) stay inside 0-1.
  if (values.every((value) => value >= 0 && value <= 1)) {
    min = Math.max(0, min);
    max = Math.min(1, max);
  } else if (values.every((value) => value >= 0)) {
    min = Math.max(0, min);
  }
  return [min, max];
}

function xLabelIndexes(count: number): Set<number> {
  if (count <= MAX_X_LABELS) return new Set(Array.from({ length: count }, (_, i) => i));
  const indexes = new Set<number>([0, count - 1]);
  const step = (count - 1) / (MAX_X_LABELS - 1);
  for (let i = 1; i < MAX_X_LABELS - 1; i += 1) indexes.add(Math.round(i * step));
  return indexes;
}

/**
 * Hand-rolled SVG line chart of one metric across eval runs (oldest first),
 * with a dashed target line, a dotted baseline and a star on the champion.
 * Lines are drawn in a stretched 0-100 SVG (non-scaling strokes) and labels
 * and points are HTML, so text stays crisp at every width from 320px up.
 * Server-safe (no hooks). The same data is available as a table in a
 * disclosure underneath (and to screen readers).
 */
export function MetricTrendChart({
  points,
  metricName,
  unit,
  direction,
  target = null,
  baseline = null,
  height = 220,
  className,
}: MetricTrendChartProps) {
  if (points.length === 0) {
    return (
      <p className={cn("rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted", className)}>
        No runs have logged {metricName} yet.
      </p>
    );
  }

  const domainValues = [...points.map((point) => point.value)];
  if (target !== null) domainValues.push(target);
  if (baseline !== null) domainValues.push(baseline);
  const [min, max] = niceDomain(domainValues);
  const y = (value: number) => 100 - ((value - min) / (max - min)) * 100;
  const x = (index: number) => (points.length === 1 ? 50 : (index / (points.length - 1)) * 100);
  const ticks = [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);
  const labelIndexes = xLabelIndexes(points.length);
  const polyline = points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const directionLabel = METRIC_DIRECTION_CONFIG[direction].label;
  const plotStyle: CSSProperties = {
    top: PLOT.top,
    right: PLOT.right,
    bottom: PLOT.bottom,
    left: PLOT.left,
  };

  return (
    <figure className={cn("min-w-0", className)}>
      <div className="relative w-full select-none" style={{ height }} aria-hidden>
        {/* Y axis labels */}
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute right-[calc(100%-52px)] -translate-y-1/2 whitespace-nowrap text-[11px] tabular-nums text-fg-subtle"
            style={{ top: `calc(${PLOT.top}px + (100% - ${PLOT.top + PLOT.bottom}px) * ${y(tick) / 100})` }}
          >
            {formatMetricValue(tick, unit)}
          </span>
        ))}

        <div className="absolute" style={plotStyle}>
          <svg
            className="absolute inset-0 size-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            focusable="false"
          >
            {ticks.map((tick) => (
              <line
                key={tick}
                x1={0}
                x2={100}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--grid-line)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {baseline !== null ? (
              <line
                x1={0}
                x2={100}
                y1={y(baseline)}
                y2={y(baseline)}
                stroke="var(--fg-subtle)"
                strokeWidth={1.25}
                strokeDasharray="2 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {target !== null ? (
              <line
                x1={0}
                x2={100}
                y1={y(target)}
                y2={y(target)}
                stroke="var(--success)"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {points.length > 1 ? (
              <polyline
                points={polyline}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="reveal-fade"
              />
            ) : null}
          </svg>

          {target !== null ? (
            <span
              className="absolute right-0 -translate-y-full pb-0.5 text-[11px] font-medium text-success"
              style={{ top: `${y(target)}%` }}
            >
              Target {formatMetricValue(target, unit)}
            </span>
          ) : null}

          {points.map((point, index) => {
            const style: CSSProperties = {
              left: `${x(index)}%`,
              top: `${y(point.value)}%`,
              "--reveal-delay": `${Math.min(index, 7) * 35}ms`,
            } as CSSProperties;
            return point.isChampion ? (
              <span
                key={point.id ?? `${point.label}-${index}`}
                className="reveal absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-success text-surface shadow-card ring-2 ring-surface"
                style={style}
                title={`${point.label}: ${formatMetricValue(point.value, unit)} (champion)`}
              >
                <Star className="size-3 fill-current" />
              </span>
            ) : (
              <span
                key={point.id ?? `${point.label}-${index}`}
                className="reveal absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
                style={style}
                title={`${point.label}: ${formatMetricValue(point.value, unit)}`}
              />
            );
          })}

          {/* X axis labels */}
          {points.map((point, index) =>
            labelIndexes.has(index) ? (
              <span
                key={`x-${point.id ?? index}`}
                className={cn(
                  "absolute top-full mt-2 whitespace-nowrap text-[11px] tabular-nums text-fg-subtle",
                  points.length === 1
                    ? "-translate-x-1/2"
                    : index === 0
                      ? ""
                      : index === points.length - 1
                        ? "-translate-x-full"
                        : "-translate-x-1/2",
                )}
                style={{ left: `${x(index)}%` }}
              >
                {formatDate(point.date, { month: "short", day: "numeric" })}
              </span>
            ) : null,
          )}
        </div>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-accent" />
          {metricName}
        </span>
        {target !== null ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-success" />
            Target {formatMetricValue(target, unit)}
          </span>
        ) : null}
        {baseline !== null ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0 w-4 border-t-2 border-dotted border-fg-subtle" />
            Baseline {formatMetricValue(baseline, unit)}
          </span>
        ) : null}
        {points.some((point) => point.isChampion) ? (
          <span className="inline-flex items-center gap-1.5">
            <Star aria-hidden className="size-3 fill-success text-success" />
            Champion
          </span>
        ) : null}
        <span>{directionLabel}.</span>
      </figcaption>

      <details className="group mt-2 text-sm">
        <summary className="inline-flex cursor-pointer items-center rounded-md text-xs font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2">
          <span className="group-open:hidden">Show the data as a table</span>
          <span className="hidden group-open:inline">Hide the table</span>
        </summary>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[20rem] text-left text-sm">
            <caption className="sr-only">
              {metricName} by eval run, oldest first. {directionLabel}.
              {target !== null ? ` Target ${formatMetricValue(target, unit)}.` : ""}
            </caption>
            <thead className="bg-surface-2/60 text-xs text-fg-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Date</th>
                <th scope="col" className="px-3 py-2 font-medium">Run</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{metricName}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={point.id ?? `${point.label}-${index}`} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-fg-muted">{formatDate(point.date)}</td>
                  <td className="px-3 py-2 text-fg [overflow-wrap:anywhere]">
                    {point.label}
                    {point.isChampion ? <span className="ml-1.5 text-xs font-medium text-success">Champion</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg">{formatMetricValue(point.value, unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
