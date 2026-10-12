"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, GitBranch, Lock, MessageSquare, SquareCheck } from "lucide-react";
import { LabelChips } from "@/components/labels/label-chips";
import { PriorityBadge } from "@/components/projects/priority-badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { TaskWithMeta, UserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SubtaskHint } from "./subtask-hint";
import { isClosedTaskStatus } from "./task-helpers";
import { AssigneeEditor, DueDateEditor } from "./task-inline-editors";
import { TaskLink, useTaskHref } from "./task-link";
import { TaskKey } from "./task-status";
import { TaskStatusMenu } from "./task-status-menu";

export interface TaskRowProps {
  task: TaskWithMeta;
  users: UserSummary[];
  showProject?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean, shiftKey: boolean) => void;
  /** Workspace today. */
  today: string;
  /** Keep the selection checkbox visible (something in the list is selected). */
  selectionActive?: boolean;
  /** Show the phase name (lists not grouped by phase). */
  showMilestone?: boolean;
  /** Key of the parent task, shown as "Subtask of PRX-n" on subtasks. */
  parentKey?: string | null;
  className?: string;
}

/**
 * One task as a dense row with inline status, assignee and due-date editors.
 * Title on the first line and meta below until xl (the sidebar takes room from
 * lg); from xl a single line with secondary columns appearing as room allows. The row element carries
 * `data-list-item-id` and is focusable (Enter opens the drawer).
 */
export function TaskRow({
  task,
  users,
  showProject = false,
  selectable = false,
  selected = false,
  onSelectedChange,
  today,
  selectionActive = false,
  showMilestone = false,
  parentKey = null,
  className,
}: TaskRowProps) {
  const router = useRouter();
  const taskHref = useTaskHref();
  const closed = isClosedTaskStatus(task.status);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && event.target === event.currentTarget) {
      event.preventDefault();
      router.push(taskHref(task.key), { scroll: false });
    }
  }

  return (
    <div
      data-list-item-id={task.id}
      tabIndex={-1}
      aria-label={`${task.key}, ${task.title}`}
      aria-selected={selectable ? selected : undefined}
      onKeyDown={onKeyDown}
      className={cn(
        "group/row relative flex min-w-0 items-start gap-2 px-3 py-2.5 outline-none sm:px-4 xl:items-center xl:py-2",
        "transition-[background-color] duration-(--dur-2) hover:bg-surface-2/60",
        "focus-visible:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected && "bg-accent-soft/60 hover:bg-accent-soft/80",
        className,
      )}
    >
      {selectable ? (
        <span
          className={cn(
            "relative z-10 flex h-6 shrink-0 items-center transition-opacity duration-(--dur-2)",
            selected || selectionActive
              ? "opacity-100"
              : "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 pointer-coarse:opacity-100",
          )}
        >
          <Checkbox
            checked={selected}
            aria-label={`Select ${task.key}`}
            onChange={() => undefined}
            onClick={(event: MouseEvent<HTMLInputElement>) => {
              event.stopPropagation();
              onSelectedChange?.(!selected, event.shiftKey);
            }}
          />
        </span>
      ) : null}

      <span className="relative z-10 flex h-6 shrink-0 items-center">
        <TaskStatusMenu taskId={task.id} status={task.status} taskLabel={task.key} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1 xl:flex-row xl:items-center xl:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TaskKey value={task.key} className="hidden xl:inline" />
          <TaskLink
            taskKey={task.key}
            className={cn(
              "min-w-0 truncate text-sm font-medium leading-6 text-fg outline-none",
              "after:absolute after:inset-0 focus-visible:underline",
              closed && "text-fg-muted line-through decoration-fg-subtle/60",
            )}
          >
            {task.title}
          </TaskLink>
          <span className="hidden min-w-0 shrink items-center gap-1.5 xl:flex">
            {task.is_blocked ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-danger/10 px-1.5 text-[11px] font-medium text-danger ring-1 ring-inset ring-danger/25">
                <Lock aria-hidden className="size-3" />
                Blocked
              </span>
            ) : null}
            {task.is_deliverable ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-accent-2/10 px-1.5 text-[11px] font-medium text-accent-2 ring-1 ring-inset ring-accent-2/25">
                <BadgeCheck aria-hidden className="size-3" />
                Deliverable
              </span>
            ) : null}
            {task.labels.length > 0 ? <LabelChips labels={task.labels} max={2} className="flex-nowrap" /> : null}
          </span>
        </div>

        {/*
          Meta. Phones: identity (key, project, counts) shrinks first; the editors
          (due, priority, assignee) wrap to their own right-aligned line only when
          there is no room. From xl: one row of fixed-width columns.
        */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted xl:flex-nowrap">
          <div className="flex min-w-0 flex-[1_1_10rem] items-center gap-2 xl:flex-none">
            <TaskKey value={task.key} className="xl:hidden" />
            {task.parent_task_id ? (
              <SubtaskHint parentKey={parentKey} className="max-w-40 shrink xl:w-36 xl:max-w-none" />
            ) : null}
            {task.is_blocked ? (
              <span className="inline-flex shrink-0 items-center gap-1 font-medium text-danger xl:hidden">
                <Lock aria-hidden className="size-3" />
                Blocked
              </span>
            ) : null}
            {showProject ? (
              <span className="flex min-w-0 items-center gap-1.5 xl:w-40 2xl:w-48">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full bg-fg-subtle"
                  style={task.project.color ? { backgroundColor: task.project.color } : undefined}
                />
                <span className="truncate">
                  {task.project.client_code ? (
                    <span className="font-mono text-[11px] text-fg-subtle">{task.project.client_code} </span>
                  ) : null}
                  {task.project.name}
                </span>
              </span>
            ) : null}
            {task.labels.length > 0 ? (
              <LabelChips labels={task.labels} max={2} className="hidden flex-nowrap sm:inline-flex xl:hidden" />
            ) : null}
            {showMilestone && task.milestone ? (
              <span className="hidden min-w-0 max-w-40 truncate 2xl:inline">{task.milestone.name}</span>
            ) : null}
            {task.checklist_total > 0 ? (
              <span className="hidden shrink-0 items-center gap-1 tabular-nums sm:inline-flex" title="Checklist">
                <SquareCheck aria-hidden className="size-3.5" />
                {task.checklist_done}/{task.checklist_total}
                <span className="sr-only"> checklist items done</span>
              </span>
            ) : null}
            {task.subtask_count > 0 ? (
              <span className="hidden shrink-0 items-center gap-1 tabular-nums sm:inline-flex" title="Subtasks">
                <GitBranch aria-hidden className="size-3.5" />
                {task.subtask_done_count}/{task.subtask_count}
                <span className="sr-only"> subtasks done</span>
              </span>
            ) : null}
            {task.comment_count > 0 ? (
              <span className="hidden shrink-0 items-center gap-1 tabular-nums 2xl:inline-flex" title="Comments">
                <MessageSquare aria-hidden className="size-3.5" />
                {task.comment_count}
                <span className="sr-only"> comments</span>
              </span>
            ) : null}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0 xl:gap-3">
            <span className="relative z-10 xl:w-24 xl:text-right">
              <DueDateEditor task={task} today={today} />
            </span>
            {/* Medium is the default: only other priorities earn an icon (always with its label for screen readers). */}
            <span className="relative z-10 flex w-5 justify-center">
              {task.priority !== "medium" ? <PriorityBadge priority={task.priority} iconOnly /> : null}
            </span>
            <span className="relative z-10">
              <AssigneeEditor task={task} users={users} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
