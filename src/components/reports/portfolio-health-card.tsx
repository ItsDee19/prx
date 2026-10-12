import Link from "next/link";
import { ClientChip } from "@/components/clients/client-chip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RagDot } from "@/components/ui/rag-dot";
import { RAG_CONFIG } from "@/lib/constants";
import type { PortfolioHealthReport, RagHealth } from "@/lib/types";
import { cn, isUpdateDue, pluralize } from "@/lib/utils";

export interface PortfolioHealthCardProps {
  report: PortfolioHealthReport;
  today: string;
  cadenceDays: number;
  timeZone: string;
  /** At-risk rows shown before "and N more". */
  limit?: number;
  className?: string;
}

const SEGMENTS: { key: RagHealth | "none"; className: string }[] = [
  { key: "red", className: "bg-(--viz-critical)" },
  { key: "amber", className: "bg-(--viz-warning)" },
  { key: "green", className: "bg-(--viz-good)" },
  { key: "none", className: "bg-(--viz-muted)" },
];

function segmentLabel(key: RagHealth | "none"): string {
  return key === "none" ? "No update" : RAG_CONFIG[key].label;
}

/**
 * Portfolio RAG counts as one segmented bar (2px gaps; every segment also
 * named in the legend with its count) plus the at-risk list: off track, at
 * risk, then engagements whose weekly update is overdue.
 */
export function PortfolioHealthCard({ report, today, cadenceDays, timeZone, limit = 8, className }: PortfolioHealthCardProps) {
  const total = report.counts.green + report.counts.amber + report.counts.red + report.counts.none;
  const shown = report.at_risk.slice(0, limit);
  const more = report.at_risk.length - shown.length;
  const summary = SEGMENTS.map((segment) => `${segmentLabel(segment.key)} ${report.counts[segment.key]}`).join(", ");

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Portfolio health</CardTitle>
          <CardDescription>Open top-level engagements by their latest weekly update.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        {total === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">
            No open engagements yet.
          </p>
        ) : (
          <>
            <div>
              <div role="img" aria-label={`Health of ${pluralize(total, "open engagement")}: ${summary}.`} className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
                {SEGMENTS.filter((segment) => report.counts[segment.key] > 0).map((segment) => (
                  <span
                    key={segment.key}
                    className={cn("progress-fill h-full first:rounded-l-full last:rounded-r-full", segment.className)}
                    style={{ flexGrow: report.counts[segment.key] }}
                  />
                ))}
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                {SEGMENTS.map((segment) => (
                  <li key={segment.key} className="flex min-w-0 items-center justify-between gap-2 text-sm">
                    <RagDot health={segment.key === "none" ? null : segment.key} showLabel />
                    <span className="font-semibold tabular-nums text-fg">{report.counts[segment.key]}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0">
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">Needs attention</h4>
              {shown.length === 0 ? (
                <p className="text-sm text-fg-muted">Every open engagement is on track and up to date.</p>
              ) : (
                <ul role="list" className="divide-y divide-border">
                  {shown.map((project) => {
                    const stale = isUpdateDue(project, today, cadenceDays, timeZone);
                    return (
                      <li key={project.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-2">
                        <RagDot health={project.health} />
                        {project.client ? <ClientChip client={project.client} /> : null}
                        <Link
                          href={`/projects/${project.id}?tab=updates`}
                          className="min-w-0 flex-1 truncate text-sm font-medium text-fg hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {project.name}
                        </Link>
                        {stale ? <Badge tone="amber">Update due</Badge> : null}
                        <span className="text-xs text-fg-muted">{project.owner?.name ?? "No owner"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {more > 0 ? (
                <p className="mt-2 text-xs text-fg-muted">
                  And {pluralize(more, "more engagement")}.{" "}
                  <Link href="/projects?health=red" className="font-medium text-accent hover:underline">
                    See off-track projects
                  </Link>
                </p>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
