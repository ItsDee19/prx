import { Flame, TriangleAlert } from "lucide-react";
import type { ProgressRingTone } from "@/components/ui/progress-ring";
import { Badge } from "@/components/ui/badge";
import { formatHours } from "@/lib/duration";
import type { BudgetBurn } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

/** Burn colour bands: accent below 75%, then warning (75), orange (90) and danger (100). */
export function burnFillClass(burnPct: number): string {
  if (burnPct >= 100) return "bg-danger";
  if (burnPct >= 90) return "bg-orange-500 dark:bg-orange-400";
  if (burnPct >= 75) return "bg-warning";
  return "bg-accent";
}

/** ProgressRing tone for a burn percentage (same bands; 90 and 100 share danger). */
export function burnRingTone(burnPct: number): ProgressRingTone {
  if (burnPct >= 90) return "danger";
  if (burnPct >= 75) return "warning";
  return "accent";
}

/** One-line label for the burn level (colour never carries meaning alone). */
export function burnStatusLabel(burn: BudgetBurn): string | null {
  if (burn.burn_pct >= 100) return "Over budget";
  if (burn.threshold === 90) return "90% used";
  if (burn.threshold === 75) return "75% used";
  return null;
}

export interface BudgetBurnBarProps {
  burn: BudgetBurn;
  className?: string;
}

/**
 * Hours burn against the budget: a scaleX fill coloured at 75 / 90 / 100%,
 * 75 and 90% ticks, an elapsed-time marker and a "Running hot" badge when the
 * burn is ahead of the calendar. Server-safe; the fill grows in on first
 * paint and is static with reduced motion.
 */
export function BudgetBurnBar({ burn, className }: BudgetBurnBarProps) {
  const fill = Math.min(100, Math.max(0, burn.burn_pct));
  const elapsed = burn.elapsed_pct === null ? null : Math.min(100, Math.max(0, burn.elapsed_pct));
  const status = burnStatusLabel(burn);
  const periodLabel =
    burn.period === "monthly"
      ? `This month${burn.period_start ? ` (from ${formatDate(burn.period_start, { month: "short", day: "numeric" })})` : ""}`
      : "Whole engagement";
  const valueText = `${burn.burn_pct}% of the ${burn.budget_hours}-hour budget used${
    elapsed !== null ? `, ${elapsed}% of the time elapsed` : ""
  }${burn.running_hot ? ", running hot" : ""}`;

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-fg-muted">
          <span className="font-mono text-base font-semibold tabular-nums text-fg">{formatHours(burn.logged_minutes)}</span>
          <span className="tabular-nums"> of {burn.budget_hours}h</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {burn.running_hot ? (
            <Badge tone="amber">
              <Flame aria-hidden className="size-3" />
              Running hot
            </Badge>
          ) : null}
          {status ? (
            <Badge tone={burn.burn_pct >= 90 ? "red" : "amber"}>
              {burn.burn_pct >= 100 ? <TriangleAlert aria-hidden className="size-3" /> : null}
              {status}
            </Badge>
          ) : null}
          <span className="font-mono text-sm font-semibold tabular-nums text-fg">{burn.burn_pct}%</span>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label="Hours budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fill}
        aria-valuetext={valueText}
        className="relative h-2.5 rounded-full bg-surface-2 ring-1 ring-inset ring-border"
      >
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div
            className={cn("progress-fill h-full w-full rounded-full", burnFillClass(burn.burn_pct))}
            style={{ transform: `scaleX(${fill / 100})` }}
          />
        </div>
        {[75, 90].map((tick) => (
          <span
            key={tick}
            aria-hidden
            className="absolute inset-y-0 w-px bg-bg/70"
            style={{ left: `${tick}%` }}
          />
        ))}
        {elapsed !== null ? (
          <span
            aria-hidden
            title={`${elapsed}% of the time elapsed`}
            className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-fg shadow-[0_0_0_2px_var(--surface)]"
            style={{ left: `${elapsed}%` }}
          />
        ) : null}
      </div>

      <p className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs text-fg-muted">
        <span>{periodLabel}</span>
        <span className="tabular-nums">
          {elapsed !== null ? `${elapsed}% of the time elapsed` : "Add start and due dates to compare with time elapsed"}
        </span>
      </p>
    </div>
  );
}
