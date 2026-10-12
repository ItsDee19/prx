"use client";

import { useRef, type KeyboardEvent } from "react";
import { Check, Plus } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { SERVICE_LINE_CONFIG } from "@/lib/constants";
import { computeTemplateSchedule, type TemplateOption } from "@/lib/templates";
import { cn, formatDate } from "@/lib/utils";
import { isDateOnly } from "@/lib/workspace-time";
import { PhaseStrip } from "./phase-strip";

export interface TemplatePickerProps {
  options: TemplateOption[];
  /** Selected template key; null = Blank project. */
  value: string | null;
  onChange: (key: string | null) => void;
  /** "YYYY-MM-DD": each card shows when its plan would end from this date. */
  startDate: string;
  /** Custom templates are still loading (a placeholder card shows under "Your templates"). */
  loadingCustom?: boolean;
  /** Focus the selected card on mount (first step of a dialog). */
  autoFocus?: boolean;
  "aria-label"?: string;
  className?: string;
}

const BLANK = "__blank__";

const CARD =
  "group relative flex min-w-0 flex-col gap-2.5 rounded-2xl border bg-surface p-3.5 text-left outline-none " +
  "transition-[border-color,box-shadow,background-color,scale] duration-(--dur-2) ease-out-quart active:scale-[0.99] motion-reduce:active:scale-100 " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface pointer-coarse:p-4";

function SelectedMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-(--dur-2)",
        selected ? "border-accent bg-accent text-accent-fg" : "border-input-border bg-surface",
      )}
    >
      {selected ? <Check key="on" className="size-3 animate-pop-badge" strokeWidth={3} /> : null}
    </span>
  );
}

function endsOn(option: TemplateOption, startDate: string): string | null {
  if (!isDateOnly(startDate) || option.payload.milestones.length === 0) return null;
  return computeTemplateSchedule(option.payload, startDate).build_end_date;
}

/**
 * "Start from": one radio card per template (icon, name, description, a
 * proportional phase strip with phase chips, duration and service lines, and
 * when the plan would end from `startDate`), plus Blank project (null).
 * Blank project comes first, then the built-ins, then "Your templates". Arrow keys move the selection
 * (roving focus); the selected card lifts with an accent ring and a check
 * that pops in (a fade with reduced motion).
 */
export function TemplatePicker({
  options,
  value,
  onChange,
  startDate,
  loadingCustom = false,
  autoFocus = false,
  "aria-label": ariaLabel = "Start from",
  className,
}: TemplatePickerProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const builtin = options.filter((option) => option.source === "builtin");
  const custom = options.filter((option) => option.source === "custom");
  const order = [BLANK, ...builtin.map((option) => option.key), ...custom.map((option) => option.key)];
  const selectedId = value ?? BLANK;
  const focusId = order.includes(selectedId) ? selectedId : order[0];

  function select(id: string) {
    onChange(id === BLANK ? null : id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = order.indexOf(selectedId);
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % order.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + order.length) % order.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = order.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const id = order[next];
    select(id);
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-option-id="${CSS.escape(id)}"]`)?.focus();
  }

  function card(option: TemplateOption) {
    const selected = option.key === selectedId;
    const end = endsOn(option, startDate);
    const lines = option.service_lines.slice(0, 2);
    const more = option.service_lines.length - lines.length;
    return (
      <button
        key={option.key}
        type="button"
        role="radio"
        aria-checked={selected}
        data-option-id={option.key}
        tabIndex={option.key === focusId ? 0 : -1}
        autoFocus={autoFocus && option.key === focusId}
        onClick={() => select(option.key)}
        className={cn(
          CARD,
          selected
            ? "border-accent shadow-glow ring-1 ring-accent"
            : "border-border shadow-card hover:border-border-strong hover:bg-surface-2/40",
        )}
      >
        <span className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-(--dur-2)",
              selected ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent-soft-fg",
            )}
          >
            <Icon name={option.icon} className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-fg">{option.name}</span>
              {option.source === "custom" ? (
                <span className="shrink-0 rounded-full bg-accent-2/12 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent-2">
                  Custom
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-xs tabular-nums text-fg-muted">
              {option.duration_label}
              {end ? ` · ends ${formatDate(end)}` : ""}
            </span>
          </span>
          <SelectedMark selected={selected} />
        </span>
        {option.description ? (
          <span className="line-clamp-2 text-xs text-fg-muted [overflow-wrap:anywhere]">{option.description}</span>
        ) : null}
        {option.payload.milestones.length > 0 ? <PhaseStrip payload={option.payload} showChips maxChips={4} /> : null}
        {lines.length > 0 ? (
          <span className="mt-auto flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-fg-muted">
            {lines.map((line) => (
              <span key={line} className="inline-flex min-w-0 items-center gap-1">
                <Icon name={SERVICE_LINE_CONFIG[line].icon} className="size-3" />
                <span className="truncate">{SERVICE_LINE_CONFIG[line].label}</span>
              </span>
            ))}
            {more > 0 ? <span className="tabular-nums">+{more} more</span> : null}
          </span>
        ) : null}
      </button>
    );
  }

  const blankSelected = selectedId === BLANK;

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn("min-w-0 space-y-4", className)}
    >
      <button
        type="button"
        role="radio"
        aria-checked={blankSelected}
        data-option-id={BLANK}
        tabIndex={focusId === BLANK ? 0 : -1}
        autoFocus={autoFocus && focusId === BLANK}
        onClick={() => select(BLANK)}
        className={cn(
          CARD,
          "w-full flex-row items-center border-dashed py-3",
          blankSelected
            ? "border-accent shadow-glow ring-1 ring-accent"
            : "border-border-strong hover:border-fg-subtle hover:bg-surface-2/40",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-(--dur-2)",
            blankSelected ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-muted",
          )}
        >
          <Plus className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">Blank project</span>
          <span className="mt-0.5 block text-xs text-fg-muted">Start with an empty plan. Add phases and tasks as you go.</span>
        </span>
        <SelectedMark selected={blankSelected} />
      </button>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{builtin.map(card)}</div>

      {custom.length > 0 || loadingCustom ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Your templates</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {custom.map(card)}
            {loadingCustom && custom.length === 0 ? (
              <div aria-hidden className="space-y-3 rounded-2xl border border-border bg-surface p-3.5">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="size-9 rounded-xl" />
                  <Skeleton className="h-4 w-32 rounded-md" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
