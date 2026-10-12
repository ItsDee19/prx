import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvalImprovementRow } from "@/lib/data/reports";
import { cn, formatMetricValue } from "@/lib/utils";

export interface EvalImprovementsCardProps {
  rows: EvalImprovementRow[];
  className?: string;
}

function deltaText(row: EvalImprovementRow): string {
  const sign = row.delta > 0 ? "+" : row.delta < 0 ? "-" : "";
  return `${sign}${formatMetricValue(Math.abs(row.delta), row.unit)}`;
}

/** Champion vs baseline for every metric the two runs share (direction-aware: lower can be better). */
export function EvalImprovementsCard({ rows, className }: EvalImprovementsCardProps) {
  const improved = rows.filter((row) => row.improved).length;
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Eval improvements</CardTitle>
          <CardDescription>
            {rows.length === 0
              ? "Champion run against the baseline, per metric."
              : `${improved} of ${rows.length} champion metrics beat their baseline.`}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">
            No champion runs yet. Promote an eval run to see its gain here.
          </p>
        ) : (
          <div className="max-h-96 overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-max border-collapse text-sm">
              <caption className="sr-only">Eval improvements: champion against baseline</caption>
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-fg-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Project</th>
                  <th scope="col" className="px-3 py-2 font-medium">Metric</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Baseline</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Champion</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const flat = row.delta === 0;
                  const DeltaIcon = flat ? Minus : row.delta > 0 ? ArrowUpRight : ArrowDownRight;
                  return (
                    <tr key={`${row.project.id}:${row.metric}`} className="border-t border-border">
                      <th scope="row" className="max-w-56 truncate px-3 py-2 text-left font-medium">
                        <Link
                          href={`/projects/${row.project.id}?tab=evals`}
                          className="text-fg hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {row.project.name}
                        </Link>
                      </th>
                      <td className="px-3 py-2 text-fg">
                        {row.metric}
                        <span className="ml-1.5 text-xs text-fg-muted">{row.direction === "lower" ? "lower is better" : "higher is better"}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-fg-muted" title={row.baseline_label}>
                        {formatMetricValue(row.baseline, row.unit)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-fg" title={row.champion_label}>
                        {formatMetricValue(row.champion, row.unit)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 font-medium tabular-nums",
                            flat ? "text-fg-muted" : row.improved ? "text-success" : "text-danger",
                          )}
                        >
                          <DeltaIcon aria-hidden className="size-3.5" />
                          {deltaText(row)}
                          <span className="sr-only">{flat ? "(no change)" : row.improved ? "(improved)" : "(regressed)"}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
