import { CalendarClock } from "lucide-react";
import type { TaskStatus } from "@/lib/types";
import { cn, formatDate, pluralize } from "@/lib/utils";
import { daysUntilOn, isOverdueOn } from "@/lib/workspace-time";
import { isClosedTaskStatus } from "./task-helpers";

/** Open tasks due within this many days are highlighted as "due soon". */
const SOON_DAYS = 2;

export interface TaskDueChipProps {
  date: string | null;
  status: TaskStatus;
  /** Workspace today ("YYYY-MM-DD"). */
  today: string;
  withIcon?: boolean;
  /** Pill look for cards; plain text in tables. */
  variant?: "chip" | "text";
  className?: string;
}

/** "Today", "Tomorrow", "Yesterday", else "Oct 12" (with the year when it differs from today's). */
export function formatTaskDue(date: string, today: string): string {
  const days = daysUntilOn(date, today);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return formatDate(date, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Due date in workspace time: red and labelled "overdue" when past due on an
 * open task, amber within SOON_DAYS, muted otherwise. Never colour alone.
 */
export function TaskDueChip({ date, status, today, withIcon = true, variant = "chip", className }: TaskDueChipProps) {
  if (!date) return null;
  const closed = isClosedTaskStatus(status);
  const overdue = isOverdueOn(date, today, closed);
  const days = daysUntilOn(date, today) ?? 0;
  const soon = !closed && !overdue && days <= SOON_DAYS;
  const description = overdue
    ? `Overdue by ${pluralize(Math.abs(days), "day")}`
    : soon
      ? days === 0
        ? "Due today"
        : `Due in ${pluralize(days, "day")}`
      : `Due ${formatDate(date)}`;

  return (
    <span
      title={description}
      className={cn(
        "inline-flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums",
        variant === "chip" && "h-5 rounded-full px-1.5 ring-1 ring-inset",
        overdue
          ? cn("font-medium text-danger", variant === "chip" && "bg-danger/10 ring-danger/25")
          : soon
            ? cn("font-medium text-warning", variant === "chip" && "bg-warning/10 ring-warning/25")
            : cn("text-fg-muted", variant === "chip" && "ring-border"),
        closed && "text-fg-subtle",
        className,
      )}
    >
      {withIcon ? <CalendarClock aria-hidden className="size-3.5 shrink-0" /> : null}
      <time dateTime={date}>{formatTaskDue(date, today)}</time>
      <span className="sr-only">{overdue ? ` (overdue)` : soon ? ` (due soon)` : ""}</span>
    </span>
  );
}
