"use client";

import { BadgeCheck, SquareCheck, GitBranch, Lock, MessageSquare, UserRound } from "lucide-react";
import { LabelChips } from "@/components/labels/label-chips";
import { PriorityBadge } from "@/components/projects/priority-badge";
import { UserAvatar } from "@/components/ui/avatar";
import type { TaskStatus, TaskWithMeta } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SubtaskHint } from "./subtask-hint";
import { TaskDueChip } from "./task-due-chip";
import { isClosedTaskStatus } from "./task-helpers";
import { TaskLink } from "./task-link";
import { TaskKey } from "./task-status";
import { TaskStatusMenu } from "./task-status-menu";

export interface TaskCardProps {
  task: TaskWithMeta;
  /** Workspace today. */
  today: string;
  showProject?: boolean;
  /** Board: the card wrapper is the focus stop, so the title link leaves the tab order. */
  focusableLink?: boolean;
  /** Board: take over status changes from the card's status menu (optimistic move). */
  onStatusChange?: (status: TaskStatus) => void;
  /** Key of the parent task, shown as "Subtask of PRX-n" on subtasks. */
  parentKey?: string | null;
  className?: string;
}

/**
 * Dense task card: status menu, mono key, title (opens the drawer), label
 * chips, due chip, checklist and subtask progress, comments, Blocked /
 * Deliverable badges and the assignee. The whole card is clickable through
 * a stretched title link; the status menu sits above it.
 */
export function TaskCard({
  task,
  today,
  showProject = false,
  focusableLink = true,
  onStatusChange,
  parentKey = null,
  className,
}: TaskCardProps) {
  const closed = isClosedTaskStatus(task.status);
  const showPriority = task.priority === "high" || task.priority === "urgent";

  return (
    <article
      className={cn(
        "group/card relative flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-surface p-3 shadow-card",
        "transition-[border-color,box-shadow] duration-(--dur-2) hover:border-border-strong",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="relative z-10 -ml-0.5">
          <TaskStatusMenu
            taskId={task.id}
            status={task.status}
            taskLabel={task.key}
            onSelect={onStatusChange}
          />
        </span>
        <TaskKey value={task.key} />
        {showProject ? (
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-fg-muted">
            <span aria-hidden className="text-fg-subtle">
              ·
            </span>
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-fg-subtle"
              style={task.project.color ? { backgroundColor: task.project.color } : undefined}
            />
            <span className="truncate">
              {task.project.client_code ? `${task.project.client_code} · ` : ""}
              {task.project.name}
            </span>
          </span>
        ) : null}
        {showPriority ? <PriorityBadge priority={task.priority} iconOnly className="relative z-10 ml-auto" /> : null}
      </div>

      {task.parent_task_id ? <SubtaskHint parentKey={parentKey} className="-mb-1" /> : null}

      <TaskLink
        taskKey={task.key}
        tabIndex={focusableLink ? undefined : -1}
        className={cn(
          "line-clamp-3 text-sm font-medium leading-5 text-fg outline-none [overflow-wrap:anywhere]",
          "after:absolute after:inset-0 after:rounded-2xl",
          "focus-visible:after:ring-2 focus-visible:after:ring-ring",
          "transition-opacity duration-(--dur-2)",
          closed && "text-fg-muted line-through decoration-fg-subtle/60",
        )}
      >
        {task.title}
      </TaskLink>

      {task.labels.length > 0 ? <LabelChips labels={task.labels} max={3} /> : null}

      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-fg-muted">
        <TaskDueChip date={task.due_date} status={task.status} today={today} />
        {task.checklist_total > 0 ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 tabular-nums",
              task.checklist_done === task.checklist_total && "text-success",
            )}
            title={`Checklist ${task.checklist_done} of ${task.checklist_total} done`}
          >
            <SquareCheck aria-hidden className="size-3.5" />
            {task.checklist_done}/{task.checklist_total}
            <span className="sr-only"> checklist items done</span>
          </span>
        ) : null}
        {task.subtask_count > 0 ? (
          <span
            className="inline-flex items-center gap-1 tabular-nums"
            title={`${task.subtask_done_count} of ${task.subtask_count} subtasks done`}
          >
            <GitBranch aria-hidden className="size-3.5" />
            {task.subtask_done_count}/{task.subtask_count}
            <span className="sr-only"> subtasks done</span>
          </span>
        ) : null}
        {task.comment_count > 0 ? (
          <span className="inline-flex items-center gap-1 tabular-nums" title={`${task.comment_count} comments`}>
            <MessageSquare aria-hidden className="size-3.5" />
            {task.comment_count}
            <span className="sr-only"> comments</span>
          </span>
        ) : null}
        {task.is_blocked ? (
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-danger/10 px-1.5 font-medium text-danger ring-1 ring-inset ring-danger/25">
            <Lock aria-hidden className="size-3" />
            Blocked
          </span>
        ) : null}
        {task.is_deliverable ? (
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-accent-2/10 px-1.5 font-medium text-accent-2 ring-1 ring-inset ring-accent-2/25">
            <BadgeCheck aria-hidden className="size-3" />
            Deliverable
          </span>
        ) : null}
        <span className="ml-auto shrink-0">
          {task.assignee ? (
            <UserAvatar user={task.assignee} size="xs" />
          ) : (
            <span
              role="img"
              aria-label="Unassigned"
              title="Unassigned"
              className="flex size-5 items-center justify-center rounded-full border border-dashed border-border-strong text-fg-subtle"
            >
              <UserRound aria-hidden className="size-3" />
            </span>
          )}
        </span>
      </div>
    </article>
  );
}
