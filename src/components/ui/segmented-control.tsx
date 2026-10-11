"use client";

import { useRef, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
  className?: string;
  size?: "sm" | "md";
  /** Hide labels visually (keeps them for screen readers); useful for icon-only toggles. */
  iconOnly?: boolean;
}

/** A radiogroup rendered as connected buttons; arrow keys move the selection. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  size = "md",
  iconOnly = false,
}: SegmentedControlProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const hasMatch = options.some((option) => option.value === value);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = options.length;
    let next = index;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % count;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + count) % count;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(options[next].value);
    buttons.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5", className)}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={iconOnly ? option.label : undefined}
            title={iconOnly ? option.label : undefined}
            // Roving tabindex: only the selected option (or the first) is in the tab order.
            tabIndex={active || (!hasMatch && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors duration-150 outline-none",
              "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface-2",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[13px]",
              iconOnly && (size === "sm" ? "w-6 px-0" : "w-7 px-0"),
              active ? "bg-surface text-fg shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg",
            )}
          >
            {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
            {iconOnly ? null : option.label}
          </button>
        );
      })}
    </div>
  );
}
