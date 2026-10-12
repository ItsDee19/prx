import type { CSSProperties } from "react";
import { cn, formatDate } from "@/lib/utils";
import { fillWeeks, formatUnits, weekEnd } from "./batch-utils";

export interface AcceptedPerWeekChartProps {
  /** From getBatchSummary: Monday of each workspace-timezone week with accepted units. */
  points: readonly { week_start: string; units: number }[];
  /** Plural unit label for the caption, e.g. "audio hours" (mixed unit types: "units"). */
  unitLabel: string;
  className?: string;
}

const CHART_HEIGHT = 140;

/**
 * Mini bar chart of units accepted per week (weeks start on Monday in the
 * workspace timezone). Plain HTML bars that rise in once; wide histories
 * scroll inside their own container. Server-safe; the same numbers are in a
 * table below for screen readers and keyboard users.
 */
export function AcceptedPerWeekChart({ points, unitLabel, className }: AcceptedPerWeekChartProps) {
  const weeks = fillWeeks(points);
  if (weeks.length === 0) {
    return (
      <p className={cn("rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted", className)}>
        Accepted batches appear here by the week they were accepted.
      </p>
    );
  }
  const max = Math.max(...weeks.map((week) => week.units), 1);
  const total = weeks.reduce((sum, week) => sum + week.units, 0);

  return (
    <figure className={cn("min-w-0", className)}>
      <div className="overflow-x-auto pb-1" aria-hidden>
        <div className="flex min-w-full items-end gap-1.5" style={{ height: CHART_HEIGHT + 34 }}>
          {weeks.map((week, index) => {
            const height = week.units > 0 ? Math.max(4, Math.round((week.units / max) * CHART_HEIGHT)) : 2;
            const style = {
              height,
              "--reveal-delay": `${Math.min(index, 7) * 35}ms`,
              "--reveal-y": "6px",
            } as CSSProperties;
            return (
              <div
                key={week.week_start}
                className="flex min-w-7 flex-1 flex-col items-center justify-end gap-1"
                title={`Week of ${formatDate(week.week_start)}: ${formatUnits(week.units)} ${unitLabel}`}
              >
                {week.units > 0 ? (
                  <span className="text-[10px] font-medium tabular-nums text-fg-muted">{formatUnits(week.units)}</span>
                ) : null}
                <span
                  className={cn(
                    "reveal w-full max-w-10 rounded-t-md",
                    week.units > 0 ? "bg-grad-progress" : "bg-border",
                  )}
                  style={style}
                />
                <span className="whitespace-nowrap text-[10px] tabular-nums text-fg-subtle">
                  {formatDate(week.week_start, { month: "short", day: "numeric" })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <figcaption className="mt-2 text-xs text-fg-muted">
        {formatUnits(total)} {unitLabel} accepted over {weeks.length} {weeks.length === 1 ? "week" : "weeks"}. Weeks start on
        Monday.
      </figcaption>
      <table className="sr-only">
        <caption>Units accepted per week</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Accepted {unitLabel}</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.week_start}>
              <td>
                {formatDate(week.week_start)} to {formatDate(weekEnd(week.week_start))}
              </td>
              <td>{formatUnits(week.units)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
