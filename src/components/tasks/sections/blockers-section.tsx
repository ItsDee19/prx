"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { Ban, Lock, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { searchTaskRefsAction, setBlockedByAction } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { TaskRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TaskDrawerSectionProps } from "../drawer-sections";
import { isClosedTaskStatus } from "../task-helpers";
import { TaskLink } from "../task-link";
import { TaskKey, TaskStatusIcon } from "../task-status";

function RefChip({ item, onRemove }: { item: TaskRef; onRemove?: () => void }) {
  const closed = isClosedTaskStatus(item.status);
  return (
    <li className="group/ref flex min-h-9 min-w-0 items-center gap-2 rounded-[10px] px-1.5 transition-[background-color] duration-(--dur-2) hover:bg-surface-2/60">
      <TaskStatusIcon status={item.status} className="size-3.5" />
      <TaskKey value={item.key} />
      <TaskLink
        taskKey={item.key}
        className={cn(
          "min-w-0 flex-1 truncate rounded-md text-sm text-fg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
          closed && "text-fg-muted line-through decoration-fg-subtle/60",
        )}
      >
        {item.title}
      </TaskLink>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.key} as a blocker`}
          className={cn(
            "relative inline-flex size-7 shrink-0 items-center justify-center rounded-full text-fg-subtle outline-none",
            "opacity-0 transition-opacity duration-(--dur-2) group-hover/ref:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
            "hover:bg-surface-2 hover:text-danger focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5",
          )}
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </li>
  );
}

/**
 * "Blocked by" (editable) and "Blocking" (read-only). The picker searches open
 * tasks by title or key; cycles are refused by the server with a clear message.
 */
export function TaskBlockersSection({ task, onChanged }: TaskDrawerSectionProps) {
  const listId = useId();
  const [blockers, setBlockers] = useState(task.blocked_by);
  const [synced, setSynced] = useState(task.blocked_by);
  if (synced !== task.blocked_by) {
    setSynced(task.blocked_by);
    setBlockers(task.blocked_by);
  }
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TaskRef[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const result = await searchTaskRefsAction({ query: query.trim() || undefined, excludeId: task.id, limit: 8 });
      if (cancelled) return;
      setSearching(false);
      setActive(0);
      setResults(result.ok ? result.data.filter((item) => !blockers.some((blocker) => blocker.id === item.id)) : []);
      if (!result.ok) toast.error(result.error);
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, task.id, blockers]);

  async function save(next: TaskRef[]) {
    const previous = blockers;
    setBlockers(next);
    const result = await setBlockedByAction(
      task.id,
      next.map((item) => item.id),
    );
    if (!result.ok) {
      setBlockers(previous);
      toast.error(result.error);
      return;
    }
    setBlockers(result.data);
    onChanged();
  }

  function pick(item: TaskRef) {
    setOpen(false);
    setQuery("");
    void save([...blockers, item]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = results[Math.min(active, results.length - 1)];
      if (item) pick(item);
    }
  }

  const openBlockers = blockers.filter((item) => !isClosedTaskStatus(item.status)).length;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
            <Lock aria-hidden className="size-3.5" />
            Blocked by
            {openBlockers > 0 ? (
              <span className="rounded-full bg-danger/10 px-1.5 text-[11px] font-medium tabular-nums text-danger">
                {openBlockers} open
              </span>
            ) : null}
          </h4>
          <Popover
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setQuery("");
            }}
          >
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="-mr-2">
                <Plus aria-hidden />
                Add blocker
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search aria-hidden className="size-4 shrink-0 text-fg-subtle" />
                <input
                  type="text"
                  role="combobox"
                  autoFocus
                  aria-label="Find a task by title or key"
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={results.length > 0 ? `${listId}-${active}` : undefined}
                  value={query}
                  placeholder="Search tasks or PRX-12…"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onKeyDown}
                  className="h-10 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle sm:text-sm"
                />
                {searching ? <Spinner size="sm" /> : null}
              </div>
              {results.length === 0 ? (
                <p role="status" className="px-3 py-6 text-center text-sm text-fg-muted">
                  {searching ? "Searching…" : "No open tasks match."}
                </p>
              ) : (
                <ul id={listId} role="listbox" aria-label="Tasks" className="max-h-64 overflow-y-auto overscroll-contain p-1.5">
                  {results.map((item, index) => (
                    <li
                      key={item.id}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === active}
                      onPointerMove={() => setActive(index)}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => pick(item)}
                      className={cn(
                        "flex cursor-pointer select-none items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm text-fg pointer-coarse:py-2.5",
                        index === active && "bg-surface-2",
                      )}
                    >
                      <TaskStatusIcon status={item.status} className="size-3.5" />
                      <TaskKey value={item.key} />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>
        </div>
        {blockers.length > 0 ? (
          <ul role="list" className="-mx-1.5 space-y-0.5">
            {blockers.map((item) => (
              <RefChip key={item.id} item={item} onRemove={() => void save(blockers.filter((entry) => entry.id !== item.id))} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-subtle">Nothing is blocking this task.</p>
        )}
      </div>

      {task.blocking.length > 0 ? (
        <div className="space-y-1.5">
          <h4 className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
            <Ban aria-hidden className="size-3.5" />
            Blocking
          </h4>
          <ul role="list" className="-mx-1.5 space-y-0.5">
            {task.blocking.map((item) => (
              <RefChip key={item.id} item={item} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
