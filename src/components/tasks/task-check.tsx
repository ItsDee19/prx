"use client";

import type { MouseEvent } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { MOTION } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface TaskCheckProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Mark “Add CI” done". */
  label: string;
  shape?: "square" | "circle";
  disabled?: boolean;
  className?: string;
}

/**
 * Completion checkbox with the signature check: the fill pops in and the
 * check mark stroke draws over 150ms (instant when motion is reduced).
 */
export function TaskCheck({ checked, onCheckedChange, label, shape = "square", disabled, className }: TaskCheckProps) {
  const reduce = useReducedMotionConfig() === true;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        onCheckedChange(!checked);
      }}
      className={cn(
        "relative inline-flex size-[18px] shrink-0 items-center justify-center border outline-none",
        "transition-[border-color,transform] duration-(--dur-1) active:scale-90",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "pointer-coarse:after:absolute pointer-coarse:after:-inset-3",
        shape === "circle" ? "rounded-full" : "rounded-[5px]",
        checked ? "border-success" : "border-input-border hover:border-fg-subtle",
        className,
      )}
    >
      <m.span
        aria-hidden
        className={cn("absolute inset-0 bg-success", shape === "circle" ? "rounded-full" : "rounded-[4px]")}
        initial={false}
        animate={{ opacity: checked ? 1 : 0, scale: checked ? 1 : 0.5 }}
        transition={reduce ? { duration: 0 } : { duration: MOTION.duration.press, ease: MOTION.ease.outQuart }}
      />
      <svg aria-hidden viewBox="0 0 16 16" className="relative size-3 text-surface">
        <m.path
          d="M3.5 8.5 6.5 11.5 12.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={
            reduce
              ? { duration: 0 }
              : { pathLength: { duration: MOTION.duration.hover, ease: MOTION.ease.outQuart }, opacity: { duration: 0.05 } }
          }
        />
      </svg>
    </button>
  );
}
