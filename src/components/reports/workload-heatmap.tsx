import Link from "next/link";
import { OctagonAlert, TriangleAlert } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { formatHours } from "@/lib/duration";
import type { WorkloadCell, WorkloadRow } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { addDaysISO } from "@/lib/workspace-time";

export interface WorkloadHeatmapProps {
  rows: WorkloadRow[];
  className?: string;
}

type Level = "none" | "empty" | "light" | "medium" | "high" | "over" | "overload";

interface LevelConfig {
  label: string;
  className: string;
}

/*
 * One sequential hue (the first series colour) for 0-100%, then the reserved
 * warning / critical steps above capacity, each with an icon and a word, so
 * colour never carries the meaning alone.
 */
const LEVELS: Record<Level, LevelConfig> = {
  none: { label: "No capacity set", className: "bg-surface-2 text-fg-subtle" },
  empty: { label: "Free", className: "bg-surface text-fg-muted" },
  light: { label: "Under 50%", className: "bg-[color-mix(in_oklch,var(--viz-1)_14%,var(--surface))] text-fg" },
  medium: { label: "50 to 79%", className: "bg-[color-mix(in_oklch,var(--viz-1)_30%,var(--surface))] text-fg" },
  high: { label: "80 to 100%", className: "bg-[color-mix(in_oklch,var(--viz-1)_48%,var(--surface))] text-fg" },
  over: { label: "Over capacity (101 to 120%)", className: "bg-[color-mix(in_oklch,var(--viz-warning)_38%,var(--surface))] text-fg" },
  overload: { label: "Overloaded (over 120%)", className: "bg-[color-mix(in_oklch,var(--viz-critical)_32%,var(--surface))] text-fg" },
};

const LEGEND_ORDER: Level[] = ["empty", "light", "medium", "high", "over", "overload"];

function loggedOf(cell: WorkloadCell): number {
  return "logged_minutes" in cell && typeof cell.logged_minutes === "number" ? cell.logged_minutes : 0;
}

function loadPct(cell: WorkloadCell): number {
  if (cell.capacity_minutes <= 0) return 0;
  return Math.round((100 * (cell.minutes + loggedOf(cell))) / cell.capacity_minutes);
}

function levelOf(cell: WorkloadCell): Level {
  if (cell.capacity_minutes <= 0) return "none";
  const value = loadPct(cell);
  if (value <= 0) return "empty";
  if (value < 50) return "light";
  if (value < 80) return "medium";
  if (value <= 100) return "high";
  if (value <= 120) return "over";
  return "overload";
}

function weekLabel(weekStart: string): string {
  return formatDate(weekStart, { month: "short", day: "numeric" });
}

function cellDescription(name: string, cell: WorkloadCell, index: number): string {
  const week = index === 0 ? "this week" : `week of ${weekLabel(cell.week_start)}`;
  if (cell.capacity_minutes <= 0) return `${name}, ${week}: no capacity set. Open their tasks.`;
  const logged = loggedOf(cell);
  const parts = [`${formatHours(cell.minutes)} planned`];
  if (logged > 0) parts.push(`${formatHours(logged)} logged`);
  return `${name}, ${week}: ${parts.join(", ")} of ${formatHours(cell.capacity_minutes)} capacity (${loadPct(cell)}%, ${LEVELS[levelOf(cell)].label}). Open their tasks.`;
}

/**
 * People x weeks heatmap (SPEC.md section 20.2). Each cell = planned task
 * estimates plus hours already logged that week against weekly capacity.
 * An accessible CSS grid (table semantics, labelled cells); every cell links
 * to the person's open tasks (`/tasks?assignee=<id>`). Scrolls inside its own
 * container on narrow screens.
 */
export function WorkloadHeatmap({ rows, className }: WorkloadHeatmapProps) {
  const weeks = rows[0]?.cells.map((cell) => cell.week_start) ?? [];
  const columns = { gridTemplateColumns: `minmax(10rem, 15rem) repeat(${weeks.length}, minmax(4.75rem, 1fr))` };

  return (
    <div className={cn("min-w-0", className)}>
      <div className="overflow-x-auto rounded-xl border border-border">
        <div role="table" aria-label="Workload by person and week" aria-rowcount={rows.length + 1} className="min-w-max">
          <div role="rowgroup">
            <div role="row" className="grid border-b border-border bg-surface-2 text-xs text-fg-muted" style={columns}>
              <span role="columnheader" className="sticky left-0 z-10 bg-surface-2 px-3 py-2 font-medium">
                Person
              </span>
              {weeks.map((week, index) => (
                <span key={week} role="columnheader" className="px-2 py-2 text-center font-medium tabular-nums">
                  <span className="block">{index === 0 ? "This week" : index === 1 ? "Next week" : `In ${index} weeks`}</span>
                  <span className="block text-[11px] font-normal text-fg-subtle">
                    {weekLabel(week)}–{weekLabel(addDaysISO(week, 4))}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div role="rowgroup">
            {rows.map((row) => (
              <div key={row.user.id} role="row" className="grid border-b border-border last:border-b-0" style={columns}>
                <span role="rowheader" className="sticky left-0 z-10 flex min-w-0 items-center gap-2 bg-surface px-3 py-2">
                  <UserAvatar user={row.user} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{row.user.name}</span>
                    <span className="block text-xs text-fg-muted tabular-nums">{row.weekly_capacity_hours}h / week</span>
                  </span>
                </span>
                {row.cells.map((cell, index) => {
                  const level = levelOf(cell);
                  const value = loadPct(cell);
                  return (
                    <span key={cell.week_start} role="cell" className="p-1">
                      <Link
                        href={`/tasks?assignee=${encodeURIComponent(row.user.id)}`}
                        aria-label={cellDescription(row.user.name, cell, index)}
                        title={cellDescription(row.user.name, cell, index)}
                        className={cn(
                          "flex h-12 flex-col items-center justify-center rounded-lg text-xs ring-1 ring-inset ring-border/60",
                          "transition-[box-shadow,transform] duration-(--dur-2) ease-out-quart hover:ring-2 hover:ring-fg-muted/40 motion-safe:active:scale-[0.97]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                          LEVELS[level].className,
                        )}
                      >
                        <span className="flex items-center gap-1 font-semibold tabular-nums">
                          {level === "over" ? <TriangleAlert aria-hidden className="size-3" /> : null}
                          {level === "overload" ? <OctagonAlert aria-hidden className="size-3" /> : null}
                          {level === "none" ? "—" : `${value}%`}
                        </span>
                        {level !== "none" && level !== "empty" ? (
                          <span className="text-[11px] tabular-nums text-fg-muted">
                            {formatHours(cell.minutes + loggedOf(cell))}
                          </span>
                        ) : null}
                      </Link>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <ul aria-label="Heatmap legend" className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-muted">
        {LEGEND_ORDER.map((level) => (
          <li key={level} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3 rounded-[4px] ring-1 ring-inset ring-border/60", LEVELS[level].className)} />
            {LEVELS[level].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
