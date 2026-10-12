import type { CSSProperties } from "react";
import { RAG_CONFIG } from "@/lib/constants";
import type { RagHealth } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export interface HealthSparklinePoint {
  health: RagHealth;
  /** Week label source ("YYYY-MM-DD"). */
  week_of: string;
}

export interface HealthSparklineProps {
  /** Oldest first. Only the last `max` points are drawn. */
  points: HealthSparklinePoint[];
  max?: number;
  /** Pixel height of the chart (width follows the number of points). */
  height?: number;
  className?: string;
}

const STEP = 22;
const PAD = 6;

/** On track sits on top, off track at the bottom. */
const LEVEL: Record<RagHealth, number> = { green: 0, amber: 1, red: 2 };

const FILL: Record<RagHealth, string> = {
  green: "fill-success",
  amber: "fill-warning",
  red: "fill-danger",
};

/**
 * Health trend of the latest status updates (server-safe SVG, no chart
 * library). Each point keeps the RagDot shape language (circle / diamond /
 * square) so the trend reads without colour; the accessible name lists every
 * week. The line draws itself once (stroke-dashoffset), static with reduced motion.
 */
export function HealthSparkline({ points, max = 12, height = 36, className }: HealthSparklineProps) {
  const shown = points.slice(-max);
  if (shown.length === 0) return null;
  const width = Math.max(1, shown.length - 1) * STEP + PAD * 2;
  const rowGap = (height - PAD * 2) / 2;
  const coords = shown.map((point, index) => ({
    x: PAD + index * STEP,
    y: PAD + LEVEL[point.health] * rowGap,
    point,
  }));
  const path = coords.map((c, index) => `${index === 0 ? "M" : "L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const label = `Health over the last ${shown.length === 1 ? "update" : `${shown.length} updates`}: ${shown
    .map((point) => `${formatDate(point.week_of, { month: "short", day: "numeric" })} ${RAG_CONFIG[point.health].label}`)
    .join(", ")}.`;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <title>{label}</title>
      {[0, 1, 2].map((level) => (
        <line
          key={level}
          x1={0}
          x2={width}
          y1={PAD + level * rowGap}
          y2={PAD + level * rowGap}
          className="stroke-grid-line"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      ))}
      {coords.length > 1 ? (
        <path
          d={path}
          pathLength={1}
          strokeDasharray={1}
          // progress-ring-arc draws from --ring-circumference to 0 once (static with reduced motion).
          style={{ "--ring-circumference": 1 } as CSSProperties}
          className="progress-ring-arc fill-none stroke-fg-subtle"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {coords.map(({ x, y, point }, index) => {
        const fill = FILL[point.health];
        const last = index === coords.length - 1;
        const r = last ? 4 : 3;
        if (point.health === "green") {
          return <circle key={index} cx={x} cy={y} r={r} className={cn(fill, "stroke-surface")} strokeWidth={1.5} />;
        }
        if (point.health === "amber") {
          return (
            <rect
              key={index}
              x={x - r}
              y={y - r}
              width={r * 2}
              height={r * 2}
              rx={0.5}
              transform={`rotate(45 ${x} ${y})`}
              className={cn(fill, "stroke-surface")}
              strokeWidth={1.5}
            />
          );
        }
        return (
          <rect
            key={index}
            x={x - r}
            y={y - r}
            width={r * 2}
            height={r * 2}
            rx={1}
            className={cn(fill, "stroke-surface")}
            strokeWidth={1.5}
          />
        );
      })}
    </svg>
  );
}
