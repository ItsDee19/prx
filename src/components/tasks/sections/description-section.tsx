"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { TASK_DESCRIPTION_MAX } from "@/lib/schemas/tasks";
import type { TaskDrawerSectionProps } from "../drawer-sections";
import { useSaveTask } from "../task-inline-editors";

/** Click-to-edit description (whitespace preserved). Ctrl/Cmd+Enter saves, Escape cancels. */
export function TaskDescriptionSection({ task, onChanged }: TaskDrawerSectionProps) {
  const save = useSaveTask(() => onChanged());
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.description);
  const [saving, setSaving] = useState(false);
  const description = task.description.trim();
  const tooLong = draft.length > TASK_DESCRIPTION_MAX;

  function start() {
    setDraft(task.description);
    setEditing(true);
  }

  async function commit() {
    if (tooLong) return;
    if (draft === task.description) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const saved = await save(task.id, { description: draft });
    setSaving(false);
    if (saved) setEditing(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
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
      <div className="space-y-2">
        <label htmlFor={fieldId} className="sr-only">
          Description
        </label>
        <Textarea
          id={fieldId}
          autoFocus
          rows={6}
          value={draft}
          invalid={tooLong}
          placeholder="What needs to happen, and what does done look like?"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {tooLong ? (
            <p role="alert" className="mr-auto text-xs text-danger">
              {draft.length - TASK_DESCRIPTION_MAX} characters over the limit.
            </p>
          ) : (
            <p className="mr-auto flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle pointer-coarse:hidden">
              <Kbd keys="mod+enter" /> to save, <Kbd keys="esc" /> to cancel.
            </p>
          )}
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void commit()} loading={saving} disabled={tooLong}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      className="group/desc relative -mx-3 block w-[calc(100%+1.5rem)] rounded-[12px] px-3 py-2 text-left outline-none transition-[background-color] duration-(--dur-2) hover:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      {description ? <span className="sr-only">Edit the description: </span> : null}
      {description ? (
        <span className="block max-w-[80ch] whitespace-pre-wrap pr-5 text-sm leading-6 text-fg [overflow-wrap:anywhere]">{task.description}</span>
      ) : (
        <span className="block text-sm text-fg-subtle">Add a description…</span>
      )}
      <Pencil
        aria-hidden
        className="absolute right-3 top-2.5 size-3.5 text-fg-subtle opacity-0 transition-opacity duration-(--dur-2) group-hover/desc:opacity-100 group-focus-visible/desc:opacity-100"
      />
    </button>
  );
}
