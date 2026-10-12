import { CalendarClock } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { ProjectStatus } from "@/lib/types";
import { cn, daysUntil, formatDate, isOverdue, pluralize } from "@/lib/utils";
import { daysUntilOn, isOverdueOn } from "@/lib/workspace-time";

/** Open projects due within this many days are highlighted as "due soon". */
const SOON_THRESHOLD_DAYS = 3;

export interface DueDateProps {
  date: string | null;
  status: ProjectStatus;
  className?: string;
  withIcon?: boolean;
  /**
   * Workspace today ("YYYY-MM-DD", from getWorkspaceToday on the server).
   * With it, overdue and "due soon" use workspace time (isOverdueOn /
   * daysUntilOn); without it the v1 local-clock behaviour stays.
   */
  today?: string;
  /** Overrides "closed" (no overdue state); defaults to completed/cancelled status. */
  closed?: boolean;
}

export function DueDate({ date, status, className, withIcon = false, today, closed }: DueDateProps) {
  if (!date) {
    return (
      <span className={cn("text-xs text-fg-subtle", className)} aria-label="No due date">
        &mdash;
      </span>
    );
  }

  const isClosed = closed ?? (status === "completed" || status === "cancelled");
  const overdue = today ? isOverdueOn(date, today, isClosed) : !isClosed && isOverdue(date, status);
  const days = today ? daysUntilOn(date, today) : daysUntil(date);
  const soon = !isClosed && !overdue && days !== null && days <= SOON_THRESHOLD_DAYS;

  let tooltip: string | null = null;
  if (overdue && days !== null) {
    tooltip = `Overdue by ${pluralize(Math.abs(days), "day")}`;
  } else if (soon && days !== null) {
    tooltip = days === 0 ? "Due today" : `Due in ${pluralize(days, "day")}`;
  }

  const label = (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums",
        overdue ? "font-medium text-danger" : soon ? "font-medium text-warning" : "text-fg-muted",
        className,
      )}
    >
      {withIcon ? <CalendarClock className="size-3.5 shrink-0" aria-hidden /> : null}
      <time dateTime={date}>{formatDate(date)}</time>
      {overdue ? <span className="sr-only">(overdue)</span> : null}
    </span>
  );

  return tooltip ? <Tooltip content={tooltip}>{label}</Tooltip> : label;
}
