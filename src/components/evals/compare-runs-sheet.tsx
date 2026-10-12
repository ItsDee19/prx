"use client";

import { useId, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { EVAL_CHANGE_TYPE_CONFIG, EVAL_VERDICT_CONFIG } from "@/lib/constants";
import type { EvalRunWithMeta } from "@/lib/types";
import { formatDate, formatMetricValue } from "@/lib/utils";
import { dateInTimeZone } from "@/lib/workspace-time";
import { DeltaChip } from "./delta-chip";
import { metricValue, type MetricColumn } from "./eval-utils";

export interface CompareRunsSheetProps {
  runs: EvalRunWithMeta[];
  columns: MetricColumn[];
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselected runs (A = reference, B = compared). */
  initialA: string | null;
  initialB: string | null;
}

function RunSummary({ run, timeZone }: { run: EvalRunWithMeta; timeZone: string }) {
  const verdict = EVAL_VERDICT_CONFIG[run.verdict];
  const change = EVAL_CHANGE_TYPE_CONFIG[run.change_type];
  const details = [run.model_name, run.prompt_version && `prompt ${run.prompt_version}`, run.dataset_version]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="min-w-0 space-y-1.5 text-xs text-fg-muted">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={verdict.tone}>
          <Icon name={verdict.icon} className="size-3" />
          {verdict.label}
        </Badge>
        <Badge tone={change.tone}>{change.label}</Badge>
      </div>
      <p className="tabular-nums">{formatDate(dateInTimeZone(run.created_at, timeZone))}</p>
      {details ? <p className="[overflow-wrap:anywhere]">{details}</p> : null}
      {run.external_url ? (
        <a
          href={run.external_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open trace
          <ExternalLink aria-hidden className="size-3" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}
    </div>
  );
}

/** Side-by-side comparison of two runs: every metric, and B minus A coloured by direction. */
export function CompareRunsSheet({ runs, columns, timeZone, open, onOpenChange, initialA, initialB }: CompareRunsSheetProps) {
  const id = useId();
  const [aId, setAId] = useState<string | null>(initialA);
  const [bId, setBId] = useState<string | null>(initialB);

  const openKey = open ? `open:${initialA ?? ""}:${initialB ?? ""}` : "closed";
  const [shownKey, setShownKey] = useState(openKey);
  if (shownKey !== openKey) {
    setShownKey(openKey);
    if (open) {
      setAId(initialA);
      setBId(initialB);
    }
  }

  const a = runs.find((run) => run.id === aId) ?? null;
  const b = runs.find((run) => run.id === bId) ?? null;
  const shown = columns.filter(
    (column) => (a && metricValue(a.metrics, column.key) !== null) || (b && metricValue(b.metrics, column.key) !== null),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" title="Compare runs" description="Pick two runs; the difference is B minus A.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(
            [
              { key: "a", label: "Run A", value: aId, set: setAId, run: a },
              { key: "b", label: "Run B", value: bId, set: setBId, run: b },
            ] as const
          ).map((side) => (
            <div key={side.key} className="min-w-0 space-y-2 rounded-xl border border-border bg-surface p-3">
              <label htmlFor={`${id}-${side.key}`} className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                {side.label}
              </label>
              <NativeSelect
                id={`${id}-${side.key}`}
                value={side.value ?? ""}
                onChange={(event) => side.set(event.target.value || null)}
              >
                <option value="">Choose a run</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.label}
                    {run.verdict === "champion" ? " (champion)" : ""}
                  </option>
                ))}
              </NativeSelect>
              {side.run ? <RunSummary run={side.run} timeZone={timeZone} /> : null}
            </div>
          ))}
        </div>

        {a && b ? (
          shown.length > 0 ? (
            <div className="mt-5 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[22rem] text-sm">
                <caption className="sr-only">
                  Metrics of {a.label} (A) and {b.label} (B), with B minus A.
                </caption>
                <thead className="bg-surface-2/60 text-xs text-fg-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Metric</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">A</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">B</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">B − A</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((column) => {
                    const va = metricValue(a.metrics, column.key);
                    const vb = metricValue(b.metrics, column.key);
                    return (
                      <tr key={column.key} className="border-t border-border">
                        <th scope="row" className="px-3 py-2 text-left font-medium text-fg [overflow-wrap:anywhere]">
                          {column.name}
                        </th>
                        <td className="px-3 py-2 text-right tabular-nums text-fg">{formatMetricValue(va, column.unit)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg">{formatMetricValue(vb, column.unit)}</td>
                        <td className="px-3 py-2 text-right">
                          {va !== null && vb !== null ? (
                            <DeltaChip delta={vb - va} unit={column.unit} direction={column.direction} />
                          ) : (
                            <span className="text-fg-subtle">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-5 text-sm text-fg-muted">These runs have no metrics to compare.</p>
          )
        ) : (
          <p className="mt-5 text-sm text-fg-muted">Choose two runs to see their metrics side by side.</p>
        )}

        {a?.notes || b?.notes ? (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[a, b].map((run, index) =>
              run?.notes ? (
                <div key={run.id} className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Notes {index === 0 ? "A" : "B"}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted [overflow-wrap:anywhere]">{run.notes}</p>
                </div>
              ) : (
                <div key={index} />
              ),
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
