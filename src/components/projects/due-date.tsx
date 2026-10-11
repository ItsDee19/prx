import { CalendarClock } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { ProjectStatus } from "@/lib/types";
import { cn, daysUntil, formatDate, isOverdue, pluralize } from "@/lib/utils";

/** Open projects due within this many days are highlighted as "due soon". */
const SOON_THRESHOLD_DAYS = 3;

export interface DueDateProps {
  date: string | null;
  status: ProjectStatus;
  className?: string;
  withIcon?: boolean;
}

export function DueDate({ date, status, className, withIcon = false }: DueDateProps) {
  if (!date) {
    return (
      <span className={cn("text-xs text-fg-subtle", className)} aria-label="No due date">
        &mdash;
      </span>
    );
  }

  const open = status !== "completed" && status !== "cancelled";
  const overdue = isOverdue(date, status);
  const days = daysUntil(date);
  const soon = open && !overdue && days !== null && days <= SOON_THRESHOLD_DAYS;

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
