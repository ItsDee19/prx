"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { promoteChampionAction } from "@/actions/evals";
import type { EvalRunWithMeta } from "@/lib/types";
import { formatMetricValue } from "@/lib/utils";
import { metricKey, metricValue, scorecardMatches, type ScorecardMetricRef } from "./eval-utils";

export interface PromoteChampionDialogProps {
  run: EvalRunWithMeta | null;
  champion: EvalRunWithMeta | null;
  scorecard: ScorecardMetricRef[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirms "Promote to champion": names the champion it replaces (archived),
 * and offers to push the run's values into the scorecard's current values
 * for metrics with the same name, previewing each change.
 */
export function PromoteChampionDialog({ run, champion, scorecard, open, onOpenChange }: PromoteChampionDialogProps) {
  const router = useRouter();
  const id = useId();
  const matches = run ? scorecardMatches(run, scorecard) : [];
  const [updateScorecard, setUpdateScorecard] = useState(true);
  const [pending, setPending] = useState(false);

  // Default the checkbox on each open (on when there is something to update).
  const openKey = open ? `open:${run?.id ?? ""}` : "closed";
  const [shownKey, setShownKey] = useState(openKey);
  if (shownKey !== openKey) {
    setShownKey(openKey);
    if (open) setUpdateScorecard(matches.length > 0);
  }

  async function promote() {
    if (!run) return;
    setPending(true);
    try {
      const result = await promoteChampionAction(run.id, { update_scorecard: updateScorecard && matches.length > 0 });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const updated = result.data.metrics_updated;
      toast.success(
        updated > 0
          ? `"${run.label}" is the champion. ${updated} scorecard ${updated === 1 ? "metric" : "metrics"} updated.`
          : `"${run.label}" is the champion.`,
      );
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("Could not promote the run. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const replacing = champion && run && champion.id !== run.id ? champion : null;

  return (
    <Dialog open={open} onOpenChange={(next) => (!pending ? onOpenChange(next) : undefined)}>
      <DialogContent
        size="md"
        title={run ? `Promote "${run.label}" to champion?` : "Promote to champion"}
        description={
          replacing
            ? `"${replacing.label}" is archived and stays in the log. Deltas are then measured against this run.`
            : "Deltas in the log are then measured against this run."
        }
      >
        {matches.length > 0 ? (
          <div className="space-y-3">
            <label htmlFor={`${id}-scorecard`} className="flex cursor-pointer items-start gap-2.5 rounded-[10px] py-1 pointer-coarse:py-2">
              <Checkbox
                id={`${id}-scorecard`}
                checked={updateScorecard}
                onChange={(event) => setUpdateScorecard(event.target.checked)}
                className="mt-0.5"
                aria-describedby={`${id}-scorecard-hint`}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">Update scorecard current values</span>
                <span id={`${id}-scorecard-hint`} className="block text-xs text-fg-muted">
                  Copies this run&apos;s value into {matches.length === 1 ? "the matching metric" : `${matches.length} matching metrics`}.
                </span>
              </span>
            </label>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface/60 text-sm">
              {matches.map((metric) => {
                const next = run ? metricValue(run.metrics, metricKey(metric.name)) : null;
                return (
                  <li key={metric.name} className="flex min-w-0 items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-fg" title={metric.name}>
                      {metric.name}
                    </span>
                    <span className="inline-flex items-center gap-1.5 tabular-nums text-fg-muted">
                      <span className="sr-only">from</span>
                      {formatMetricValue(metric.current, metric.unit)}
                      <ArrowRight aria-hidden className="size-3.5" />
                      <span className="sr-only">to</span>
                      <span className={updateScorecard ? "font-medium text-fg" : undefined}>
                        {formatMetricValue(next, metric.unit)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">
            None of this run&apos;s metrics match a scorecard metric, so the scorecard stays as it is.
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button loading={pending} onClick={promote} disabled={!run}>
            <Star aria-hidden />
            Promote to champion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
