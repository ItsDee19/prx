import { CircleCheck, CircleDashed, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { RagHealth } from "@/lib/types";
import { cn, riskScore, riskSeverity } from "@/lib/utils";
import { SEVERITY_LABELS } from "./risk-utils";

const STYLE: Record<RagHealth, { icon: LucideIcon; className: string; iconClass: string }> = {
  red: {
    icon: OctagonAlert,
    className: "bg-danger/10 text-fg ring-danger/35",
    iconClass: "text-danger",
  },
  amber: {
    icon: TriangleAlert,
    className: "bg-warning/12 text-fg ring-warning/40",
    iconClass: "text-warning",
  },
  green: {
    icon: CircleCheck,
    className: "bg-success/10 text-fg ring-success/30",
    iconClass: "text-success",
  },
};

export interface RiskScoreBadgeProps {
  likelihood: number | null;
  impact: number | null;
  /** Hide the severity word (keeps it for screen readers). */
  compact?: boolean;
  className?: string;
}

/**
 * Likelihood x impact score with its severity (>= 15 high, >= 8 medium, else
 * low). Each severity has its own icon and word, so colour is never the only cue.
 */
export function RiskScoreBadge({ likelihood, impact, compact = false, className }: RiskScoreBadgeProps) {
  const score = riskScore(likelihood, impact);
  const severity = riskSeverity(score);
  if (score === null || severity === null) {
    return (
      <span
        className={cn(
          "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium text-fg-muted ring-1 ring-inset ring-border",
          className,
        )}
        title="Likelihood or impact not set"
      >
        <CircleDashed aria-hidden className="size-3.5 text-fg-subtle" />
        <span className={cn(compact && "sr-only")}>Not scored</span>
      </span>
    );
  }
  const style = STYLE[severity];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium tabular-nums ring-1 ring-inset",
        style.className,
        className,
      )}
      title={`Likelihood ${likelihood} × impact ${impact} = ${score}`}
    >
      <Icon aria-hidden className={cn("size-3.5", style.iconClass)} />
      <span className="font-semibold">{score}</span>
      <span className={cn(compact && "sr-only")}>{SEVERITY_LABELS[severity]}</span>
    </span>
  );
}
