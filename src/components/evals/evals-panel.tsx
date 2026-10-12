"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleX,
  Columns2,
  ExternalLink,
  FlaskConical,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Trophy,
} from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { NativeSelect } from "@/components/ui/native-select";
import { usePageReady } from "@/hooks/use-page-ready";
import { deleteEvalRunAction, updateEvalRunAction } from "@/actions/evals";
import { EVAL_CHANGE_TYPE_CONFIG, EVAL_VERDICT_CONFIG } from "@/lib/constants";
import type { EvalRunWithMeta, MilestoneRef } from "@/lib/types";
import { cn, formatDate, formatMetricValue, metricIsMet } from "@/lib/utils";
import { dateInTimeZone } from "@/lib/workspace-time";
import { CompareRunsSheet } from "./compare-runs-sheet";
import { DeltaChip } from "./delta-chip";
import { EvalRunDialog } from "./eval-run-dialog";
import {
  DEFAULT_EVAL_SORT,
  bestRunId,
  buildMetricColumns,
  columnsWithValues,
  metricDelta,
  metricValue,
  sortRuns,
  type EvalSort,
  type EvalSortKey,
  type MetricColumn,
  type ScorecardMetricRef,
} from "./eval-utils";
import { MetricTrendChart, type MetricTrendChartPoint } from "./metric-trend-chart";
import { PromoteChampionDialog } from "./promote-champion-dialog";

export interface EvalsPanelProps {
  projectId: string;
  projectName: string;
  runs: EvalRunWithMeta[];
  scorecard: ScorecardMetricRef[];
  metricNames: string[];
  milestones: MilestoneRef[];
  today: string;
  timeZone: string;
  viewerId: string;
  isAdmin: boolean;
  ownerId: string | null;
  /** `?new=1` deep link (palette "Log eval run"): open the Log run dialog on load. */
  autoOpen: boolean;
}

type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; runId: string }
  | { kind: "promote"; runId: string }
  | { kind: "delete"; runId: string };

function VerdictBadge({ run }: { run: EvalRunWithMeta }) {
  const config = EVAL_VERDICT_CONFIG[run.verdict];
  return (
    <Badge tone={config.tone}>
      <Icon name={config.icon} className={cn("size-3", run.verdict === "champion" && "fill-current")} />
      {config.label}
    </Badge>
  );
}

function ChangeChip({ run }: { run: EvalRunWithMeta }) {
  const config = EVAL_CHANGE_TYPE_CONFIG[run.change_type];
  return (
    <Badge tone={config.tone}>
      <Icon name={config.icon} className="size-3" />
      {config.label}
    </Badge>
  );
}

function runDetails(run: EvalRunWithMeta): string {
  return [run.model_name, run.prompt_version && `prompt ${run.prompt_version}`, run.dataset_version && `on ${run.dataset_version}`]
    .filter(Boolean)
    .join(" · ");
}

function MetricCell({
  run,
  column,
  isBest,
  showDelta,
  align = "end",
}: {
  run: EvalRunWithMeta;
  column: MetricColumn;
  isBest: boolean;
  showDelta: boolean;
  align?: "start" | "end";
}) {
  const value = metricValue(run.metrics, column.key);
  if (value === null) return <span className="text-fg-subtle">—</span>;
  const delta = showDelta ? metricDelta(run, column.key) : null;
  return (
    <span className={cn("inline-flex flex-col gap-0.5", align === "end" ? "items-end" : "items-start")}>
      <span className={cn("inline-flex items-center gap-1 tabular-nums", isBest ? "font-semibold text-fg" : "text-fg")}>
        {isBest ? (
          <Trophy aria-hidden className="size-3 text-warning" />
        ) : null}
        {formatMetricValue(value, column.unit)}
        {isBest ? <span className="sr-only">(best)</span> : null}
      </span>
      {delta !== null ? (
        <DeltaChip delta={delta} unit={column.unit} direction={column.direction} context="vs champion" />
      ) : null}
    </span>
  );
}

/**
 * Client body of the Evals tab: champion summary, a trend chart per metric,
 * the sortable runs table (cards on phones) with deltas against the champion,
 * and the Log / Edit / Promote / Compare / Delete flows.
 */
export function EvalsPanel({
  projectId,
  projectName,
  runs,
  scorecard,
  metricNames,
  milestones,
  today,
  timeZone,
  viewerId,
  isAdmin,
  ownerId,
  autoOpen,
}: EvalsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  // `?new=1` opens the Log run dialog once the first page load has hydrated (a modal
  // marks the rest of the page aria-hidden, which must not race hydration).
  const pageReady = usePageReady();
  const autoOpened = useRef(false);
  const [sort, setSort] = useState<EvalSort>(DEFAULT_EVAL_SORT);
  const [compare, setCompare] = useState<{ open: boolean; a: string | null; b: string | null }>({
    open: false,
    a: null,
    b: null,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Drop `?new=1` once the dialog has opened, so a refresh or Back does not reopen it.
  useEffect(() => {
    if (!autoOpen || !pageReady || autoOpened.current) return;
    autoOpened.current = true;
    setDialog({ kind: "create" });
    const params = new URLSearchParams(window.location.search);
    if (!params.has("new")) return;
    params.delete("new");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [autoOpen, pageReady, pathname, router]);

  const champion = runs.find((run) => run.verdict === "champion") ?? null;
  const allColumns = useMemo(() => buildMetricColumns(runs, scorecard), [runs, scorecard]);
  const columns = useMemo(() => columnsWithValues(allColumns, runs), [allColumns, runs]);
  const sorted = useMemo(() => sortRuns(runs, sort), [runs, sort]);
  const best = useMemo(() => new Map(columns.map((column) => [column.key, bestRunId(runs, column)])), [columns, runs]);

  const [chartKey, setChartKey] = useState<string | null>(null);
  const chartColumn = columns.find((column) => column.key === chartKey) ?? columns[0] ?? null;
  const chartPoints: MetricTrendChartPoint[] = useMemo(() => {
    if (!chartColumn) return [];
    return [...runs]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .flatMap((run) => {
        const value = metricValue(run.metrics, chartColumn.key);
        return value === null
          ? []
          : [{ id: run.id, label: run.label, value, date: dateInTimeZone(run.created_at, timeZone), isChampion: run.verdict === "champion" }];
      });
  }, [chartColumn, runs, timeZone]);

  const dialogRun =
    dialog.kind === "edit" || dialog.kind === "promote" || dialog.kind === "delete"
      ? (runs.find((run) => run.id === dialog.runId) ?? null)
      : null;

  const canDelete = (run: EvalRunWithMeta) => isAdmin || run.created_by === viewerId || ownerId === viewerId;
  const close = () => setDialog({ kind: "none" });

  function toggleSort(key: EvalSortKey) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "label" ? "asc" : "desc" },
    );
  }

  async function setVerdict(run: EvalRunWithMeta, verdict: "candidate" | "rejected") {
    setBusyId(run.id);
    try {
      const result = await updateEvalRunAction(run.id, { verdict });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(verdict === "rejected" ? `Marked "${run.label}" as rejected` : `"${run.label}" is a candidate again`);
      router.refresh();
    } catch {
      toast.error("Could not update the run. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!dialogRun) return;
    setDeleting(true);
    try {
      const result = await deleteEvalRunAction(dialogRun.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted "${dialogRun.label}"`);
      close();
      router.refresh();
    } catch {
      toast.error("Could not delete the run. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  function rowMenu(run: EvalRunWithMeta) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={busyId === run.id}
            aria-label={`Actions for ${run.label}`}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", runId: run.id })}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          {run.verdict !== "champion" ? (
            <DropdownMenuItem onSelect={() => setDialog({ kind: "promote", runId: run.id })}>
              <Star aria-hidden />
              Promote to champion
            </DropdownMenuItem>
          ) : null}
          {champion && run.id !== champion.id ? (
            <DropdownMenuItem onSelect={() => setCompare({ open: true, a: champion.id, b: run.id })}>
              <Columns2 aria-hidden />
              Compare with champion
            </DropdownMenuItem>
          ) : null}
          {run.verdict === "rejected" ? (
            <DropdownMenuItem onSelect={() => setVerdict(run, "candidate")}>
              <RotateCcw aria-hidden />
              Mark as candidate
            </DropdownMenuItem>
          ) : run.verdict !== "champion" ? (
            <DropdownMenuItem onSelect={() => setVerdict(run, "rejected")}>
              <CircleX aria-hidden />
              Mark as rejected
            </DropdownMenuItem>
          ) : null}
          {run.external_url ? (
            <DropdownMenuItem asChild>
              <a href={run.external_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                Open trace
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </DropdownMenuItem>
          ) : null}
          {canDelete(run) ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setDialog({ kind: "delete", runId: run.id })}>
                <Trash2 aria-hidden />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function sortHeader(sortKey: EvalSortKey, label: string, align: "left" | "right" = "left") {
    const active = sort.key === sortKey;
    const SortIcon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th
        key={sortKey}
        scope="col"
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className={cn("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left")}
      >
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md outline-none transition-control hover:text-fg focus-visible:ring-2 focus-visible:ring-ring",
            "pointer-coarse:py-2",
            active && "text-fg",
            align === "right" && "flex-row-reverse",
          )}
        >
          <span className="whitespace-nowrap">{label}</span>
          <SortIcon aria-hidden className={cn("size-3.5", !active && "opacity-50")} />
          <span className="sr-only">, sort</span>
        </button>
      </th>
    );
  }

  const logButton = (
    <Button onClick={() => setDialog({ kind: "create" })}>
      <Plus aria-hidden />
      Log run
    </Button>
  );

  const dialogs = (
    <>
      <EvalRunDialog
        mode={dialog.kind === "edit" ? "edit" : "create"}
        projectId={projectId}
        run={dialog.kind === "edit" ? dialogRun : null}
        scorecard={scorecard}
        metricNames={metricNames}
        milestones={milestones}
        today={today}
        timeZone={timeZone}
        open={dialog.kind === "create" || (dialog.kind === "edit" && dialogRun !== null)}
        onOpenChange={(open) => (!open ? close() : undefined)}
      />
      <PromoteChampionDialog
        run={dialog.kind === "promote" ? dialogRun : null}
        champion={champion}
        scorecard={scorecard}
        open={dialog.kind === "promote" && dialogRun !== null}
        onOpenChange={(open) => (!open ? close() : undefined)}
      />
      <Dialog open={dialog.kind === "delete" && dialogRun !== null} onOpenChange={(open) => (!open && !deleting ? close() : undefined)}>
        <DialogContent
          size="sm"
          title={dialogRun ? `Delete "${dialogRun.label}"?` : "Delete run"}
          description={
            dialogRun?.verdict === "champion"
              ? "This is the champion. The project will have no champion until you promote another run."
              : "The run and its metrics leave the log. This cannot be undone."
          }
        >
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="danger" loading={deleting} onClick={remove}>
              Delete run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CompareRunsSheet
        runs={runs}
        columns={allColumns}
        timeZone={timeZone}
        open={compare.open}
        onOpenChange={(open) => setCompare((current) => ({ ...current, open }))}
        initialA={compare.a}
        initialB={compare.b}
      />
    </>
  );

  if (runs.length === 0) {
    return (
      <section aria-labelledby={`${id}-title`} className="min-w-0">
        <h2 id={`${id}-title`} className="sr-only">
          Evaluation log
        </h2>
        <EmptyState
          icon={FlaskConical}
          title="No eval runs yet."
          description={
            scorecard.length > 0
              ? "Log a run against a fixed eval set. Each later run shows whether a change helped against the champion."
              : "Log a run against a fixed eval set. Add scorecard metrics on the overview first so runs share names and targets."
          }
          action={logButton}
        />
        {dialogs}
      </section>
    );
  }

  const championDate = champion ? dateInTimeZone(champion.created_at, timeZone) : null;

  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-base font-semibold text-fg">
            Evaluation log
          </h2>
          <p className="mt-0.5 text-sm text-fg-muted [overflow-wrap:anywhere]">
            {runs.length} {runs.length === 1 ? "run" : "runs"} for {projectName}. Deltas compare each run with the champion.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          {runs.length >= 2 ? (
            <Button
              variant="outline"
              onClick={() =>
                setCompare({
                  open: true,
                  a: champion?.id ?? sorted[1]?.id ?? null,
                  b: sorted.find((run) => run.id !== champion?.id)?.id ?? null,
                })
              }
            >
              <Columns2 aria-hidden />
              Compare
            </Button>
          ) : null}
          {logButton}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-6">
        <Card className="reveal">
          <CardHeader>
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Star aria-hidden className="size-4 fill-success text-success" />
                Champion
              </CardTitle>
              <CardDescription>
                {champion ? "The best run so far. Gates and handover quote it." : "No champion yet. Promote the best run from the log."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {champion ? (
              <div className="space-y-3">
                <div className="min-w-0">
                  <p className="font-medium text-fg [overflow-wrap:anywhere]">{champion.label}</p>
                  <p className="mt-0.5 text-xs text-fg-muted [overflow-wrap:anywhere]">
                    <span className="tabular-nums">{formatDate(championDate)}</span>
                    {runDetails(champion) ? ` · ${runDetails(champion)}` : ""}
                  </p>
                </div>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {buildMetricColumns([champion], scorecard)
                    .filter((column) => metricValue(champion.metrics, column.key) !== null)
                    .map((column) => {
                      const value = metricValue(champion.metrics, column.key);
                      const met = column.target !== null ? metricIsMet(column.direction, value, column.target) : null;
                      return (
                        <li key={column.key} className="min-w-0 rounded-xl border border-border bg-surface-2/40 px-3 py-2">
                          <p className="truncate text-xs text-fg-muted" title={column.name}>
                            {column.name}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-lg font-semibold tabular-nums text-fg">
                            {formatMetricValue(value, column.unit)}
                            {column.target !== null ? (
                              <span
                                className={cn(
                                  "text-xs font-medium",
                                  met ? "text-success" : "text-warning",
                                )}
                              >
                                {met ? "Met" : "Below target"} · target {formatMetricValue(column.target, column.unit)}
                              </span>
                            ) : null}
                          </p>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-fg-muted">Open a run&apos;s menu and choose Promote to champion.</p>
            )}
          </CardContent>
        </Card>

        <Card className="reveal [--reveal-delay:60ms]">
          <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <CardTitle>Trend</CardTitle>
              <CardDescription>One metric across runs, oldest first.</CardDescription>
            </div>
            {columns.length > 1 ? (
              <div className="w-full sm:w-56">
                <label htmlFor={`${id}-chart-metric`} className="sr-only">
                  Metric to chart
                </label>
                <NativeSelect
                  id={`${id}-chart-metric`}
                  value={chartColumn?.key ?? ""}
                  onChange={(event) => setChartKey(event.target.value)}
                >
                  {columns.map((column) => (
                    <option key={column.key} value={column.key}>
                      {column.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            {chartColumn ? (
              <MetricTrendChart
                key={chartColumn.key}
                points={chartPoints}
                metricName={chartColumn.name}
                unit={chartColumn.unit}
                direction={chartColumn.direction}
                target={chartColumn.target}
                baseline={chartColumn.baseline}
              />
            ) : (
              <p className="text-sm text-fg-muted">Runs have no metric values to chart yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="reveal [--reveal-delay:120ms]">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Runs</CardTitle>
            <CardDescription>
              Trophy marks the best value per metric; arrows show the change against the champion.
            </CardDescription>
          </div>
        </CardHeader>

        {/* Phones and small tablets: one card per run. */}
        <Stagger as="ul" className="space-y-3 px-4 pb-4 md:hidden">
          {sorted.map((run) => (
            <StaggerItem as="li" key={run.id}>
              <article
                aria-label={run.label}
                className={cn(
                  "rounded-xl border bg-surface p-3",
                  run.verdict === "champion" ? "border-success/40" : "border-border",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-fg [overflow-wrap:anywhere]">{run.label}</p>
                    <p className="mt-0.5 text-xs text-fg-muted tabular-nums">
                      {formatDate(dateInTimeZone(run.created_at, timeZone))}
                      {run.creator ? ` · ${run.creator.name}` : ""}
                    </p>
                  </div>
                  {rowMenu(run)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <VerdictBadge run={run} />
                  <ChangeChip run={run} />
                  {run.milestone_name ? <Badge tone="slate">{run.milestone_name}</Badge> : null}
                </div>
                {runDetails(run) ? (
                  <p className="mt-2 text-xs text-fg-muted [overflow-wrap:anywhere]">{runDetails(run)}</p>
                ) : null}
                {columns.some((column) => metricValue(run.metrics, column.key) !== null) ? (
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    {columns
                      .filter((column) => metricValue(run.metrics, column.key) !== null)
                      .map((column) => (
                        <div key={column.key} className="min-w-0 rounded-lg bg-surface-2/50 px-2.5 py-1.5">
                          <dt className="truncate text-[11px] text-fg-muted" title={column.name}>
                            {column.name}
                          </dt>
                          <dd className="mt-0.5">
                            <MetricCell
                              run={run}
                              column={column}
                              isBest={best.get(column.key) === run.id && runs.length > 1}
                              showDelta={run.verdict !== "champion"}
                              align="start"
                            />
                          </dd>
                        </div>
                      ))}
                  </dl>
                ) : null}
              </article>
            </StaggerItem>
          ))}
        </Stagger>

        {/* md and up: sortable table; wide metric sets scroll inside the card. */}
        <div className="hidden overflow-x-auto border-t border-border md:block">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">
              Eval runs of {projectName}. Use the column buttons to sort.
            </caption>
            <thead className="bg-surface-2/50 text-xs text-fg-muted">
              <tr>
                {sortHeader("date", "Date")}
                {sortHeader("label", "Run")}
                {columns.map((column) => sortHeader(`metric:${column.key}`, column.name, "right"))}
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Verdict
                </th>
                <th scope="col" className="w-12 px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((run) => (
                <tr
                  key={run.id}
                  className={cn(
                    "border-t border-border align-top transition-colors duration-(--dur-2) hover:bg-surface-2/40",
                    run.verdict === "champion" && "bg-success/[0.04]",
                    (run.verdict === "rejected" || run.verdict === "archived") && "text-fg-muted",
                  )}
                >
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-fg-muted">
                    {formatDate(dateInTimeZone(run.created_at, timeZone))}
                  </td>
                  <td className="min-w-[14rem] max-w-[22rem] px-3 py-3">
                    <div className="flex items-start gap-1.5">
                      {run.verdict === "champion" ? (
                        <Star aria-label="Champion" role="img" className="mt-0.5 size-4 shrink-0 fill-success text-success" />
                      ) : null}
                      <div className="min-w-0">
                        <p className="font-medium text-fg [overflow-wrap:anywhere]">{run.label}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <ChangeChip run={run} />
                          {run.milestone_name ? <Badge tone="slate">{run.milestone_name}</Badge> : null}
                        </div>
                        {runDetails(run) ? (
                          <p className="mt-1 text-xs text-fg-muted [overflow-wrap:anywhere]">{runDetails(run)}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  {columns.map((column) => (
                    <td key={column.key} className="whitespace-nowrap px-3 py-3 text-right">
                      <MetricCell
                        run={run}
                        column={column}
                        isBest={best.get(column.key) === run.id && runs.length > 1}
                        showDelta={run.verdict !== "champion"}
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-3">
                    <VerdictBadge run={run} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    {rowMenu(run)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {dialogs}
    </section>
  );
}
