"use client";

import { useRef, type KeyboardEvent } from "react";
import { RagDot } from "@/components/ui/rag-dot";
import { RAG_CONFIG, RAG_ORDER } from "@/lib/constants";
import type { RagHealth } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface RagPickerProps {
  value: RagHealth | null;
  onChange: (value: RagHealth | null) => void;
  /** Accessible name of the radiogroup. */
  "aria-label": string;
  /** Adds a "Not set" option (dimension RAGs are optional). */
  allowNone?: boolean;
  size?: "sm" | "md";
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

type Option = { value: RagHealth | null; label: string };

const SELECTED: Record<RagHealth, string> = {
  green: "border-success/50 bg-success/10 text-fg",
  amber: "border-warning/60 bg-warning/12 text-fg",
  red: "border-danger/50 bg-danger/10 text-fg",
};

/**
 * Health radiogroup: each option shows the RAG dot (shape + colour) and its
 * label, so colour never carries the meaning alone. Arrow keys move the
 * selection (roving tabindex), like SegmentedControl.
 */
export function RagPicker({
  value,
  onChange,
  "aria-label": ariaLabel,
  allowNone = false,
  size = "md",
  invalid = false,
  disabled = false,
  id,
  className,
}: RagPickerProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const options: Option[] = [
    ...RAG_ORDER.map((health) => ({ value: health, label: RAG_CONFIG[health].label })),
    ...(allowNone ? [{ value: null, label: "Not set" }] : []),
  ];
  const selectedIndex = options.findIndex((option) => option.value === value);
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = options.length;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % count;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else return;
    event.preventDefault();
    onChange(options[next].value);
    buttons.current[next]?.focus();
  }

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value ?? "none"}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === focusIndex ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border font-medium",
              "transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out-quart)] active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              "disabled:pointer-events-none disabled:opacity-50",
              size === "sm" ? "h-7 px-2.5 text-xs pointer-coarse:h-9" : "h-9 px-3.5 text-sm pointer-coarse:h-10",
              selected
                ? option.value
                  ? SELECTED[option.value]
                  : "border-border-strong bg-surface-2 text-fg"
                : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
              invalid && !selected && "border-danger/50",
            )}
          >
            {option.value ? (
              <RagDot health={option.value} showLabel size={size} />
            ) : (
              <>
                <span aria-hidden className="size-2 rounded-full border border-dashed border-fg-subtle" />
                <span>{option.label}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
