"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { createTaskAction } from "@/actions/tasks";
import { Spinner } from "@/components/ui/spinner";
import { TASK_STATUS_CONFIG } from "@/lib/constants";
import { TASK_TITLE_MAX } from "@/lib/schemas/tasks";
import type { TaskStatus, TaskWithMeta } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface TaskQuickAddProps {
  projectId: string;
  status?: TaskStatus;
  milestoneId?: string | null;
  /** Creates subtasks of this task. */
  parentTaskId?: string | null;
  placeholder?: string;
  onCreated?: (task: TaskWithMeta) => void;
  /** Start expanded (an input) instead of an "Add task" button. */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * One-line task creation. Enter creates the task and keeps focus for the next
 * one; Escape (or leaving an empty field) collapses it back to a button.
 */
export function TaskQuickAdd({
  projectId,
  status = "todo",
  milestoneId = null,
  parentTaskId = null,
  placeholder,
  onCreated,
  defaultOpen = false,
  className,
}: TaskQuickAddProps) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const label = parentTaskId ? "Add a subtask" : `Add a task to ${TASK_STATUS_CONFIG[status].label}`;

  async function submit() {
    const value = title.trim();
    if (!value || pending) return;
    setPending(true);
    try {
      const result = await createTaskAction({
        project_id: projectId,
        title: value,
        status,
        milestone_id: milestoneId,
        parent_task_id: parentTaskId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setTitle("");
      setAnnouncement(`Created ${result.data.key}: ${result.data.title}`);
      onCreated?.(result.data);
      router.refresh();
    } catch {
      toast.error("Could not create the task. Please try again.");
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setTitle("");
      if (!defaultOpen) setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className={cn(
          "flex h-8 w-full items-center gap-1.5 rounded-[10px] px-2 text-[13px] font-medium text-fg-muted outline-none",
          "transition-[background-color,color] duration-(--dur-2) hover:bg-surface hover:text-fg",
          "focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Plus aria-hidden className="size-4" />
        {parentTaskId ? "Add subtask" : "Add task"}
        <span className="sr-only"> to {TASK_STATUS_CONFIG[status].label}</span>
      </button>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        value={title}
        autoFocus={!defaultOpen}
        readOnly={pending}
        maxLength={TASK_TITLE_MAX}
        placeholder={placeholder ?? (parentTaskId ? "Subtask title" : "Task title")}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!defaultOpen && !title.trim() && !pending) setOpen(false);
        }}
        className={cn(
          "h-9 w-full min-w-0 rounded-[10px] border border-input-border bg-surface pl-3 pr-9 text-base text-fg outline-none sm:text-sm",
          "placeholder:text-fg-subtle transition-[border-color,box-shadow] duration-(--dur-2)",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        )}
      />
      <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle">
        {pending ? <Spinner size="sm" /> : <CornerDownLeft className="size-3.5" />}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
