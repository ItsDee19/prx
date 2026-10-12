"use client";

import { useId, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarPlus, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { updateTaskAction } from "@/actions/tasks";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserPicker } from "@/components/ui/user-picker";
import type { TaskWithMeta, UpdateTaskInput, UserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isDateOnly } from "@/lib/workspace-time";
import { formatTaskDue, TaskDueChip } from "./task-due-chip";

/** Keeps clicks inside inline editors from reaching a surrounding row link. */
function stop(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * Saves a task patch with `updateTaskAction` and toasts failures. On success
 * it calls `onSaved`, or refreshes the page data when there is none. Returns
 * the saved task, or null on failure.
 */
export function useSaveTask(onSaved?: (task: TaskWithMeta) => void) {
  const router = useRouter();
  return async function save(taskId: string, patch: UpdateTaskInput): Promise<TaskWithMeta | null> {
    try {
      const result = await updateTaskAction(taskId, patch);
      if (!result.ok) {
        toast.error(result.error);
        return null;
      }
      // The caller's onSaved owns the refresh (the drawer reloads itself and the page).
      if (onSaved) onSaved(result.data);
      else router.refresh();
      return result.data;
    } catch {
      toast.error("Could not save the task. Please try again.");
      return null;
    }
  };
}

/** Local optimistic copy of a value that resyncs whenever the server value changes. */
function useSyncedState<T>(value: T): [T, (next: T) => void] {
  const [local, setLocal] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setLocal(value);
  }
  return [local, setLocal];
}

/* -------------------------------- Assignee -------------------------------- */

export interface AssigneeEditorProps {
  task: TaskWithMeta;
  users: UserSummary[];
  /** "compact" = avatar-only trigger (rows); "full" = avatar + name (drawer). */
  variant?: "compact" | "full";
  onSaved?: (task: TaskWithMeta) => void;
  className?: string;
}

export function AssigneeEditor({ task, users, variant = "compact", onSaved, className }: AssigneeEditorProps) {
  const save = useSaveTask(onSaved);
  const [assigneeId, setAssigneeId] = useSyncedState(task.assignee_id);
  // The task's own assignee may be inactive (not in the picker list); keep showing them.
  const assignee = users.find((user) => user.id === assigneeId) ?? (assigneeId === task.assignee_id ? task.assignee : null);

  async function change(id: string | null) {
    if (id === assigneeId) return;
    const previous = assigneeId;
    setAssigneeId(id);
    const saved = await save(task.id, { assignee_id: id });
    if (!saved) setAssigneeId(previous);
  }

  const label = assignee ? `Assignee: ${assignee.name}. Change assignee of ${task.key}` : `Assign ${task.key}`;

  return (
    <UserPicker
      users={users}
      value={assigneeId}
      onChange={(id) => void change(id)}
      allowUnassigned
      align="end"
      aria-label={`Assignee of ${task.key}`}
      trigger={
        <button
          type="button"
          onClick={stop}
          aria-label={label}
          className={cn(
            "relative inline-flex min-w-0 items-center gap-2 rounded-full outline-none",
            "transition-[background-color] duration-(--dur-2) hover:bg-surface-2",
            "focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-surface-2",
            "pointer-coarse:after:absolute pointer-coarse:after:-inset-2",
            variant === "full" ? "h-8 max-w-full pl-1 pr-2.5" : "size-7 justify-center",
            className,
          )}
        >
          {assignee ? (
            <UserAvatar user={assignee} size={variant === "full" ? "sm" : "xs"} />
          ) : (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-fg-subtle">
              <UserRound aria-hidden className="size-3" />
            </span>
          )}
          {variant === "full" ? (
            <span className={cn("min-w-0 truncate text-sm", assignee ? "text-fg" : "text-fg-muted")}>
              {assignee ? assignee.name : "Unassigned"}
            </span>
          ) : null}
        </button>
      }
    />
  );
}

/* ---------------------------------- Dates --------------------------------- */

export interface DateEditorProps {
  task: TaskWithMeta;
  field: "start_date" | "due_date";
  /** Workspace today. */
  today: string;
  variant?: "compact" | "full";
  onSaved?: (task: TaskWithMeta) => void;
  className?: string;
}

const DATE_FIELD_LABEL = { start_date: "Start date", due_date: "Due date" } as const;

/** A date in a popover (native date input + Save / Clear), so half-typed dates are never saved. */
export function DateEditor({ task, field, today, variant = "compact", onSaved, className }: DateEditorProps) {
  const save = useSaveTask(onSaved);
  const inputId = useId();
  const [value, setValue] = useSyncedState(task[field]);
  const [draft, setDraft] = useState(task[field] ?? "");
  const [open, setOpen] = useState(false);
  const label = DATE_FIELD_LABEL[field];
  const other = field === "due_date" ? task.start_date : task.due_date;
  const invalidOrder = Boolean(
    draft && other && (field === "due_date" ? draft < other : draft > other),
  );

  async function commit(next: string | null) {
    setOpen(false);
    if (next === value) return;
    const previous = value;
    setValue(next);
    const saved = await save(task.id, { [field]: next });
    if (!saved) setValue(previous);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={stop}
          aria-label={value ? `${label}: ${value}. Change ${label.toLowerCase()} of ${task.key}` : `Set a ${label.toLowerCase()} for ${task.key}`}
          className={cn(
            "relative inline-flex min-w-0 items-center gap-1.5 rounded-full outline-none",
            "transition-[background-color] duration-(--dur-2) hover:bg-surface-2",
            "focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-surface-2",
            "pointer-coarse:after:absolute pointer-coarse:after:-inset-2",
            variant === "full" ? "h-8 px-2" : "h-7 px-1.5",
            className,
          )}
        >
          {value ? (
            field === "due_date" ? (
              <TaskDueChip date={value} status={task.status} today={today} variant="text" />
            ) : (
              <span className="inline-flex items-center gap-1 text-xs tabular-nums text-fg-muted">
                <CalendarClock aria-hidden className="size-3.5" />
                <time dateTime={value}>{formatTaskDue(value, today)}</time>
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
              <CalendarPlus aria-hidden className="size-3.5" />
              {variant === "full" ? <span className="text-sm text-fg-muted">Not set</span> : null}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <form
          onClick={stop}
          onSubmit={(event) => {
            event.preventDefault();
            if ((draft && !isDateOnly(draft)) || invalidOrder) return;
            void commit(draft || null);
          }}
          className="space-y-3"
        >
          <label htmlFor={inputId} className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
            <CalendarClock aria-hidden className="size-3.5" />
            {label} for {task.key}
          </label>
          <Input
            id={inputId}
            type="date"
            value={draft}
            min={field === "due_date" ? (task.start_date ?? undefined) : undefined}
            max={field === "start_date" ? (task.due_date ?? undefined) : undefined}
            invalid={invalidOrder}
            onChange={(event) => setDraft(event.target.value)}
          />
          {invalidOrder ? (
            <p role="alert" className="text-xs text-danger">
              The due date can&apos;t be before the start date.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            {value ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void commit(null)}>
                <X aria-hidden />
                Clear
              </Button>
            ) : (
              <PopoverClose asChild>
                <Button type="button" variant="ghost" size="sm">
                  Cancel
                </Button>
              </PopoverClose>
            )}
            <Button type="submit" size="sm" disabled={invalidOrder || draft === (value ?? "")}>
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export type DueDateEditorProps = Omit<DateEditorProps, "field">;

/** Due date editor for rows (compact) and the drawer (full). */
export function DueDateEditor(props: DueDateEditorProps) {
  return <DateEditor {...props} field="due_date" />;
}
