import { CalendarClock } from "lucide-react";
import type { ProjectSummary } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";

/** "HOSP · Claims copilot" in small muted text: the client code (mono) then the project name. */
export function ProjectRef({ project, className }: { project: ProjectSummary; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-xs text-fg-muted", className)}>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full bg-fg-subtle/50"
        style={project.color ? { backgroundColor: project.color } : undefined}
      />
      {project.client_code ? (
        <span className="shrink-0 font-mono text-[11px] font-semibold text-fg">{project.client_code}</span>
      ) : null}
      <span className="min-w-0 truncate">{project.name}</span>
    </span>
  );
}

/** Label for a whole-day distance from workspace today ("Today", "In 3 days", "2 days overdue"). */
export function daysLabel(daysLeft: number, overdueWord = "overdue"): string {
  if (daysLeft === 0) return "Today";
  if (daysLeft === 1) return "Tomorrow";
  if (daysLeft > 1) return `In ${pluralize(daysLeft, "day")}`;
  return `${pluralize(Math.abs(daysLeft), "day")} ${overdueWord}`;
}

/**
 * Due-in chip: red with "overdue" when past, amber within `soonDays`, muted
 * otherwise. The words always carry the meaning (never colour alone).
 */
export function DaysChip({
  daysLeft,
  soonDays = 3,
  overdueWord,
  className,
}: {
  daysLeft: number;
  soonDays?: number;
  overdueWord?: string;
  className?: string;
}) {
  const overdue = daysLeft < 0;
  const soon = !overdue && daysLeft <= soonDays;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 text-xs tabular-nums ring-1 ring-inset",
        overdue
          ? "bg-danger/10 font-medium text-danger ring-danger/25"
          : soon
            ? "bg-warning/10 font-medium text-warning ring-warning/25"
            : "text-fg-muted ring-border",
        className,
      )}
    >
      <CalendarClock aria-hidden className="size-3.5 shrink-0" />
      {daysLabel(daysLeft, overdueWord)}
    </span>
  );
}
