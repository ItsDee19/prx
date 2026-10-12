"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, Plus, Search, Tag } from "lucide-react";
import { toast } from "sonner";
import { createLabelAction } from "@/actions/labels";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { LABEL_COLORS, LABEL_GROUP_CONFIG, LABEL_GROUP_ORDER } from "@/lib/constants";
import type { LabelGroup, LabelSummary } from "@/lib/types";
import { cn, colorFromString } from "@/lib/utils";
import { LabelChips } from "./label-chips";

export interface LabelPickerProps {
  labels: LabelSummary[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Offer `Create "x"` when the search has no exact match (default true). */
  allowCreate?: boolean;
  /** Single element that opens the picker (rendered with `asChild`). Defaults to a chip button. */
  trigger?: ReactNode;
  align?: "start" | "center" | "end";
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
}

type Option = { kind: "label"; label: LabelSummary } | { kind: "create"; name: string };

const NAME_MAX = 40;

function normalise(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Searchable multi-select for labels, grouped Tech stack / Domain / General.
 * Arrow keys move through the options, Enter toggles, Escape closes; typing a
 * new name offers `Create "x"` (createLabelAction) with its colour preview.
 */
export function LabelPicker({
  labels,
  value,
  onChange,
  allowCreate = true,
  trigger,
  align = "start",
  "aria-label": ariaLabel = "Labels",
  disabled = false,
  className,
}: LabelPickerProps) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [created, setCreated] = useState<LabelSummary[]>([]);
  const [creating, startCreate] = useTransition();
  const optionRefs = useRef(new Map<number, HTMLElement>());

  // Labels created here are not in the parent's list until it reloads.
  const all = useMemo(() => {
    const seen = new Set(labels.map((label) => label.id));
    return [...labels, ...created.filter((label) => !seen.has(label.id))];
  }, [labels, created]);

  const selected = useMemo(() => {
    const byId = new Map(all.map((label) => [label.id, label]));
    return value.map((id) => byId.get(id)).filter((label): label is LabelSummary => Boolean(label));
  }, [all, value]);

  const term = normalise(query).toLowerCase();
  const groups = useMemo(() => {
    const matches = term ? all.filter((label) => label.name.toLowerCase().includes(term)) : all;
    return LABEL_GROUP_ORDER.map((group) => ({
      group,
      labels: matches
        .filter((label) => label.label_group === group)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    })).filter((entry) => entry.labels.length > 0);
  }, [all, term]);

  const createName = normalise(query).slice(0, NAME_MAX);
  const canCreate =
    allowCreate && createName.length > 0 && !all.some((label) => label.name.toLowerCase() === createName.toLowerCase());

  const options: Option[] = useMemo(() => {
    const flat: Option[] = groups.flatMap((entry) => entry.labels.map((label) => ({ kind: "label" as const, label })));
    if (canCreate) flat.push({ kind: "create", name: createName });
    return flat;
  }, [groups, canCreate, createName]);

  const activeIndex = options.length === 0 ? -1 : Math.min(active, options.length - 1);

  useEffect(() => {
    if (activeIndex >= 0) optionRefs.current.get(activeIndex)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setActive(0);
    }
  }

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((existing) => existing !== id) : [...value, id]);
  }

  function create(name: string) {
    if (creating) return;
    startCreate(async () => {
      const result = await createLabelAction({ name, label_group: "general" });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const label: LabelSummary = {
        id: result.data.id,
        name: result.data.name,
        color: result.data.color,
        label_group: result.data.label_group,
      };
      setCreated((current) => [...current.filter((item) => item.id !== label.id), label]);
      if (!value.includes(label.id)) onChange([...value, label.id]);
      setQuery("");
      setActive(0);
    });
  }

  function choose(option: Option | undefined) {
    if (!option) return;
    if (option.kind === "label") toggle(option.label.id);
    else create(option.name);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (options.length === 0) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((activeIndex + 1) % options.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((activeIndex - 1 + options.length) % options.length);
        break;
      case "Home":
        if (!query) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (!query) {
          event.preventDefault();
          setActive(options.length - 1);
        }
        break;
      case "Enter":
        event.preventDefault();
        choose(options[activeIndex]);
        break;
      default:
        break;
    }
  }

  const optionId = (index: number) => `${uid}-option-${index}`;
  let index = -1;

  const defaultTrigger = (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      aria-label={selected.length > 0 ? `${ariaLabel}: ${selected.map((label) => label.name).join(", ")}` : ariaLabel}
      className={cn("h-auto min-h-9 max-w-full justify-start py-1.5 font-normal", className)}
    >
      {selected.length > 0 ? (
        <LabelChips labels={selected} max={3} />
      ) : (
        <>
          <Tag aria-hidden className="text-fg-subtle" />
          <span className="text-fg-muted">Add labels</span>
        </>
      )}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? defaultTrigger}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(20rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search aria-hidden className="size-4 shrink-0 text-fg-subtle" />
          <input
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-label={`Search ${ariaLabel.toLowerCase()}`}
            value={query}
            maxLength={NAME_MAX}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={allowCreate ? "Search or create a label" : "Search labels"}
            autoComplete="off"
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle sm:text-sm"
          />
        </div>

        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          aria-label={ariaLabel}
          className="max-h-72 overflow-y-auto overscroll-contain p-1"
        >
          {groups.map((entry) => {
            const headingId = `${uid}-group-${entry.group}`;
            return (
              <div key={entry.group} role="group" aria-labelledby={headingId} className="py-0.5">
                <p id={headingId} className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                  {LABEL_GROUP_CONFIG[entry.group as LabelGroup].label}
                </p>
                {entry.labels.map((label) => {
                  index += 1;
                  const current = index;
                  const isSelected = value.includes(label.id);
                  return (
                    <div
                      key={label.id}
                      id={optionId(current)}
                      ref={(node) => {
                        if (node) optionRefs.current.set(current, node);
                        else optionRefs.current.delete(current);
                      }}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActive(current)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => toggle(label.id)}
                      className={cn(
                        "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg transition-colors duration-100 pointer-coarse:py-2.5",
                        current === activeIndex && "bg-surface-2",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-100",
                          isSelected ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface",
                        )}
                      >
                        {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                      <span className="min-w-0 flex-1 truncate">{label.name}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {canCreate
            ? (() => {
                index += 1;
                const current = index;
                return (
                  <div
                    id={optionId(current)}
                    ref={(node) => {
                      if (node) optionRefs.current.set(current, node);
                      else optionRefs.current.delete(current);
                    }}
                    role="option"
                    aria-selected={false}
                    aria-disabled={creating || undefined}
                    onMouseEnter={() => setActive(current)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => create(createName)}
                    className={cn(
                      "mt-0.5 flex cursor-pointer select-none items-center gap-2 rounded-md border-t border-border px-2 py-2 text-sm text-fg transition-colors duration-100 pointer-coarse:py-2.5",
                      current === activeIndex && "bg-surface-2",
                    )}
                  >
                    {creating ? <Spinner size="sm" /> : <Plus aria-hidden className="size-4 shrink-0 text-fg-muted" />}
                    <span className="min-w-0 flex-1 truncate">
                      Create <span className="font-medium">&ldquo;{createName}&rdquo;</span>
                    </span>
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorFromString(createName, LABEL_COLORS) }}
                    />
                  </div>
                );
              })()
            : null}

          {options.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-fg-muted">
              {term ? "No labels match." : "No labels yet."}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-fg-muted">
          <span className="tabular-nums" aria-live="polite">
            {value.length === 0 ? "None selected" : `${value.length} selected`}
          </span>
          {value.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="rounded px-1.5 py-0.5 font-medium text-fg-muted outline-none transition-colors duration-150 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2"
            >
              Clear
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
