import { clampProgress, cn } from "@/lib/utils";

export interface ProgressBarProps {
  value: number;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
  /** Accessible name; defaults to "Progress". */
  label?: string;
}

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
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${pct}%`}
        className={cn(
          "w-full flex-1 overflow-hidden rounded-full bg-border/70",
          size === "sm" ? "h-1.5" : "h-2",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-out",
            done ? "bg-success" : "bg-accent",
          )}
          style={{ width: `${pct}%` }}
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
