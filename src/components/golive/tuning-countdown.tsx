import { InViewRing } from "@/components/scorecard/in-view-ring";
import { TUNING_ALERT_DAYS } from "@/lib/constants";
import type { GoLiveSummary } from "@/lib/types";
import { clamp, cn } from "@/lib/utils";

export interface TuningCountdownProps {
  summary: GoLiveSummary;
  size?: number;
  className?: string;
}

/** Day N of the window, clamped to 0..tuning_days (0 on go-live day, so day + days left = window). */
export function tuningDay(summary: GoLiveSummary): number {
  return clamp(summary.days_elapsed ?? 0, 0, summary.tuning_days);
}

/**
 * The tuning countdown ring: the arc fills as the window elapses (drawn on
 * first view), the centre shows the days left. Accent while running, warning
 * within TUNING_ALERT_DAYS, danger once the window has ended without being
 * closed, success once tuning is closed. Server-safe.
 */
export function TuningCountdown({ summary, size = 120, className }: TuningCountdownProps) {
  const total = summary.tuning_days;
  const daysLeft = summary.days_left ?? total;
  const elapsed = summary.days_elapsed ?? 0;
  const closed = summary.tuning_closed_at !== null;
  const notStarted = elapsed < 0;
  const ended = daysLeft < 0;
  const day = tuningDay(summary);
  const pct = closed ? 100 : total > 0 ? Math.round((day / total) * 100) : 100;
  const tone = closed ? "success" : ended ? "danger" : daysLeft <= TUNING_ALERT_DAYS && !notStarted ? "warning" : "accent";

  let big: string;
  let small: string;
  if (closed) {
    big = "Done";
    small = "handed over";
  } else if (notStarted) {
    big = String(-elapsed);
    small = -elapsed === 1 ? "day to go-live" : "days to go-live";
  } else if (ended) {
    big = String(-daysLeft);
    small = -daysLeft === 1 ? "day overdue" : "days overdue";
  } else if (daysLeft === 0) {
    big = "Last";
    small = "day";
  } else {
    big = String(daysLeft);
    small = daysLeft === 1 ? "day left" : "days left";
  }

  const label = closed
    ? "Tuning closed"
    : notStarted
      ? `Go-live in ${-elapsed} days; tuning window of ${total} days`
      : `Tuning window: day ${day} of ${total}, ${Math.max(daysLeft, 0)} days left`;

  return (
    <div className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <InViewRing value={pct} size={size} strokeWidth={Math.max(6, Math.round(size / 14))} tone={tone} label={label} />
      <span aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[1.75rem] font-semibold leading-8 tracking-tight tabular-nums text-fg">{big}</span>
        <span className="max-w-[80%] text-[11px] leading-4 text-fg-muted">{small}</span>
      </span>
    </div>
  );
}
