import { Tooltip } from "@/components/ui/tooltip";
import type { LabelSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface LabelChipsProps {
  labels: LabelSummary[];
  /** Chips shown before collapsing the rest into "+N" (default 3). */
  max?: number;
  size?: "sm" | "md";
  className?: string;
}

const SIZES = {
  sm: "h-5 gap-1 px-1.5 text-[11px]",
  md: "h-6 gap-1.5 px-2 text-xs",
} as const;

/** One label: a colour dot plus the name, in a pill. */
export function LabelChip({ label, size = "sm", className }: { label: LabelSummary; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-40 shrink-0 items-center rounded-full bg-surface font-medium leading-none text-fg-muted ring-1 ring-inset ring-border",
        SIZES[size],
        className,
      )}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
      <span className="truncate">{label.name}</span>
    </span>
  );
}

/** A project's or task's labels: the first `max` as chips, the rest as "+N" with a tooltip. */
export function LabelChips({ labels, max = 3, size = "sm", className }: LabelChipsProps) {
  if (labels.length === 0) return null;
  const visible = labels.slice(0, Math.max(0, max));
  const hidden = labels.slice(visible.length);
  return (
    <span role="list" aria-label="Labels" className={cn("inline-flex min-w-0 flex-wrap items-center gap-1", className)}>
      {visible.map((label) => (
        <span role="listitem" key={label.id} className="min-w-0">
          <LabelChip label={label} size={size} />
        </span>
      ))}
      {hidden.length > 0 ? (
        <span role="listitem">
          <Tooltip content={hidden.map((label) => label.name).join(", ")}>
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full bg-surface-2 font-medium tabular-nums leading-none text-fg-muted",
                SIZES[size],
              )}
            >
              +{hidden.length}
              <span className="sr-only"> more: {hidden.map((label) => label.name).join(", ")}</span>
            </span>
          </Tooltip>
        </span>
      ) : null}
    </span>
  );
}
