import Link from "next/link";
import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BUDGET_PERIOD_CONFIG } from "@/lib/constants";
import { formatHours } from "@/lib/duration";
import type { BurnRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface BurnListProps {
  rows: BurnRow[];
  className?: string;
}

/** Fill colour by threshold (75 / 90 / 100), always paired with the % text. */
function fillClass(burn: number): string {
  if (burn >= 100) return "bg-(--viz-critical)";
  if (burn >= 90) return "bg-(--viz-warning)";
  if (burn >= 75) return "bg-[color-mix(in_oklch,var(--viz-warning)_55%,var(--viz-1))]";
  return "bg-(--viz-1)";
}

/**
 * Budget burn bullets: hours used against the budget (scaleX fill, capped
 * at the track; the number shows the real %), a marker at the elapsed share
 * of the period and a "Running hot" badge when burn is ahead of time.
 */
export function BurnList({ rows, className }: BurnListProps) {
  return (
    <ul role="list" className={cn("divide-y divide-border", className)}>
      {rows.map(({ project, burn }) => {
        const fill = Math.min(burn.burn_pct, 100) / 100;
        const used = formatHours(burn.logged_minutes);
        const label = `${project.name}: ${used} of ${burn.budget_hours}h (${burn.burn_pct}%)${
          burn.elapsed_pct !== null ? `, ${burn.elapsed_pct}% of the period elapsed` : ""
        }${burn.running_hot ? ", running hot" : ""}`;
        return (
          <li key={project.id} className="py-3 first:pt-0 last:pb-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`/projects/${project.id}?tab=time`}
                className="min-w-0 max-w-full truncate text-sm font-medium text-fg hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {project.client_code ? <span className="mr-1.5 font-mono text-xs text-fg-muted">{project.client_code}</span> : null}
                {project.name}
              </Link>
              {burn.running_hot ? (
                <Badge tone="orange">
                  <Flame aria-hidden className="size-3" />
                  Running hot
                </Badge>
              ) : null}
              <span className="ml-auto text-xs text-fg-muted tabular-nums">
                {used} / {burn.budget_hours}h · {BUDGET_PERIOD_CONFIG[burn.period].label}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div
                role="meter"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={Math.max(100, burn.burn_pct)}
                aria-valuenow={burn.burn_pct}
                aria-valuetext={`${burn.burn_pct}%`}
                className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-fg/[0.08]"
              >
                <div className={cn("progress-fill absolute inset-0 rounded-full", fillClass(burn.burn_pct))} style={{ transform: `scaleX(${fill})` }} />
                {burn.elapsed_pct !== null ? (
                  <span
                    aria-hidden
                    title={`${burn.elapsed_pct}% of the period elapsed`}
                    className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-fg"
                    style={{ left: `${Math.min(Math.max(burn.elapsed_pct, 0), 100)}%` }}
                  />
                ) : null}
              </div>
              <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-fg">{burn.burn_pct}%</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
