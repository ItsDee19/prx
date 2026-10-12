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
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 rounded-full bg-fg/[0.06] p-0.5 shadow-[inset_0_1px_1px_rgb(0_0_0/0.04)]",
        className,
      )}
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
              // min-w-0 + the truncating label let the control shrink inside a narrow phone column.
              "relative inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full font-medium transition-control outline-none active:scale-[0.97]",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface-2",
              // Touch screens get 32px-tall segments plus an invisible strip 4px above and below
              // (vertical only), so every segment's hit area is 40px tall (§23.6) without the
              // container growing or neighbouring hit areas overlapping.
              size === "sm" ? "h-6 px-2.5 text-xs pointer-coarse:h-8" : "h-7 px-3 text-[13px] pointer-coarse:h-8",
              "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1",
              // Icon-only segments on touch are also 40px wide, so each target is 40x40.
              iconOnly &&
                cn(size === "sm" ? "w-6 shrink-0 px-0" : "w-7 shrink-0 px-0", "pointer-coarse:w-10"),
              active
                ? "bg-raised text-fg shadow-[0_1px_2px_rgb(0_0_0/0.1),0_0_0_0.5px_rgb(0_0_0/0.05)] ring-1 ring-border"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
            {iconOnly ? null : <span className="truncate">{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
