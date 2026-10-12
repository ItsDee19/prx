"use client";

import { useRef, type KeyboardEvent } from "react";
import { RISK_SCALE } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface ScalePickerProps {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Names of 1-5 ("Rare" ... "Almost certain"). */
  labels: readonly string[];
  "aria-labelledby": string;
  id?: string;
}

/**
 * 1-5 radiogroup with a "Not set" choice. The selected step's name shows
 * below, so the number is never the only cue. Arrow keys move the selection.
 */
export function ScalePicker({ value, onChange, labels, "aria-labelledby": labelledBy, id }: ScalePickerProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const options: (number | null)[] = [...RISK_SCALE, null];
  const selectedIndex = options.indexOf(value);
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
    onChange(options[next]);
    buttons.current[next]?.focus();
  }

  return (
    <div className="space-y-1">
      <div id={id} role="radiogroup" aria-labelledby={labelledBy} className="flex gap-1">
        {options.map((option, index) => {
          const selected = option === value;
          const name = option === null ? "Not set" : `${option}, ${labels[option - 1]}`;
          return (
            <button
              key={option ?? "none"}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={name}
              title={name}
              tabIndex={index === focusIndex ? 0 : -1}
              onClick={() => onChange(option)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "flex h-9 min-w-9 flex-1 items-center justify-center rounded-[10px] border text-sm font-semibold tabular-nums pointer-coarse:h-10",
                "transition-[background-color,border-color,color,transform] duration-100 active:scale-[0.96]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                selected
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-input-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
                option === null && "flex-[1.4] text-xs font-medium",
              )}
            >
              {option === null ? "—" : option}
            </button>
          );
        })}
      </div>
      <p aria-hidden className="text-xs text-fg-muted">
        {value === null ? "Not set" : labels[value - 1]}
      </p>
    </div>
  );
}
