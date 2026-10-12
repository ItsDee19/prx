"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { TASK_TITLE_MAX } from "@/lib/schemas/tasks";
import type { TaskWithMeta } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isClosedTaskStatus } from "./task-helpers";
import { useSaveTask } from "./task-inline-editors";

export interface TaskTitleEditorProps {
  task: TaskWithMeta;
  onChanged?: () => void;
  className?: string;
}

/**
 * The task title, edited in place: click (or Enter on it) to edit, Enter or
 * leaving the field saves, Escape cancels. Render it inside the heading.
 */
export function TaskTitleEditor({ task, onChanged, className }: TaskTitleEditorProps) {
  const save = useSaveTask(onChanged ? () => onChanged() : undefined);
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [title, setTitle] = useState(task.title);
  const [synced, setSynced] = useState(task.title);
  if (synced !== task.title) {
    setSynced(task.title);
    setTitle(task.title);
  }

  async function commit() {
    const value = draft.replace(/\s+/g, " ").trim();
    setEditing(false);
    if (!value || value === title) return;
    const previous = title;
    setTitle(value);
    const saved = await save(task.id, { title: value });
    if (!saved) setTitle(previous);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <>
        <label htmlFor={fieldId} className="sr-only">
          Title of {task.key}
        </label>
        <textarea
          id={fieldId}
          autoFocus
          rows={1}
          value={draft}
          maxLength={TASK_TITLE_MAX}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => void commit()}
          onFocus={(event) => event.currentTarget.select()}
          className={cn(
            "-mx-2 block w-[calc(100%+1rem)] resize-none rounded-[10px] border border-input-border bg-surface px-2 py-1 text-fg outline-none [field-sizing:content]",
            "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
            className,
          )}
        />
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(title);
        setEditing(true);
      }}
      title="Edit title"
      className={cn(
        "-mx-2 block w-[calc(100%+1rem)] rounded-[10px] px-2 py-1 text-left outline-none [overflow-wrap:anywhere]",
        "transition-[background-color] duration-(--dur-2) hover:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-ring",
        isClosedTaskStatus(task.status) && "text-fg-muted",
        className,
      )}
    >
      {title}
    </button>
  );
}
