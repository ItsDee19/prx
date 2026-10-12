import { ProgressRing } from "@/components/ui/progress-ring";
import { formatHours } from "@/lib/duration";
import { cn, percent } from "@/lib/utils";

export interface CapacityMeterProps {
  /** Minutes logged this week (Monday-based, workspace timezone). */
  minutes: number;
  /** Weekly capacity in hours. */
  capacityHours: number;
  /** Person's name for the accessible label. */
  name: string;
  compact?: boolean;
  className?: string;
}

/** This week's logged hours against weekly capacity: ring + "12.5h / 40h" + percentage. Server-safe. */
export function CapacityMeter({ minutes, capacityHours, name, compact = false, className }: CapacityMeterProps) {
  const capacityMinutes = capacityHours * 60;
  const pct = percent(minutes, capacityMinutes);
  const over = capacityMinutes > 0 && minutes > capacityMinutes;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <ProgressRing
        value={pct}
        size={compact ? 24 : 28}
        tone={over ? "warning" : pct >= 75 ? "success" : "accent"}
        label={`${name}: ${pct}% of weekly capacity logged this week`}
      />
      <span className="min-w-0 leading-tight">
        <span className="block whitespace-nowrap font-mono text-sm tabular-nums text-fg">
          {formatHours(minutes)}
          <span className="text-fg-muted"> / {capacityHours}h</span>
        </span>
        <span className={cn("block text-xs tabular-nums", over ? "font-medium text-warning" : "text-fg-muted")}>
          {capacityMinutes === 0 ? "No capacity set" : over ? `${pct}%, over capacity` : `${pct}%`}
        </span>
      </span>
    </span>
  );
}
