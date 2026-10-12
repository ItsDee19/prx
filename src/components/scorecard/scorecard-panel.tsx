"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  CircleDashed,
  CircleX,
  Ellipsis,
  Lock,
  Pencil,
  Plus,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { deleteMetricAction, lockMetricsAction, reorderMetricsAction } from "@/actions/scorecard";
import { MAX_SUCCESS_METRICS } from "@/lib/constants";
import type { ServiceLine, SuccessMetricWithStatus } from "@/lib/types";
import { cn, formatDate, formatMetricValue } from "@/lib/utils";
import { InViewRing } from "./in-view-ring";
import { MetricDialog } from "./metric-dialog";
import { MetricSparkline } from "./metric-sparkline";
import { directionShort, metricTone, targetLabel } from "./metric-values";

export interface ScorecardPanelProps {
  projectId: string;
  metrics: SuccessMetricWithStatus[];
  serviceLine: ServiceLine | null;
  /** Any active member may edit the scorecard. */
  canEdit: boolean;
}

/** Met / not met / not measured, always with an icon and a label (§23.6). */
export function MetricStatusBadge({ isMet, className }: { isMet: boolean | null; className?: string }) {
  if (isMet === true) {
    return (
      <Badge tone="green" className={cn("gap-1", className)}>
        <CircleCheck className="size-3" aria-hidden />
        Met
      </Badge>
    );
  }
  if (isMet === false) {
    return (
      <Badge tone="amber" className={cn("gap-1", className)}>
        <CircleX className="size-3" aria-hidden />
        Not met
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" className={cn("gap-1", className)}>
      <CircleDashed className="size-3" aria-hidden />
      Not measured
    </Badge>
  );
}

function moveId(ids: string[], id: string, delta: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * The overview "Success scorecard" card body (client): one row per metric
 * with a progress ring toward the target (drawn when first scrolled into
 * view), baseline / current / target, direction, met status and the eval-run
 * sparkline; Move up / Move down, edit and delete per row; add, and lock the
 * scorecard before the Pilot.
 */
export function ScorecardPanel({ projectId, metrics, serviceLine, canEdit }: ScorecardPanelProps) {
  const router = useRouter();
  // Optimistic order while a reorder is in flight; reset whenever fresh props arrive.
  const [order, setOrder] = useState<string[] | null>(null);
  const [seen, setSeen] = useState(metrics);
  if (seen !== metrics) {
    setSeen(metrics);
    setOrder(null);
  }
  const [dialog, setDialog] = useState<{ mode: "new" } | { mode: "edit"; id: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const byId = new Map(metrics.map((metric) => [metric.id, metric]));
  const ordered = (order ?? metrics.map((metric) => metric.id))
    .map((id) => byId.get(id))
    .filter((metric): metric is SuccessMetricWithStatus => metric !== undefined);
  const metCount = metrics.filter((metric) => metric.is_met === true).length;
  const lockedAt = metrics.map((metric) => metric.locked_at).filter((value): value is string => value !== null).sort()[0] ?? null;
  const unlockedCount = metrics.filter((metric) => metric.locked_at === null).length;
  const atCap = metrics.length >= MAX_SUCCESS_METRICS;
  const editing = dialog?.mode === "edit" ? (byId.get(dialog.id) ?? null) : null;
  const toDelete = deleteId ? (byId.get(deleteId) ?? null) : null;

  async function move(metric: SuccessMetricWithStatus, delta: -1 | 1) {
    const current = ordered.map((item) => item.id);
    const next = moveId(current, metric.id, delta);
    if (next === current) return;
    setOrder(next);
    setAnnouncement(`Moved ${metric.name} ${delta < 0 ? "up" : "down"}, now ${next.indexOf(metric.id) + 1} of ${next.length}.`);
    try {
      const result = await reorderMetricsAction(projectId, next);
      if (!result.ok) {
        setOrder(current);
        toast.error(result.error);
        return;
      }
      router.refresh();
    } catch {
      setOrder(current);
      toast.error("Could not reorder the metrics. Please try again.");
    }
  }

  async function lock() {
    const result = await lockMetricsAction(projectId);
    if (!result.ok) {
      toast.error(result.error);
      throw new Error(result.error);
    }
    toast.success(
      result.data > 0 ? `Scorecard locked (${result.data} ${result.data === 1 ? "metric" : "metrics"}).` : "The scorecard was already locked.",
    );
    router.refresh();
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const result = await deleteMetricAction(toDelete.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Removed ${toDelete.name}`);
      setDeleteId(null);
      router.refresh();
    } catch {
      toast.error("Could not delete the metric. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  const addButton = canEdit ? (
    <Tooltip content={atCap ? `A scorecard holds at most ${MAX_SUCCESS_METRICS} metrics.` : undefined}>
      <span className="inline-flex">
        <Button
          size="sm"
          variant={metrics.length === 0 ? "primary" : "outline"}
          disabled={atCap}
          aria-haspopup="dialog"
          onClick={() => setDialog({ mode: "new" })}
        >
          <Plus aria-hidden />
          Add metric
        </Button>
      </span>
    </Tooltip>
  ) : null;

  return (
    <Card>
      <CardHeader className="flex-wrap items-center gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <CardTitle id="project-scorecard-heading">Success scorecard</CardTitle>
          {metrics.length > 0 ? (
            <span className="text-xs tabular-nums text-fg-muted">
              {metCount} of {metrics.length} met
            </span>
          ) : null}
          {lockedAt && unlockedCount === 0 ? (
            <Badge tone="blue" className="gap-1 self-center">
              <Lock className="size-3" aria-hidden />
              Locked
            </Badge>
          ) : null}
        </div>
        {canEdit && metrics.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {unlockedCount > 0 ? (
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="ghost">
                    <Lock aria-hidden />
                    Lock
                  </Button>
                }
                title="Lock the scorecard?"
                description="Lock baselines and targets before the Pilot starts. Afterwards, changing a baseline, target or direction needs a reason, and every change is logged."
                confirmLabel={`Lock ${unlockedCount} ${unlockedCount === 1 ? "metric" : "metrics"}`}
                onConfirm={lock}
              />
            ) : null}
            {addButton}
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        {metrics.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No success metrics yet"
            description="Agree one to three measurable metrics with the client in week one, then lock them before the Pilot."
            action={addButton ?? undefined}
          />
        ) : (
          <Stagger as="ul" className="-mx-2 divide-y divide-border">
            {ordered.map((metric, index) => (
              <StaggerItem key={metric.id} as="li">
                <MetricRow
                  metric={metric}
                  first={index === 0}
                  last={index === ordered.length - 1}
                  canEdit={canEdit}
                  onEdit={() => setDialog({ mode: "edit", id: metric.id })}
                  onMove={(delta) => void move(metric, delta)}
                  onDelete={() => setDeleteId(metric.id)}
                />
              </StaggerItem>
            ))}
          </Stagger>
        )}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </CardContent>

      {lockedAt ? (
        <CardFooter className="text-xs text-fg-muted">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          <span>
            Locked on {formatDate(lockedAt)}. Goal changes need a reason and are logged.
            {unlockedCount > 0 ? ` ${unlockedCount} newer ${unlockedCount === 1 ? "metric is" : "metrics are"} not locked yet.` : ""}
          </span>
        </CardFooter>
      ) : null}

      {canEdit ? (
        <MetricDialog
          projectId={projectId}
          metric={editing}
          serviceLine={serviceLine}
          existingNames={metrics.map((metric) => metric.name)}
          open={dialog !== null && (dialog.mode === "new" || editing !== null)}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        />
      ) : null}

      <Dialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteId(null);
        }}
      >
        {toDelete ? (
          <DialogContent
            size="sm"
            title={`Delete ${toDelete.name}?`}
            description={
              toDelete.locked_at
                ? "This metric is locked. Deleting it removes it from the scorecard and from future gate snapshots."
                : "It is removed from the scorecard. Past gate decisions keep their snapshot."
            }
          >
            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button variant="outline" disabled={deleting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button variant="danger" loading={deleting} onClick={() => void confirmDelete()}>
                Delete metric
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}

interface MetricRowProps {
  metric: SuccessMetricWithStatus;
  first: boolean;
  last: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}

function MetricRow({ metric, first, last, canEdit, onEdit, onMove, onDelete }: MetricRowProps) {
  const progress = metric.progress_pct;
  const DirectionIcon = metric.direction === "higher" ? TrendingUp : TrendingDown;

  return (
    <div className="group flex items-start gap-3 rounded-xl px-2 py-3.5 transition-colors duration-(--dur-2) hover:bg-surface-2/60 sm:gap-4">
      <div className="relative mt-0.5">
        <InViewRing
          value={progress ?? 0}
          size={48}
          strokeWidth={4}
          tone={metricTone(metric.is_met)}
          label={
            progress === null
              ? `${metric.name}: no progress yet`
              : `${metric.name}: ${progress}% of the way from baseline to target`
          }
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums text-fg"
        >
          {progress === null ? <span className="text-fg-subtle">&mdash;</span> : `${progress}%`}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 text-sm font-medium leading-5 text-fg [overflow-wrap:anywhere]">{metric.name}</p>
          <MetricStatusBadge isMet={metric.is_met} />
          {metric.locked_at ? (
            <Tooltip content={`Locked ${formatDate(metric.locked_at)}`}>
              <span className="inline-flex text-fg-subtle">
                <Lock className="size-3.5" aria-hidden />
                <span className="sr-only">Locked</span>
              </span>
            </Tooltip>
          ) : null}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <DirectionIcon
              className={cn("size-3.5", metric.direction === "higher" ? "text-success" : "text-accent")}
              aria-hidden
            />
            {directionShort(metric.direction)}
          </span>
          <span aria-hidden>·</span>
          <span className="whitespace-nowrap tabular-nums">Target {targetLabel(metric)}</span>
        </p>

        <div className="mt-2.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs sm:gap-x-6">
            <div className="min-w-0">
              <dt className="text-fg-subtle">Baseline</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-fg-muted">{formatMetricValue(metric.baseline, metric.unit)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-fg-subtle">Current</dt>
              <dd
                className={cn(
                  "mt-0.5 font-semibold tabular-nums",
                  metric.is_met === true ? "text-success" : metric.is_met === false ? "text-warning" : "text-fg",
                )}
              >
                {formatMetricValue(metric.current, metric.unit)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-fg-subtle">Target</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-fg">{formatMetricValue(metric.target, metric.unit)}</dd>
            </div>
          </dl>
          {metric.trend.length > 0 ? (
            <MetricSparkline points={metric.trend} target={metric.target} direction={metric.direction} unit={metric.unit} />
          ) : null}
        </div>
        {metric.notes ? (
          <p className="mt-2 line-clamp-2 max-w-[70ch] text-xs text-fg-muted [overflow-wrap:anywhere]">{metric.notes}</p>
        ) : null}
      </div>

      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1 size-8 opacity-100 sm:opacity-60 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 pointer-coarse:opacity-100"
              aria-label={`Actions for ${metric.name}`}
            >
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil aria-hidden />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}>
              <ArrowUp aria-hidden />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}>
              <ArrowDown aria-hidden />
              Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Trash2 aria-hidden />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
