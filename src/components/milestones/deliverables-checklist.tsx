"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, PackageCheck } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { ProgressBar } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { updateTaskStatusAction } from "@/actions/tasks";
import { TASK_STATUS_CONFIG } from "@/lib/constants";
import type { TaskStatus, TaskWithMeta } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export interface DeliverablesChecklistProps {
  deliverables: TaskWithMeta[];
  /** Called after a deliverable was ticked or unticked (e.g. to reload the phase panel). */
  onChanged?: () => void;
  /** Hides the tick boxes (read-only list). */
  readOnly?: boolean;
  className?: string;
}

/**
 * A phase's client deliverables (tasks flagged as deliverables) as a checklist.
 * Ticking marks the task done (unticking moves it back to Todo); the title
 * opens the task drawer. Cancelled deliverables stay listed, struck through,
 * and do not count toward the total.
 */
export function DeliverablesChecklist({ deliverables, onChanged, readOnly = false, className }: DeliverablesChecklistProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Optimistic statuses keyed by task id while a toggle is in flight or until fresh props arrive.
  const [overrides, setOverrides] = useState<Record<string, TaskStatus>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [seen, setSeen] = useState(deliverables);
  if (seen !== deliverables) {
    setSeen(deliverables);
    setOverrides({});
  }

  const statusOf = (task: TaskWithMeta): TaskStatus => overrides[task.id] ?? task.status;
  const counted = deliverables.filter((task) => statusOf(task) !== "cancelled");
  const done = counted.filter((task) => statusOf(task) === "done").length;

  function taskHref(key: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", key);
    return `${pathname}?${params.toString()}`;
  }

  async function toggle(task: TaskWithMeta, checked: boolean) {
    const next: TaskStatus = checked ? "done" : "todo";
    const previous = statusOf(task);
    setOverrides((current) => ({ ...current, [task.id]: next }));
    setPendingId(task.id);
    try {
      const result = await updateTaskStatusAction(task.id, next);
      if (!result.ok) {
        toast.error(result.error);
        setOverrides((current) => ({ ...current, [task.id]: previous }));
        return;
      }
      toast.success(checked ? `${task.key} marked done` : `${task.key} reopened`);
      onChanged?.();
      router.refresh();
    } catch {
      toast.error("Could not update the deliverable. Please try again.");
      setOverrides((current) => ({ ...current, [task.id]: previous }));
    } finally {
      setPendingId(null);
    }
  }

  if (deliverables.length === 0) {
    return (
      <p className={cn("flex items-start gap-2 text-sm text-fg-muted", className)}>
        <PackageCheck className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
        No deliverables yet. Flag a task in this phase as a client deliverable to list it here.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-3 text-xs text-fg-muted">
        <ProgressBar
          value={counted.length > 0 ? Math.round((done / counted.length) * 100) : 0}
          size="sm"
          className="w-24"
          label="Deliverables done"
        />
        <span className="tabular-nums" aria-live="polite">
          {done} of {counted.length} done
        </span>
      </div>
      <ul className="space-y-1" aria-label="Deliverables">
        {deliverables.map((task) => {
          const status = statusOf(task);
          const isDone = status === "done";
          const cancelled = status === "cancelled";
          const inputId = `deliverable-${task.id}`;
          return (
            <li
              key={task.id}
              className={cn(
                "group flex items-start gap-3 rounded-[10px] px-2 py-2 transition-colors duration-(--dur-2)",
                "hover:bg-surface-2/70 focus-within:bg-surface-2/70",
              )}
            >
              {/* The label pads the 16px box to a 40px target on touch screens without moving it. */}
              <label htmlFor={inputId} className="-m-1 flex shrink-0 cursor-pointer p-1 pointer-coarse:-m-3 pointer-coarse:p-3">
                <Checkbox
                  id={inputId}
                  checked={isDone}
                  disabled={readOnly || cancelled || pendingId === task.id}
                  onChange={(event) => void toggle(task, event.target.checked)}
                  aria-label={`${isDone ? "Reopen" : "Mark done"}: ${task.title}`}
                  className="mt-0.5 checked:border-success checked:bg-success checked:hover:border-success checked:hover:bg-success"
                />
              </label>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{task.key}</span>
                  <Link
                    href={taskHref(task.key)}
                    scroll={false}
                    className={cn(
                      "min-w-0 rounded text-sm leading-5 outline-none [overflow-wrap:anywhere]",
                      "transition-colors duration-(--dur-2) hover:text-accent focus-visible:ring-2 focus-visible:ring-ring",
                      isDone || cancelled ? "text-fg-muted" : "text-fg",
                      cancelled && "line-through",
                    )}
                  >
                    {task.title}
                  </Link>
                  {cancelled ? (
                    <span className="text-xs text-fg-subtle">({TASK_STATUS_CONFIG.cancelled.label})</span>
                  ) : null}
                </div>
                {task.approved_by_name || task.due_date || task.assignee ? (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                    {task.approved_by_name ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <BadgeCheck className="size-3.5 shrink-0" aria-hidden />
                        Approved by {task.approved_by_name}
                        {task.approved_on ? ` on ${formatDate(task.approved_on)}` : ""}
                      </span>
                    ) : null}
                    {task.due_date ? (
                      <span className="tabular-nums">Due {formatDate(task.due_date)}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {task.assignee ? (
                <Tooltip content={`Assignee: ${task.assignee.name}`}>
                  <span className="shrink-0">
                    <UserAvatar user={task.assignee} size="xs" />
                  </span>
                </Tooltip>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
