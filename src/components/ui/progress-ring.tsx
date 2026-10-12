import type { CSSProperties } from "react";
import { clampProgress, cn } from "@/lib/utils";

export type ProgressRingTone = "accent" | "success" | "warning" | "danger";

export interface ProgressRingProps {
  /** 0-100 (clamped and rounded). */
  value: number;
  /** Diameter in px (default 40). */
  size?: number;
  /** Stroke width in px (default scales with the size). */
  strokeWidth?: number;
  tone?: ProgressRingTone;
  /** Print the percentage in the centre. */
  showValue?: boolean;
  /** Accessible name, e.g. "Pilot progress". */
  label: string;
  className?: string;
}

const TONE_STROKE: Record<ProgressRingTone, string> = {
  accent: "stroke-accent",
  success: "stroke-success",
  warning: "stroke-warning",
  danger: "stroke-danger",
};

/**
 * Circular progress (`role="progressbar"`). The arc draws in from empty over
 * 600ms on first paint (stroke-dashoffset only) and glides when the value
 * changes; with reduced motion it renders at its value. Server-safe.
 */
export function ProgressRing({
  value,
  size = 40,
  strokeWidth,
  tone = "accent",
  showValue = false,
  label,
  className,
}: ProgressRingProps) {
  const pct = clampProgress(value);
  const stroke = strokeWidth ?? Math.max(2.5, Math.min(6, Math.round(size / 10)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const fontSize = Math.max(9, Math.round(size * 0.26));

  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${pct}%`}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 overflow-visible"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        {pct > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn("progress-ring-arc", TONE_STROKE[tone])}
            style={{ "--ring-circumference": `${circumference}px` } as CSSProperties}
          />
        ) : null}
      </svg>
      {showValue ? (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums leading-none text-fg"
          style={{ fontSize }}
        >
          {pct}
          <span className="text-[0.7em] font-medium text-fg-muted">%</span>
        </span>
      ) : null}
    </span>
  );
}
