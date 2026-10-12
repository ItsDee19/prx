"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CircleCheck,
  CircleX,
  Database,
  FlaskConical,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { DueDate } from "@/components/projects/due-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { NumberTicker } from "@/components/ui/number-ticker";
import { ProgressRing } from "@/components/ui/progress-ring";
import { deleteBatchAction, updateBatchAction } from "@/actions/batches";
import { AGREEMENT_METRIC_CONFIG, BATCH_STATUS_CONFIG, BATCH_STATUS_ORDER, BATCH_UNIT_TYPE_CONFIG } from "@/lib/constants";
import type { BatchStatus, DataBatch, DataBatchSummary, MilestoneRef, ProgressMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AcceptedPerWeekChart } from "./accepted-per-week-chart";
import { BatchDialog } from "./batch-dialog";
import {
  agreementLabel,
  agreementResult,
  batchTitle,
  formatAgreement,
  formatFraction,
  formatUnits,
  goldResult,
  type QualityResult,
} from "./batch-utils";

export interface BatchesPanelProps {
  projectId: string;
  projectName: string;
  batches: DataBatch[];
  summary: DataBatchSummary;
  milestones: MilestoneRef[];
  progressMode: ProgressMode;
  /** projects.progress (0-100). */
  progress: number;
  /** Workspace today. */
  today: string;
  /** Admin or project owner (deleteBatchAction refuses anyone else). */
  canDelete: boolean;
}

type DialogState =
  | { kind: "none" }
  | { kind: "create"; calibration: boolean }
  | { kind: "edit"; batchId: string }
  | { kind: "delete"; batchId: string };

function StatusBadge({ status }: { status: BatchStatus }) {
  const config = BATCH_STATUS_CONFIG[status];
  return (
    <Badge tone={config.tone} dot dotClassName={config.dotClass}>
      {config.label}
    </Badge>
  );
}

function QualityChip({ result, label, value }: { result: QualityResult; label: string; value: string }) {
  if (value === "—") return null;
  const Glyph = result === "pass" ? CircleCheck : result === "fail" ? CircleX : null;
  return (
    <Badge tone={result === "pass" ? "green" : result === "fail" ? "red" : "neutral"} className="tabular-nums">
      {Glyph ? <Glyph aria-hidden className="size-3" /> : null}
      <span>
        {label} {value}
      </span>
      {result ? <span className="sr-only">{result === "pass" ? ", meets the threshold" : ", below the threshold"}</span> : null}
    </Badge>
  );
}

/** Delivered (soft) and accepted (solid) as stacked bars against the planned units. */
function UnitsBar({ batch }: { batch: DataBatch }) {
  const scale = Math.max(batch.units_target, batch.units_delivered, 1);
  const delivered = Math.min(1, batch.units_delivered / scale);
  const accepted = Math.min(1, batch.units_accepted / scale);
  const unit = BATCH_UNIT_TYPE_CONFIG[batch.unit_type];
  return (
    <div className="min-w-0">
      <div
        role="img"
        aria-label={`${formatUnits(batch.units_accepted)} accepted and ${formatUnits(batch.units_delivered)} delivered of ${formatUnits(batch.units_target)} planned ${unit.plural}`}
        className="relative h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <span
          className="progress-fill absolute inset-y-0 left-0 w-full rounded-full bg-accent/30"
          style={{ transform: `scaleX(${delivered})` }}
        />
        <span
          className="progress-fill absolute inset-y-0 left-0 w-full rounded-full bg-success"
          style={{ transform: `scaleX(${accepted})` }}
        />
      </div>
      <p className="mt-1.5 text-xs tabular-nums text-fg-muted">
        <span className="font-medium text-fg">{formatUnits(batch.units_accepted)}</span> accepted ·{" "}
        {formatUnits(batch.units_delivered)} delivered · {formatUnits(batch.units_target)} {unit.plural}
      </p>
    </div>
  );
}

function SummaryTile({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <StaggerItem className="min-w-0 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card">
      <p className="text-xs font-medium text-fg-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-8 tracking-tight text-fg tabular-nums">{children}</p>
      {hint ? <div className="mt-1 text-xs text-fg-muted">{hint}</div> : null}
    </StaggerItem>
  );
}

/**
 * Client body of the Batches tab (Avlys Data): summary strip, calibration
 * gate banner, the batch table (cards on phones) with stacked unit bars and
 * pass/fail quality chips, the accepted-per-week chart and add/edit/delete.
 */
export function BatchesPanel({
  projectId,
  projectName,
  batches,
  summary,
  milestones,
  progressMode,
  progress,
  today,
  canDelete,
}: BatchesPanelProps) {
  const router = useRouter();
  const id = useId();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const calibration = batches.find((batch) => batch.is_calibration) ?? null;
  const dialogBatch =
    dialog.kind === "edit" || dialog.kind === "delete"
      ? (batches.find((batch) => batch.id === dialog.batchId) ?? null)
      : null;
  const unitTypes = new Set(batches.map((batch) => batch.unit_type));
  const sharedUnit = unitTypes.size === 1 ? BATCH_UNIT_TYPE_CONFIG[[...unitTypes][0]] : null;
  const unitLabel = sharedUnit ? sharedUnit.plural : "units";
  const close = () => setDialog({ kind: "none" });

  async function moveTo(batch: DataBatch, status: BatchStatus) {
    setBusyId(batch.id);
    try {
      const patch: { status: BatchStatus; units_accepted?: number } = { status };
      // Accepting with nothing recorded as accepted: everything delivered was accepted.
      if (status === "accepted" && batch.units_accepted === 0 && batch.units_delivered > 0) {
        patch.units_accepted = batch.units_delivered;
      }
      const result = await updateBatchAction(batch.id, patch);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Batch ${batch.number} moved to ${BATCH_STATUS_CONFIG[status].label}`);
      router.refresh();
    } catch {
      toast.error("Could not update the batch. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!dialogBatch) return;
    setDeleting(true);
    try {
      const result = await deleteBatchAction(dialogBatch.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted Batch ${dialogBatch.number}`);
      close();
      router.refresh();
    } catch {
      toast.error("Could not delete the batch. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  function rowMenu(batch: DataBatch) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={busyId === batch.id}
            aria-label={`Actions for Batch ${batch.number}`}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", batchId: batch.id })}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {BATCH_STATUS_ORDER.filter((status) => status !== batch.status).map((status) => (
            <DropdownMenuItem key={status} onSelect={() => moveTo(batch, status)}>
              <Icon name={BATCH_STATUS_CONFIG[status].icon} />
              {BATCH_STATUS_CONFIG[status].label}
            </DropdownMenuItem>
          ))}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setDialog({ kind: "delete", batchId: batch.id })}>
                <Trash2 aria-hidden />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function qualityChips(batch: DataBatch) {
    const gold = formatFraction(batch.gold_accuracy);
    const agreement = formatAgreement(batch.agreement_score, batch.agreement_metric);
    const metric = batch.agreement_metric ? AGREEMENT_METRIC_CONFIG[batch.agreement_metric].shortLabel : "";
    if (gold === "—" && agreement === "—") return <span className="text-xs text-fg-subtle">Not audited</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        <QualityChip result={goldResult(batch, summary.quality_threshold)} label="Gold" value={gold} />
        <QualityChip
          result={agreementResult(batch)}
          label={metric === "%" ? "Agreement" : metric || agreementLabel(batch.agreement_metric)}
          value={agreement}
        />
      </div>
    );
  }

  const addButton = (
    <Button onClick={() => setDialog({ kind: "create", calibration: false })}>
      <Plus aria-hidden />
      Add batch
    </Button>
  );

  const dialogs = (
    <>
      <BatchDialog
        mode={dialog.kind === "edit" ? "edit" : "create"}
        projectId={projectId}
        batch={dialog.kind === "edit" ? dialogBatch : null}
        calibrationTaken={calibration !== null}
        defaults={
          dialog.kind === "create"
            ? {
                is_calibration: dialog.calibration,
                unit_type: batches[batches.length - 1]?.unit_type,
              }
            : undefined
        }
        milestones={milestones}
        open={dialog.kind === "create" || (dialog.kind === "edit" && dialogBatch !== null)}
        onOpenChange={(open) => (!open ? close() : undefined)}
      />
      <Dialog
        open={dialog.kind === "delete" && dialogBatch !== null}
        onOpenChange={(open) => (!open && !deleting ? close() : undefined)}
      >
        <DialogContent
          size="sm"
          title={dialogBatch ? `Delete Batch ${dialogBatch.number}?` : "Delete batch"}
          description={
            progressMode === "batches"
              ? "Its units leave the totals and project progress is recalculated. This cannot be undone."
              : "Its units leave the totals. This cannot be undone."
          }
        >
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="danger" loading={deleting} onClick={remove}>
              Delete batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (batches.length === 0) {
    return (
      <section aria-labelledby={`${id}-title`} className="min-w-0">
        <h2 id={`${id}-title`} className="sr-only">
          Data batches
        </h2>
        <EmptyState
          icon={Database}
          title="No batches yet."
          description="Start with the paid calibration batch, then plan production batches with their unit targets."
          action={
            <>
              <Button onClick={() => setDialog({ kind: "create", calibration: true })}>
                <FlaskConical aria-hidden />
                Plan calibration batch
              </Button>
              <Button variant="outline" onClick={() => setDialog({ kind: "create", calibration: false })}>
                <Plus aria-hidden />
                Add batch
              </Button>
            </>
          }
        />
        {dialogs}
      </section>
    );
  }

  const acceptance = summary.acceptance_rate;
  const avgGold = summary.avg_gold_accuracy;
  const threshold = summary.quality_threshold;
  const goldPass = avgGold !== null && threshold !== null ? avgGold >= threshold : null;

  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-base font-semibold text-fg">
            Data batches
          </h2>
          <p className="mt-0.5 text-sm text-fg-muted [overflow-wrap:anywhere]">
            {summary.batch_count} {summary.batch_count === 1 ? "batch" : "batches"} for {projectName}.
            {progressMode === "batches"
              ? " Project progress is accepted units over planned units."
              : " Switch the project's progress mode to Batches to drive progress from accepted units."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{addButton}</div>
      </div>

      <Stagger className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryTile label="Planned">
          <NumberTicker value={summary.units_target} />
        </SummaryTile>
        <SummaryTile label="Delivered">
          <NumberTicker value={summary.units_delivered} />
        </SummaryTile>
        <SummaryTile label="Accepted">
          <NumberTicker value={summary.units_accepted} />
        </SummaryTile>
        <SummaryTile label="Acceptance rate" hint="Accepted ÷ delivered">
          {acceptance === null ? "—" : <NumberTicker value={acceptance} format={{ style: "percent", maximumFractionDigits: 1 }} />}
        </SummaryTile>
        <SummaryTile
          label="Avg gold accuracy"
          hint={
            threshold === null ? (
              "No threshold set"
            ) : (
              <span className={cn("inline-flex items-center gap-1 font-medium", goldPass ? "text-success" : goldPass === false ? "text-danger" : "")}>
                {goldPass ? <CircleCheck aria-hidden className="size-3" /> : goldPass === false ? <CircleX aria-hidden className="size-3" /> : null}
                {goldPass === null ? `Threshold ${formatFraction(threshold)}` : `${goldPass ? "Meets" : "Below"} ${formatFraction(threshold)}`}
              </span>
            )
          }
        >
          {avgGold === null ? "—" : <NumberTicker value={avgGold} format={{ style: "percent", maximumFractionDigits: 1 }} />}
        </SummaryTile>
        <StaggerItem className="col-span-2 flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card md:col-span-1">
          <ProgressRing
            value={progressMode === "batches" ? progress : summary.units_target > 0 ? Math.min(100, Math.round((100 * summary.units_accepted) / summary.units_target)) : 0}
            size={48}
            showValue
            tone="success"
            label={progressMode === "batches" ? "Project progress from accepted units" : "Accepted share of planned units"}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-fg-muted">{progressMode === "batches" ? "Project progress" : "Accepted of planned"}</p>
            <p className="text-xs text-fg-subtle">
              {progressMode === "batches" ? "From accepted units" : "Progress mode is not Batches"}
            </p>
          </div>
        </StaggerItem>
      </Stagger>

      {summary.production_before_calibration ? (
        <div role="alert" className="reveal flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/[0.06] px-4 py-3">
          <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-fg">Production started before the calibration batch was accepted.</p>
            <p className="mt-0.5 text-fg-muted">
              {summary.calibration.accepted
                ? "Some production batches were delivered before calibration sign-off. Check them against the final guidelines."
                : "Pause production or get the calibration batch accepted, so guidelines are fixed before volume work."}
            </p>
          </div>
        </div>
      ) : calibration && !summary.calibration.accepted ? (
        <div className="reveal flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/[0.07] px-4 py-3 sm:flex-row sm:items-center">
          <FlaskConical aria-hidden className="size-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-fg">Calibration gate</p>
            <p className="mt-0.5 text-fg-muted">
              Batch {calibration.number} is {BATCH_STATUS_CONFIG[calibration.status].label.toLowerCase()}. Keep production
              batches planned until it is accepted.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "edit", batchId: calibration.id })}>
            Update calibration
          </Button>
        </div>
      ) : !calibration ? (
        <div className="reveal flex flex-col gap-3 rounded-2xl border border-border bg-surface-2/50 px-4 py-3 sm:flex-row sm:items-center">
          <FlaskConical aria-hidden className="size-5 shrink-0 text-fg-muted" />
          <p className="min-w-0 flex-1 text-sm text-fg-muted">
            No calibration batch. A paid calibration batch fixes guidelines and thresholds before production.
          </p>
          <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "create", calibration: true })}>
            Plan calibration batch
          </Button>
        </div>
      ) : (
        <div className="reveal flex items-center gap-3 rounded-2xl border border-success/30 bg-success/[0.06] px-4 py-3 text-sm">
          <CircleCheck aria-hidden className="size-5 shrink-0 text-success" />
          <p className="min-w-0 text-fg">
            Calibration accepted. Production batches are clear to run.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:gap-6 2xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <Card className="reveal min-w-0">
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Batches</CardTitle>
              <CardDescription>Calibration first, then by number. Green bars are accepted, light bars delivered.</CardDescription>
            </div>
          </CardHeader>

          <Stagger as="ul" className="space-y-3 px-4 pb-4 md:hidden">
            {batches.map((batch) => (
              <StaggerItem as="li" key={batch.id}>
                <article
                  aria-label={batchTitle(batch)}
                  className={cn(
                    "rounded-xl border bg-surface p-3",
                    batch.is_calibration ? "border-accent/40" : "border-border",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-fg [overflow-wrap:anywhere]">{batchTitle(batch)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {batch.is_calibration ? <Badge tone="violet">Calibration</Badge> : null}
                        <StatusBadge status={batch.status} />
                      </div>
                    </div>
                    {rowMenu(batch)}
                  </div>
                  <div className="mt-3">
                    <UnitsBar batch={batch} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {qualityChips(batch)}
                    <DueDate date={batch.due_date} status="ongoing" today={today} closed={batch.status === "accepted"} withIcon />
                  </div>
                </article>
              </StaggerItem>
            ))}
          </Stagger>

          <div className="hidden overflow-x-auto border-t border-border md:block">
            <table className="w-full min-w-[46rem] text-sm">
              <caption className="sr-only">Data batches of {projectName}</caption>
              <thead className="bg-surface-2/50 text-xs text-fg-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Batch</th>
                  <th scope="col" className="w-[30%] px-3 py-2 text-left font-medium">Units</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Quality</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Due</th>
                  <th scope="col" className="w-12 px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className={cn(
                      "border-t border-border align-top transition-colors duration-(--dur-2) hover:bg-surface-2/40",
                      batch.is_calibration && "bg-accent-soft/20",
                    )}
                  >
                    <td className="min-w-[12rem] px-3 py-3">
                      <p className="font-medium text-fg [overflow-wrap:anywhere]">{batchTitle(batch)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                        {batch.is_calibration ? <Badge tone="violet">Calibration</Badge> : null}
                        <span className="inline-flex items-center gap-1">
                          <Icon name={BATCH_UNIT_TYPE_CONFIG[batch.unit_type].icon} className="size-3.5" />
                          {BATCH_UNIT_TYPE_CONFIG[batch.unit_type].label}
                        </span>
                        {batch.guideline_version ? <span>· guidelines {batch.guideline_version}</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <UnitsBar batch={batch} />
                    </td>
                    <td className="px-3 py-3">{qualityChips(batch)}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <StatusBadge status={batch.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <DueDate date={batch.due_date} status="ongoing" today={today} closed={batch.status === "accepted"} />
                    </td>
                    <td className="px-2 py-2 text-right">{rowMenu(batch)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="reveal min-w-0 [--reveal-delay:80ms]">
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Accepted per week</CardTitle>
              <CardDescription>Units accepted, by the week of acceptance.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <AcceptedPerWeekChart points={summary.accepted_per_week} unitLabel={unitLabel} />
          </CardContent>
        </Card>
      </div>

      {dialogs}
    </section>
  );
}
