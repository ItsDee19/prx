"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, Search, UserRound } from "lucide-react";
import type { UserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./avatar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface UserPickerProps {
  users: UserSummary[];
  /** Selected user id, or null for nobody. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Offer an "Unassigned" option that selects null. */
  allowUnassigned?: boolean;
  /** Trigger text when nobody is selected. */
  placeholder?: string;
  /** Custom trigger: a single focusable element (rendered with `asChild`). */
  trigger?: ReactNode;
  align?: "start" | "center" | "end";
  disabled?: boolean;
  "aria-label": string;
}

interface PickerOption {
  id: string | null;
  user: UserSummary | null;
}

const UNASSIGNED_LABEL = "Unassigned";

function matches(user: UserSummary, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    user.name.toLowerCase().includes(needle) ||
    user.email.toLowerCase().includes(needle) ||
    (user.job_title?.toLowerCase().includes(needle) ?? false)
  );
}

/**
 * Searchable person picker in a popover. Focus stays in the search field
 * (combobox pattern): arrow keys move the highlight, Enter picks, Escape
 * closes. Avatars and job titles help tell people apart.
 */
export function UserPicker({
  users,
  value,
  onChange,
  allowUnassigned = false,
  placeholder = "Select a person",
  trigger,
  align = "start",
  disabled = false,
  "aria-label": ariaLabel,
}: UserPickerProps) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = value ? (users.find((user) => user.id === value) ?? null) : null;

  const options = useMemo<PickerOption[]>(() => {
    const filtered = users.filter((user) => matches(user, query.trim()));
    const showUnassigned = allowUnassigned && (!query.trim() || UNASSIGNED_LABEL.toLowerCase().includes(query.trim().toLowerCase()));
    return [
      ...(showUnassigned ? [{ id: null, user: null }] : []),
      ...filtered.map((user) => ({ id: user.id, user })),
    ];
  }, [users, query, allowUnassigned]);

  const optionId = (index: number) => `${baseId}-option-${index}`;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      const initialOptions: PickerOption[] = [
        ...(allowUnassigned ? [{ id: null, user: null }] : []),
        ...users.map((user) => ({ id: user.id, user })),
      ];
      const index = initialOptions.findIndex((option) => option.id === value);
      setActiveIndex(index >= 0 ? index : 0);
    }
  }

  function highlight(index: number) {
    setActiveIndex(index);
    const element = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(index))}`);
    element?.scrollIntoView({ block: "nearest" });
  }

  function pick(option: PickerOption) {
    onChange(option.id);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (options.length === 0) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        highlight((activeIndex + 1) % options.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        highlight((activeIndex - 1 + options.length) % options.length);
        break;
      case "PageDown":
        event.preventDefault();
        highlight(Math.min(options.length - 1, activeIndex + 5));
        break;
      case "PageUp":
        event.preventDefault();
        highlight(Math.max(0, activeIndex - 5));
        break;
      case "Enter": {
        event.preventDefault();
        const option = options[Math.min(activeIndex, options.length - 1)];
        if (option) pick(option);
        break;
      }
      default:
        break;
    }
  }

  const safeActive = Math.min(activeIndex, Math.max(0, options.length - 1));

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <button
            type="button"
            aria-label={selected ? `${ariaLabel}: ${selected.name}` : ariaLabel}
            className={cn(
              "inline-flex h-9 w-full min-w-0 items-center gap-2 rounded-[10px] border border-input-border bg-surface pl-2 pr-2.5 text-left text-base text-fg sm:text-sm",
              "outline-none transition-[border-color,box-shadow,background-color] duration-(--dur-2) ease-out-quart",
              "hover:bg-surface-2/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
              "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/30",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {selected ? (
              <UserAvatar user={selected} size="xs" />
            ) : (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-input-border text-fg-subtle">
                <UserRound aria-hidden className="size-3" />
              </span>
            )}
            <span className={cn("min-w-0 flex-1 truncate", !selected && "text-fg-muted")}>
              {selected ? selected.name : allowUnassigned && value === null ? UNASSIGNED_LABEL : placeholder}
            </span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-fg-subtle" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-0">
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
            placeholder="Search people…"
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle sm:text-sm"
          />
        </div>
        {options.length === 0 ? (
          <p role="status" className="px-3 py-6 text-center text-sm text-fg-muted [overflow-wrap:anywhere]">
            No one matches &ldquo;{query.trim()}&rdquo;.
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
              const isSelected = option.id === value;
              const isActive = index === safeActive;
              return (
                <li
                  key={option.id ?? "__unassigned"}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  onPointerMove={() => {
                    if (activeIndex !== index) setActiveIndex(index);
                  }}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => pick(option)}
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-sm text-fg",
                    "transition-colors duration-(--dur-1) pointer-coarse:py-2.5",
                    isActive && "bg-surface-2",
                  )}
                >
                  {option.user ? (
                    <UserAvatar user={option.user} size="sm" />
                  ) : (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-input-border text-fg-subtle">
                      <UserRound aria-hidden className="size-3.5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium leading-5">
                      {option.user ? option.user.name : UNASSIGNED_LABEL}
                    </span>
                    {option.user?.job_title ? (
                      <span className="block truncate text-xs leading-4 text-fg-muted">{option.user.job_title}</span>
                    ) : null}
                  </span>
                  <Check
                    aria-hidden
                    className={cn("size-4 shrink-0 text-accent", isSelected ? "opacity-100" : "opacity-0")}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
