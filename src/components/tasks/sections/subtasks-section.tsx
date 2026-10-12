"use client";

import { useState } from "react";
import { CornerLeftUp } from "lucide-react";
import { toast } from "sonner";
import { updateTaskStatusAction } from "@/actions/tasks";
import { UserAvatar } from "@/components/ui/avatar";
import type { TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TaskDrawerSectionProps } from "../drawer-sections";
import { TaskCheck } from "../task-check";
import { TaskDueChip } from "../task-due-chip";
import { TaskLink } from "../task-link";
import { TaskQuickAdd } from "../task-quick-add";
import { TaskKey, TaskStatusIcon } from "../task-status";

/** One level of subtasks: tick them done, open them, add more. A subtask links back to its parent. */
export function TaskSubtasksSection({ task, today, onChanged }: TaskDrawerSectionProps) {
  const [overrides, setOverrides] = useState<Record<string, TaskStatus>>({});
  const [synced, setSynced] = useState(task.subtasks);
  if (synced !== task.subtasks) {
    setSynced(task.subtasks);
    setOverrides({});
  }

  if (task.parent_task_id) {
    return task.parent ? (
      <p className="flex min-w-0 items-center gap-2 text-sm text-fg-muted">
        <CornerLeftUp aria-hidden className="size-4 shrink-0 text-fg-subtle" />
        <span className="shrink-0">Subtask of</span>
        <TaskLink
          taskKey={task.parent.key}
          className="flex min-w-0 items-center gap-1.5 rounded-md font-medium text-fg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          <TaskStatusIcon status={task.parent.status} className="size-3.5" />
          <TaskKey value={task.parent.key} />
          <span className="truncate">{task.parent.title}</span>
        </TaskLink>
      </p>
    ) : (
      <p className="text-sm text-fg-subtle">The parent task no longer exists.</p>
    );
  }

  async function toggle(id: string, done: boolean, previous: TaskStatus) {
    const next: TaskStatus = done ? "done" : "todo";
    setOverrides((current) => ({ ...current, [id]: next }));
    const result = await updateTaskStatusAction(id, next);
    if (!result.ok) {
      setOverrides((current) => ({ ...current, [id]: previous }));
      toast.error(result.error);
      return;
    }
    onChanged();
  }

  const subtasks = task.subtasks.map((subtask) => ({ ...subtask, status: overrides[subtask.id] ?? subtask.status }));
  const open = subtasks.filter((subtask) => subtask.status !== "cancelled");
  const done = open.filter((subtask) => subtask.status === "done").length;

  return (
    <div className="space-y-2">
      {open.length > 0 ? (
        <p className="text-xs tabular-nums text-fg-muted">
          {done} of {open.length} done
        </p>
      ) : null}
      {subtasks.length > 0 ? (
        <ul role="list" className="-mx-1.5 space-y-0.5">
          {subtasks.map((subtask) => {
            const closed = subtask.status === "done" || subtask.status === "cancelled";
            return (
              <li
                key={subtask.id}
                className="group/sub flex min-h-9 min-w-0 items-center gap-2 rounded-[10px] px-1.5 transition-[background-color] duration-(--dur-2) hover:bg-surface-2/60"
              >
                <TaskCheck
                  shape="circle"
                  checked={subtask.status === "done"}
                  disabled={subtask.status === "cancelled"}
                  onCheckedChange={(value) => void toggle(subtask.id, value, subtask.status)}
                  label={`${subtask.key} ${subtask.title}: mark ${subtask.status === "done" ? "not done" : "done"}`}
                />
                <TaskKey value={subtask.key} />
                <TaskLink
                  taskKey={subtask.key}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-md text-sm text-fg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
                    "transition-opacity duration-(--dur-2)",
                    closed && "text-fg-muted line-through decoration-fg-subtle/60",
                  )}
                >
                  {subtask.title}
                </TaskLink>
                <TaskDueChip date={subtask.due_date} status={subtask.status} today={today} withIcon={false} variant="text" />
                {subtask.assignee ? <UserAvatar user={subtask.assignee} size="xs" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <TaskQuickAdd
        projectId={task.project_id}
        parentTaskId={task.id}
        milestoneId={task.milestone_id}
        onCreated={() => onChanged()}
      />
    </div>
  );
}
