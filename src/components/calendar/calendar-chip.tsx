"use client";

import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { TaskKey, TaskStatusIcon } from "@/components/tasks/task-status";
import { useTaskHref } from "@/components/tasks/task-link";
import { UserAvatar } from "@/components/ui/avatar";
import type { CalendarEntry } from "@/lib/data/calendar";
import { cn } from "@/lib/utils";
import { CALENDAR_CHIP_KINDS, chipKindOf, describeItem, isClosedItem, isOverdueItem } from "./calendar-kinds";

export type ChipDensity = "compact" | "comfortable";

export interface CalendarChipContentProps {
  item: CalendarEntry;
  today: string;
  density: ChipDensity;
}

/**
 * The visible chip: a project-colour bar, the kind's icon (task status icon
 * for tasks), the title, and an alert icon on overdue tasks. Compact chips
 * (month cells) are one line; comfortable chips (week columns) add the task
 * key, the project and the assignee.
 */
export function CalendarChipContent({ item, today, density }: CalendarChipContentProps) {
  const kind = chipKindOf(item);
  const config = CALENDAR_CHIP_KINDS[kind];
  const KindIcon = config.icon;
  const overdue = isOverdueItem(item, today);
  const closed = isClosedItem(item);
  const icon =
    item.kind === "task" ? (
      <TaskStatusIcon status={item.status} className="size-3.5 shrink-0" />
    ) : (
      <KindIcon aria-hidden className={cn("size-3.5 shrink-0", config.iconClass)} />
    );

  const title = (
    <span
      className={cn(
        "min-w-0 [overflow-wrap:anywhere]",
        density === "compact" ? "truncate" : "line-clamp-2",
        closed && "text-fg-muted line-through decoration-fg-subtle/70",
        overdue && "text-danger",
      )}
    >
      {item.title}
    </span>
  );

  const alert = overdue ? <CircleAlert aria-hidden className="size-3.5 shrink-0 text-danger" /> : null;

  return (
    <>
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[3px] rounded-full"
        style={{ backgroundColor: item.project_color ?? "var(--fg-subtle)" }}
      />
      {density === "compact" ? (
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {icon}
          {title}
          {alert}
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-1.5">
            {icon}
            {item.kind === "task" ? (
              <TaskKey value={item.task_key} className={cn(overdue && "text-danger")} />
            ) : (
              <span className={cn("truncate text-[11px] font-medium", config.iconClass)}>{config.label}</span>
            )}
            {alert}
          </span>
          <span className="flex min-w-0 text-[13px] font-medium leading-[1.125rem]">{title}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-fg-muted">
            {item.client_code ? <span className="shrink-0 font-mono font-semibold tracking-tight">{item.client_code}</span> : null}
            <span className="min-w-0 truncate">{item.project_name}</span>
            {item.kind === "task" && item.assignee ? (
              <UserAvatar user={item.assignee} size="xs" className="ml-auto size-4 text-[8px]" />
            ) : null}
          </span>
        </span>
      )}
    </>
  );
}

/** Chip surface classes shared by links, the drag overlay and popover rows. */
export function chipClassName(item: CalendarEntry, density: ChipDensity, className?: string): string {
  const config = CALENDAR_CHIP_KINDS[chipKindOf(item)];
  return cn(
    "relative flex w-full min-w-0 select-none rounded-lg pl-3 pr-1.5 text-left text-xs outline-none ring-1 ring-inset",
    "transition-[box-shadow,background-color,opacity,transform] duration-(--dur-2) ease-(--ease-out-quart)",
    "focus-visible:ring-2 focus-visible:ring-ring",
    density === "compact" ? "h-6 items-center pointer-coarse:h-8" : "py-1.5",
    config.chipClass,
    className,
  );
}

export interface CalendarItemLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> {
  item: CalendarEntry;
  today: string;
  children: ReactNode;
}

/**
 * Link for any calendar item: tasks open the drawer in place (`?task=KEY`,
 * keeping the calendar's filters), everything else goes to its project.
 * The accessible name describes the item in full (kind, status, project).
 */
export const CalendarItemLink = forwardRef<HTMLAnchorElement, CalendarItemLinkProps>(function CalendarItemLink(
  { item, today, children, ...props },
  ref,
) {
  const taskHref = useTaskHref();
  const isTask = item.kind === "task";
  return (
    <Link
      ref={ref}
      href={isTask ? taskHref(item.task_key) : item.href}
      scroll={isTask ? false : undefined}
      aria-label={describeItem(item, today)}
      title={isTask ? `${item.task_key} ${item.title}` : `${CALENDAR_CHIP_KINDS[chipKindOf(item)].label}: ${item.title}`}
      // Drags belong to dnd-kit: never start a native link drag.
      draggable={false}
      {...props}
    >
      {children}
    </Link>
  );
});
