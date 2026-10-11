import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_CONFIG, STATUS_ORDER } from "@/lib/constants";
import type { ProjectStats } from "@/lib/types";
import { cn, percent, pluralize } from "@/lib/utils";

export interface StatusOverviewProps {
  stats: ProjectStats;
  className?: string;
}

/** Stacked bar of projects per status with a legend of label, count and share. */
export function StatusOverview({ stats, className }: StatusOverviewProps) {
  const total = stats.total;
  const completed = stats.by_status.completed;
  const segments = STATUS_ORDER.map((status) => ({
    status,
    config: STATUS_CONFIG[status],
    count: stats.by_status[status],
    pct: percent(stats.by_status[status], total),
  }));
  const summary = segments
    .filter((segment) => segment.count > 0)
    .map((segment) => `${segment.config.label}: ${segment.count}`)
    .join(", ");

  return (
    <Card className={className}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Status overview</CardTitle>
          <CardDescription>
            {total === 0
              ? "No top-level projects yet"
              : `${completed} of ${pluralize(total, "project")} completed`}
          </CardDescription>
        </div>
        {total > 0 ? (
          <span className="shrink-0 text-sm font-medium tabular-nums text-fg-muted">
            {percent(completed, total)}%
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        <div
          role="img"
          aria-label={total === 0 ? "No projects" : `Projects by status. ${summary}`}
          className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2"
        >
          {segments
            .filter((segment) => segment.count > 0)
            .map((segment) => (
              <div
                key={segment.status}
                className={cn("h-full min-w-1 rounded-sm transition-[flex-grow] duration-300", segment.config.dotClass)}
                style={{ flexGrow: segment.count }}
                title={`${segment.config.label}: ${segment.count}`}
              />
            ))}
        </div>

        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {segments.map((segment) => (
            <li key={segment.status} className="flex min-w-0 items-center gap-2 text-sm">
              <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", segment.config.dotClass)} />
              <span className="min-w-0 truncate text-fg-muted">{segment.config.label}</span>
              <span className="ml-auto shrink-0 whitespace-nowrap tabular-nums text-fg">
                {segment.count}
                <span className="ml-1 text-xs text-fg-subtle">{segment.pct}%</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
