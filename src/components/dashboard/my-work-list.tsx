"use client";

import { useState } from "react";
import { CalendarDays, Lock, Sun, TriangleAlert, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { updateTaskStatusAction } from "@/actions/tasks";
import { PriorityBadge } from "@/components/projects/priority-badge";
import { TaskCheck } from "@/components/tasks/task-check";
import { TaskDueChip } from "@/components/tasks/task-due-chip";
import { TaskLink } from "@/components/tasks/task-link";
import { TaskKey } from "@/components/tasks/task-status";
import type { HomeMyWork, HomeTask } from "@/lib/data/home";
import type { TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type WorkGroup = "overdue" | "today" | "this_week";

const GROUPS: Record<WorkGroup, { label: string; icon: LucideIcon; iconClass: string; limit: number }> = {
  overdue: { label: "Overdue", icon: TriangleAlert, iconClass: "text-danger", limit: 5 },
  today: { label: "Today", icon: Sun, iconClass: "text-warning", limit: 6 },
  this_week: { label: "Later this week", icon: CalendarDays, iconClass: "text-accent", limit: 6 },
};

interface CompletedEntry {
  task: HomeTask;
  group: WorkGroup;
  /** Position in its group when it was ticked, so it stays in place after the refresh. */
  index: number;
  /** Status to restore on Undo. */
  previous: TaskStatus;
}

export interface MyWorkListProps {
  /** Only the overdue / today / this-week buckets are used (counts render server-side). */
  work: Pick<HomeMyWork, WorkGroup>;
  /** Workspace today. */
  today: string;
}

/**
 * The "Today" focus list: my overdue, due-today and later-this-week tasks.
 * Ticking a task marks it done in place (the check draws in, the title fades
 * to muted) and offers Undo; ticked tasks stay where they were until the page
 * is next opened, even after the server refresh drops them from the open list.
 */
export function MyWorkList({ work, today }: MyWorkListProps) {
  const [overrides, setOverrides] = useState<Record<string, TaskStatus>>({});
  const [completed, setCompleted] = useState<Record<string, CompletedEntry>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});

  function rowsOf(group: WorkGroup): HomeTask[] {
    const rows = [...work[group]];
    const present = new Set(rows.map((task) => task.id));
    const extra = Object.values(completed)
      .filter((entry) => entry.group === group && !present.has(entry.task.id))
      .sort((a, b) => a.index - b.index);
    for (const entry of extra) rows.splice(Math.min(entry.index, rows.length), 0, entry.task);
    return rows;
  }

  async function setStatus(task: HomeTask, next: TaskStatus, revertTo: TaskStatus): Promise<boolean> {
    setPending((current) => ({ ...current, [task.id]: true }));
    setOverrides((current) => ({ ...current, [task.id]: next }));
    const result = await updateTaskStatusAction(task.id, next);
    setPending((current) => ({ ...current, [task.id]: false }));
    if (!result.ok) {
      setOverrides((current) => ({ ...current, [task.id]: revertTo }));
      toast.error(result.error);
      return false;
    }
    return true;
  }

  async function complete(task: HomeTask, group: WorkGroup, index: number) {
    const previous = overrides[task.id] ?? task.status;
    setCompleted((current) => ({ ...current, [task.id]: { task, group, index, previous } }));
    const ok = await setStatus(task, "done", previous);
    if (!ok) {
      setCompleted((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      return;
    }
    toast.success(`${task.key} is done.`, {
      action: { label: "Undo", onClick: () => void reopen(task, previous) },
    });
  }

  async function reopen(task: HomeTask, previous: TaskStatus) {
    const restore = previous === "done" || previous === "cancelled" ? "todo" : previous;
    const ok = await setStatus(task, restore, "done");
    if (!ok) return;
    setCompleted((current) => {
      const next = { ...current };
      delete next[task.id];
      return next;
    });
  }

  function renderGroup(group: WorkGroup) {
    const rows = rowsOf(group);
    if (rows.length === 0) return null;
    const config = GROUPS[group];
    const GroupIcon = config.icon;
    const shown = rows.slice(0, config.limit);
    const hidden = rows.length - shown.length;
    const headingId = `home-work-${group}`;
    return (
      <div key={group} className="min-w-0">
        <h3 id={headingId} className="mb-1 flex items-center gap-1.5 px-2 text-xs font-semibold text-fg-muted">
          <GroupIcon aria-hidden className={cn("size-3.5", config.iconClass)} />
          {config.label}
          <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-medium tabular-nums text-fg-muted ring-1 ring-inset ring-border">
            {rows.length}
          </span>
        </h3>
        <ul aria-labelledby={headingId} className="space-y-0.5">
          {shown.map((task, index) => {
            const status = overrides[task.id] ?? task.status;
            const done = status === "done";
            return (
              <li
                key={task.id}
                className="relative flex min-w-0 items-start gap-3 rounded-xl px-2 py-2 transition-colors duration-(--dur-2) hover:bg-surface-2/70"
              >
                <span className="relative z-10 mt-px flex h-5 items-center">
                  <TaskCheck
                    shape="circle"
                    checked={done}
                    disabled={pending[task.id] === true}
                    onCheckedChange={(value) => {
                      if (value) void complete(task, group, index);
                      else void reopen(task, completed[task.id]?.previous ?? "todo");
                    }}
                    label={`${task.key} ${task.title}: mark ${done ? "not done" : "done"}`}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <TaskLink
                    taskKey={task.key}
                    className={cn(
                      "block truncate text-sm font-medium leading-5 outline-none transition-colors duration-(--dur-2)",
                      "after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring",
                      done ? "text-fg-muted line-through decoration-fg-subtle/60" : "text-fg hover:text-accent",
                    )}
                  >
                    {task.title}
                  </TaskLink>
                  <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
                    <TaskKey value={task.key} />
                    <span aria-hidden className="text-fg-subtle">
                      ·
                    </span>
                    {task.project.client_code ? (
                      <span className="shrink-0 font-mono text-[11px] font-semibold text-fg">{task.project.client_code}</span>
                    ) : null}
                    <span className="min-w-0 truncate">{task.project.name}</span>
                    {task.is_blocked && !done ? (
                      <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-warning">
                        <Lock aria-hidden className="size-3" />
                        Blocked
                      </span>
                    ) : null}
                  </p>
                </div>
                <span className="relative z-10 flex h-5 shrink-0 items-center gap-1.5">
                  {task.priority === "urgent" || task.priority === "high" ? (
                    <PriorityBadge priority={task.priority} iconOnly />
                  ) : null}
                  <TaskDueChip date={task.due_date} status={status} today={today} withIcon={false} />
                </span>
              </li>
            );
          })}
        </ul>
        {hidden > 0 ? (
          <p className="px-2 pt-1 text-xs text-fg-muted">
            {hidden} more {config.label.toLowerCase()} in My tasks.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="@container grid min-w-0 gap-4 @2xl:grid-cols-2 @2xl:gap-6">
      <div className="min-w-0 space-y-4">
        {renderGroup("overdue")}
        {renderGroup("today")}
      </div>
      <div className="min-w-0 space-y-4">{renderGroup("this_week")}</div>
    </div>
  );
}
