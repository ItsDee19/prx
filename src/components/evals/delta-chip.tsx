import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { METRIC_DIRECTION_CONFIG } from "@/lib/constants";
import type { MetricDirection } from "@/lib/types";
import { cn } from "@/lib/utils";
import { deltaTone, formatDelta } from "./eval-utils";

export interface DeltaChipProps {
  delta: number;
  unit: string;
  direction: MetricDirection;
  /** What the delta is measured against (screen-reader text), e.g. "vs champion". */
  context?: string;
  className?: string;
}

/**
 * Signed change of a metric with an arrow: green when it moved the good way
 * for the metric's direction, red otherwise. The arrow and the sign carry the
 * meaning too (never colour alone). Server-safe.
 */
export function DeltaChip({ delta, unit, direction, context, className }: DeltaChipProps) {
  const tone = deltaTone(delta, direction);
  const Arrow = tone === "same" ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const verdict = tone === "better" ? "better" : tone === "worse" ? "worse" : "no change";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-medium tabular-nums",
        tone === "better" ? "text-success" : tone === "worse" ? "text-danger" : "text-fg-muted",
        className,
      )}
      title={`${formatDelta(delta, unit)} ${context ?? ""} (${METRIC_DIRECTION_CONFIG[direction].label.toLowerCase()})`.replace(/\s+/g, " ")}
    >
      <Arrow aria-hidden className="size-3.5" />
      {formatDelta(delta, unit)}
      <span className="sr-only">
        {context ? ` ${context}` : ""}, {verdict}
      </span>
    </span>
  );
}
