"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, ListTodo, Search } from "lucide-react";
import { searchTaskRefsAction } from "@/actions/tasks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { TaskRef } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface TaskPickerProps {
  /** Tasks are searched inside this project; the picker is disabled without one. */
  projectId: string | null;
  value: TaskRef | null;
  onChange: (task: TaskRef | null) => void;
  disabled?: boolean;
  id?: string;
  align?: "start" | "center" | "end";
  "aria-label": string;
  className?: string;
}

const NO_TASK = "No task";
const SEARCH_DEBOUNCE_MS = 150;

interface Option {
  task: TaskRef | null;
}

/**
 * Searchable open-task picker in a popover (combobox pattern, like
 * UserPicker): type a title or a PRX key, arrow keys move, Enter picks,
 * Escape closes. Results come from `searchTaskRefsAction` for the project.
 */
export function TaskPicker({
  projectId,
  value,
  onChange,
  disabled = false,
  id,
  align = "start",
  "aria-label": ariaLabel,
  className,
}: TaskPickerProps) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<TaskRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!open || !projectId) return;
    const request = ++requestRef.current;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await searchTaskRefsAction({ projectId, query: query.trim() || undefined, limit: 20 });
        if (request !== requestRef.current) return;
        if (result.ok) {
          setTasks(result.data);
          setError(null);
        } else {
          setError(result.error);
        }
      } catch {
        if (request === requestRef.current) setError("Could not load tasks.");
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    }, query ? SEARCH_DEBOUNCE_MS : 0);
    return () => window.clearTimeout(handle);
  }, [open, projectId, query]);

  const options: Option[] = [
    ...(!query.trim() ? [{ task: null }] : []),
    ...tasks.map((task) => ({ task })),
  ];
  const safeActive = Math.min(activeIndex, Math.max(0, options.length - 1));
  const optionId = (index: number) => `${baseId}-option-${index}`;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  function highlight(index: number) {
    setActiveIndex(index);
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(index))}`)?.scrollIntoView({ block: "nearest" });
  }

  function pick(option: Option) {
    onChange(option.task);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlight((safeActive + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlight((safeActive - 1 + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[safeActive];
      if (option) pick(option);
    }
  }

  const isDisabled = disabled || !projectId;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild disabled={isDisabled}>
        <button
          id={id}
          type="button"
          aria-label={value ? `${ariaLabel}: ${value.key} ${value.title}` : ariaLabel}
          className={cn(
            "inline-flex h-9 w-full min-w-0 items-center gap-2 rounded-[10px] border border-input-border bg-surface px-2.5 text-left text-base text-fg sm:text-sm",
            "outline-none transition-[border-color,box-shadow,background-color] duration-(--dur-2) ease-out-quart",
            "hover:bg-surface-2/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
            "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/30",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <ListTodo aria-hidden className="size-4 shrink-0 text-fg-subtle" />
          {value ? (
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
              <span className="shrink-0 font-mono text-xs text-fg-muted">{value.key}</span>
              <span className="truncate">{value.title}</span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-fg-muted">{projectId ? NO_TASK : "Choose a project first"}</span>
          )}
          <ChevronDown aria-hidden className="size-4 shrink-0 text-fg-subtle" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 p-0">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search aria-hidden className="size-4 shrink-0 text-fg-subtle" />
          <input
            type="text"
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={options.length > 0 ? optionId(safeActive) : undefined}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks or PRX-12…"
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle sm:text-sm"
          />
          {loading ? <Spinner size="sm" className="text-fg-subtle" /> : null}
        </div>
        {error ? (
          <p role="alert" className="px-3 py-6 text-center text-sm text-danger">
            {error}
          </p>
        ) : options.length === 0 ? (
          <p role="status" className="px-3 py-6 text-center text-sm text-fg-muted [overflow-wrap:anywhere]">
            {loading ? "Searching…" : `No open task matches “${query.trim()}”.`}
          </p>
        ) : (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-64 overflow-y-auto overscroll-contain p-1.5"
          >
            {options.map((option, index) => {
              const selected = (option.task?.id ?? null) === (value?.id ?? null);
              return (
                <li
                  key={option.task?.id ?? "__none"}
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  onPointerMove={() => {
                    if (activeIndex !== index) setActiveIndex(index);
                  }}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => pick(option)}
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-sm text-fg",
                    "transition-colors duration-(--dur-1) pointer-coarse:py-2.5",
                    index === safeActive && "bg-surface-2",
                  )}
                >
                  {option.task ? (
                    <>
                      <span className="w-16 shrink-0 font-mono text-xs text-fg-muted">{option.task.key}</span>
                      <span className="min-w-0 flex-1 truncate">{option.task.title}</span>
                    </>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-fg-muted">{NO_TASK}</span>
                  )}
                  <Check aria-hidden className={cn("size-4 shrink-0 text-accent", selected ? "opacity-100" : "opacity-0")} />
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
