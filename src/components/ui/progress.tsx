import { clampProgress, cn } from "@/lib/utils";

export interface ProgressBarProps {
  value: number;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
  /** Accessible name; defaults to "Progress". */
  label?: string;
}

/**
 * Linear progress (`role="progressbar"`). The brand-gradient fill is scaled
 * on the x axis (never resized), grows in on first paint and glides on
 * changes; solid success green at 100%. Static with reduced motion.
 */
export function ProgressBar({
  value,
  size = "md",
  showLabel = false,
  className,
  label = "Progress",
}: ProgressBarProps) {
  const pct = clampProgress(value);
  const done = pct >= 100;
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${pct}%`}
        className={cn(
          "relative w-full min-w-0 flex-1 overflow-hidden rounded-full bg-fg/[0.08]",
          size === "sm" ? "h-1.5" : "h-2",
        )}
      >
        <div
          className={cn("progress-fill absolute inset-0 rounded-full", done ? "bg-success" : "bg-grad-progress")}
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
      {showLabel ? (
        <span
          className={cn("shrink-0 tabular-nums text-fg-muted", size === "sm" ? "text-[11px]" : "text-xs")}
        >
          {pct}%
        </span>
      ) : null}
    </div>
  );
}
