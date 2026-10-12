"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { createEvalRunAction, updateEvalRunAction } from "@/actions/evals";
import { EVAL_CHANGE_TYPE_CONFIG, EVAL_VERDICT_CONFIG } from "@/lib/constants";
import {
  EDITABLE_EVAL_VERDICTS,
  EVAL_LABEL_MAX,
  EVAL_METRICS_MAX,
  EVAL_METRIC_NAME_MAX,
  EVAL_NOTES_MAX,
  EVAL_VERSION_MAX,
  type EditableEvalVerdict,
} from "@/lib/schemas/evals";
import {
  EVAL_CHANGE_TYPES,
  type EvalChangeType,
  type EvalMetrics,
  type EvalRunWithMeta,
  type MilestoneRef,
  type UpdateEvalRunInput,
} from "@/lib/types";
import { cn, isHttpUrl } from "@/lib/utils";
import { dateInTimeZone, isDateOnly } from "@/lib/workspace-time";
import {
  fromInputValue,
  isPercentUnit,
  metricKey,
  toInputValue,
  type ScorecardMetricRef,
} from "./eval-utils";

interface MetricRow {
  id: number;
  name: string;
  value: string;
}

interface Draft {
  label: string;
  change_type: EvalChangeType;
  model_name: string;
  prompt_version: string;
  dataset_version: string;
  run_date: string;
  milestone_id: string;
  verdict: EditableEvalVerdict | "keep";
  external_url: string;
  notes: string;
}

export interface EvalRunDialogProps {
  mode: "create" | "edit";
  projectId: string;
  /** Required in edit mode. */
  run?: EvalRunWithMeta | null;
  scorecard: ScorecardMetricRef[];
  /** Scorecard names first, then names earlier runs used (listMetricNames). */
  metricNames: string[];
  milestones: MilestoneRef[];
  /** Workspace today. */
  today: string;
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

let rowCounter = 0;
function nextRowId(): number {
  rowCounter += 1;
  return rowCounter;
}

function unitFor(name: string, scorecard: readonly ScorecardMetricRef[]): string {
  const key = metricKey(name);
  return scorecard.find((metric) => metricKey(metric.name) === key)?.unit ?? "";
}

function rowsFrom(run: EvalRunWithMeta | null | undefined, scorecard: readonly ScorecardMetricRef[]): MetricRow[] {
  if (run) {
    const rows = Object.entries(run.metrics).map(([name, value]) => ({
      id: nextRowId(),
      name,
      value: toInputValue(value, unitFor(name, scorecard)),
    }));
    if (rows.length > 0) return rows;
  }
  // A new run starts with one empty row per scorecard metric (names must match the scorecard).
  const fromScorecard = scorecard.slice(0, EVAL_METRICS_MAX).map((metric) => ({ id: nextRowId(), name: metric.name, value: "" }));
  return fromScorecard.length > 0 ? fromScorecard : [{ id: nextRowId(), name: "", value: "" }];
}

function draftFrom(run: EvalRunWithMeta | null | undefined, today: string, timeZone: string): Draft {
  return {
    label: run?.label ?? "",
    change_type: run?.change_type ?? "prompt",
    model_name: run?.model_name ?? "",
    prompt_version: run?.prompt_version ?? "",
    dataset_version: run?.dataset_version ?? "",
    run_date: run ? dateInTimeZone(run.created_at, timeZone) : today,
    milestone_id: run?.milestone_id ?? "",
    verdict:
      run && (EDITABLE_EVAL_VERDICTS as readonly string[]).includes(run.verdict)
        ? (run.verdict as EditableEvalVerdict)
        : run
          ? "keep"
          : "candidate",
    external_url: run?.external_url ?? "",
    notes: run?.notes ?? "",
  };
}

/**
 * Log run / Edit run dialog: model and prompt versions, the dataset (eval
 * set), the run date, phase, verdict, metrics as name/value rows (names
 * autocomplete from the scorecard, which new runs start from; "%" metrics are
 * entered as percentages), an external trace link and notes.
 */
export function EvalRunDialog({
  mode,
  projectId,
  run,
  scorecard,
  metricNames,
  milestones,
  today,
  timeZone,
  open,
  onOpenChange,
}: EvalRunDialogProps) {
  const router = useRouter();
  const id = useId();
  const labelRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(run, today, timeZone));
  const [rows, setRows] = useState<MetricRow[]>(() => rowsFrom(run, scorecard));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const field = (name: string) => `${id}-${name}`;
  const listId = `${id}-metric-names`;

  // Reset the form each time the dialog opens (for another run, or a fresh log):
  // state derived during render, so the first open frame already shows the right values.
  const openKey = open ? `open:${run?.id ?? "new"}` : "closed";
  const [shownKey, setShownKey] = useState(openKey);
  if (shownKey !== openKey) {
    setShownKey(openKey);
    if (open) {
      setDraft(draftFrom(run, today, timeZone));
      setRows(rowsFrom(run, scorecard));
      setErrors({});
    }
  }

  const usedKeys = useMemo(() => new Set(rows.map((row) => metricKey(row.name)).filter(Boolean)), [rows]);
  const missingScorecard = scorecard.filter((metric) => !usedKeys.has(metricKey(metric.name)));

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (errors[key]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  function updateRow(rowId: number, patch: Partial<MetricRow>) {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
    if (errors.metrics || errors[`row-${rowId}`]) {
      setErrors((current) => {
        const next = { ...current };
        delete next.metrics;
        delete next[`row-${rowId}`];
        return next;
      });
    }
  }

  function addRow(name = "") {
    if (rows.length >= EVAL_METRICS_MAX) return;
    const row = { id: nextRowId(), name, value: "" };
    setRows((current) => [...current, row]);
    window.requestAnimationFrame(() => {
      document.getElementById(`${id}-row-${row.id}-${name ? "value" : "name"}`)?.focus();
    });
  }

  function removeRow(rowId: number) {
    setRows((current) => current.filter((row) => row.id !== rowId));
  }

  function validate(): EvalMetrics | null {
    const next: Record<string, string> = {};
    const label = draft.label.trim();
    if (!label) next.label = "Give the run a label";
    else if (label.length > EVAL_LABEL_MAX) next.label = `Labels must be ${EVAL_LABEL_MAX} characters or fewer`;
    if (draft.run_date && !isDateOnly(draft.run_date)) next.run_date = "Use a valid date";
    const url = draft.external_url.trim();
    if (url && !isHttpUrl(url)) next.external_url = "Use a full http(s) link";

    const metrics: EvalMetrics = {};
    const seen = new Set<string>();
    for (const row of rows) {
      const name = row.name.trim();
      const hasValue = row.value.trim() !== "";
      if (!name && !hasValue) continue;
      if (!name) {
        next[`row-${row.id}`] = "Name this metric";
        continue;
      }
      if (name.length > EVAL_METRIC_NAME_MAX) {
        next[`row-${row.id}`] = `Metric names must be ${EVAL_METRIC_NAME_MAX} characters or fewer`;
        continue;
      }
      const key = metricKey(name);
      if (seen.has(key)) {
        next[`row-${row.id}`] = `"${name}" is listed twice`;
        continue;
      }
      seen.add(key);
      if (!hasValue) {
        // Scorecard rows the run did not measure are simply left out.
        continue;
      }
      const value = fromInputValue(row.value, unitFor(name, scorecard));
      if (value === null) {
        next[`row-${row.id}`] = "Enter a number";
        continue;
      }
      metrics[name] = value;
    }
    if (Object.keys(metrics).length === 0 && !Object.keys(next).some((key) => key.startsWith("row-"))) {
      next.metrics = "Add at least one metric value";
    }
    setErrors(next);
    return Object.keys(next).length === 0 ? metrics : null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const metrics = validate();
    if (!metrics) return;
    setPending(true);
    try {
      if (mode === "create") {
        const result = await createEvalRunAction({
          project_id: projectId,
          label: draft.label.trim(),
          change_type: draft.change_type,
          model_name: draft.model_name.trim(),
          prompt_version: draft.prompt_version.trim(),
          dataset_version: draft.dataset_version.trim(),
          metrics,
          verdict: draft.verdict === "keep" ? "candidate" : draft.verdict,
          milestone_id: draft.milestone_id || null,
          external_url: draft.external_url.trim() || null,
          notes: draft.notes.trim(),
          run_date: draft.run_date || null,
        });
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          toast.error(result.error);
          return;
        }
        toast.success(`Logged "${result.data.label}"`);
      } else {
        if (!run) return;
        const patch: UpdateEvalRunInput & { run_date?: string | null } = {
          label: draft.label.trim(),
          change_type: draft.change_type,
          model_name: draft.model_name.trim(),
          prompt_version: draft.prompt_version.trim(),
          dataset_version: draft.dataset_version.trim(),
          metrics,
          milestone_id: draft.milestone_id || null,
          external_url: draft.external_url.trim() || null,
          notes: draft.notes.trim(),
        };
        if (draft.verdict !== "keep" && draft.verdict !== run.verdict) patch.verdict = draft.verdict;
        if (draft.run_date && draft.run_date !== dateInTimeZone(run.created_at, timeZone)) patch.run_date = draft.run_date;
        const result = await updateEvalRunAction(run.id, patch);
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          toast.error(result.error);
          return;
        }
        toast.success("Changes saved");
      }
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("Could not save the run. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const describedBy = (name: string, hint = false) =>
    errors[name] ? `${field(name)}-error` : hint ? `${field(name)}-hint` : undefined;
  const lockedVerdict = run && draft.verdict === "keep" ? EVAL_VERDICT_CONFIG[run.verdict].label : null;

  return (
    <Dialog open={open} onOpenChange={(next) => (!pending ? onOpenChange(next) : undefined)}>
      <DialogContent
        size="lg"
        title={mode === "create" ? "Log eval run" : "Edit eval run"}
        description="Record what changed, the eval set it ran on and the scores it got."
      >
        <form onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Label" htmlFor={field("label")} error={errors.label} required className="sm:col-span-2">
              <Input
                ref={labelRef}
                id={field("label")}
                value={draft.label}
                autoFocus
                maxLength={EVAL_LABEL_MAX + 20}
                placeholder="Prompt, model and settings tried"
                invalid={Boolean(errors.label)}
                aria-describedby={describedBy("label")}
                onChange={(event) => update("label", event.target.value)}
              />
            </FormField>

            <FormField label="Change type" htmlFor={field("change")}>
              <NativeSelect
                id={field("change")}
                value={draft.change_type}
                onChange={(event) => update("change_type", event.target.value as EvalChangeType)}
              >
                {EVAL_CHANGE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EVAL_CHANGE_TYPE_CONFIG[type].label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>

            <FormField label="Run date" htmlFor={field("run_date")} error={errors.run_date}>
              <Input
                id={field("run_date")}
                type="date"
                value={draft.run_date}
                max={today}
                invalid={Boolean(errors.run_date)}
                aria-describedby={describedBy("run_date")}
                onChange={(event) => update("run_date", event.target.value)}
              />
            </FormField>

            <FormField label="Model" htmlFor={field("model")} error={errors.model_name}>
              <Input
                id={field("model")}
                value={draft.model_name}
                maxLength={EVAL_VERSION_MAX}
                placeholder="Model name"
                onChange={(event) => update("model_name", event.target.value)}
              />
            </FormField>

            <FormField label="Prompt version" htmlFor={field("prompt")} error={errors.prompt_version}>
              <Input
                id={field("prompt")}
                value={draft.prompt_version}
                maxLength={EVAL_VERSION_MAX}
                placeholder="Prompt version"
                onChange={(event) => update("prompt_version", event.target.value)}
              />
            </FormField>

            <FormField
              label="Dataset / eval set"
              htmlFor={field("dataset")}
              error={errors.dataset_version}
              hint="Keep it fixed between runs so scores compare."
            >
              <Input
                id={field("dataset")}
                value={draft.dataset_version}
                maxLength={EVAL_VERSION_MAX}
                placeholder="Dataset name or version"
                aria-describedby={describedBy("dataset", true)}
                onChange={(event) => update("dataset_version", event.target.value)}
              />
            </FormField>

            <FormField label="Verdict" htmlFor={field("verdict")} hint={lockedVerdict ? "Promote another run to replace the champion, or demote this one here." : undefined}>
              <NativeSelect
                id={field("verdict")}
                value={draft.verdict}
                aria-describedby={lockedVerdict ? `${field("verdict")}-hint` : undefined}
                onChange={(event) => update("verdict", event.target.value as Draft["verdict"])}
              >
                {lockedVerdict ? <option value="keep">{lockedVerdict} (keep)</option> : null}
                {EDITABLE_EVAL_VERDICTS.map((verdict) => (
                  <option key={verdict} value={verdict}>
                    {EVAL_VERDICT_CONFIG[verdict].label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>

            {milestones.length > 0 ? (
              <FormField label="Phase" htmlFor={field("phase")} error={errors.milestone_id} className="sm:col-span-2">
                <NativeSelect
                  id={field("phase")}
                  value={draft.milestone_id}
                  onChange={(event) => update("milestone_id", event.target.value)}
                >
                  <option value="">No phase</option>
                  {milestones.map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>
                      {milestone.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            ) : null}
          </div>

          <fieldset className="min-w-0 space-y-2" aria-describedby={`${field("metrics")}-hint`}>
            <legend className="text-sm font-medium text-fg">Metrics</legend>
            <p id={`${field("metrics")}-hint`} className="text-xs text-fg-muted">
              {scorecard.length > 0
                ? "Use the scorecard's metric names so trends and the champion line up. Leave a value empty if this run did not measure it."
                : "Name each metric the same way every run (for example Faithfulness or F1)."}
            </p>
            <datalist id={listId}>
              {metricNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <ul className="space-y-2">
              {rows.map((row, index) => {
                const unit = unitFor(row.name, scorecard);
                const percent = isPercentUnit(unit);
                const rowError = errors[`row-${row.id}`];
                const nameId = `${id}-row-${row.id}-name`;
                const valueId = `${id}-row-${row.id}-value`;
                const errorId = `${id}-row-${row.id}-error`;
                return (
                  <li key={row.id} className="min-w-0">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <label htmlFor={nameId} className="sr-only">
                          Metric {index + 1} name
                        </label>
                        <Input
                          id={nameId}
                          list={listId}
                          value={row.name}
                          maxLength={EVAL_METRIC_NAME_MAX + 10}
                          placeholder="Metric name"
                          autoComplete="off"
                          invalid={Boolean(rowError)}
                          aria-describedby={rowError ? errorId : undefined}
                          onChange={(event) => updateRow(row.id, { name: event.target.value })}
                        />
                      </div>
                      <div className="relative w-28 shrink-0 sm:w-36">
                        <label htmlFor={valueId} className="sr-only">
                          {row.name.trim() ? `${row.name.trim()} value` : `Metric ${index + 1} value`}
                          {percent ? " in percent" : unit ? ` in ${unit}` : ""}
                        </label>
                        <Input
                          id={valueId}
                          inputMode="decimal"
                          value={row.value}
                          placeholder={percent ? "61" : "0.61"}
                          invalid={Boolean(rowError)}
                          aria-describedby={rowError ? errorId : undefined}
                          className={cn("tabular-nums", (percent || unit) && "pr-10")}
                          onChange={(event) => updateRow(row.id, { value: event.target.value })}
                        />
                        {percent || unit ? (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-fg-muted"
                          >
                            {percent ? "%" : unit}
                          </span>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-10 shrink-0 sm:size-9"
                        aria-label={row.name.trim() ? `Remove ${row.name.trim()}` : `Remove metric ${index + 1}`}
                        onClick={() => removeRow(row.id)}
                      >
                        <X aria-hidden />
                      </Button>
                    </div>
                    {rowError ? (
                      <p id={errorId} role="alert" className="mt-1 text-xs text-danger">
                        {rowError}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {errors.metrics ? (
              <p role="alert" className="text-xs text-danger">
                {errors.metrics}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => addRow()}
                disabled={rows.length >= EVAL_METRICS_MAX}
              >
                <Plus aria-hidden />
                Add metric
              </Button>
              {missingScorecard.slice(0, 6).map((metric) => (
                <Button
                  key={metric.name}
                  variant="ghost"
                  size="sm"
                  onClick={() => addRow(metric.name)}
                  disabled={rows.length >= EVAL_METRICS_MAX}
                  aria-label={`Add scorecard metric ${metric.name}`}
                >
                  <Plus aria-hidden />
                  {metric.name}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4">
            <FormField
              label="Trace or report link"
              htmlFor={field("url")}
              error={errors.external_url}
              hint="Langfuse, W&B, a notebook or a sheet."
            >
              <Input
                id={field("url")}
                type="url"
                inputMode="url"
                value={draft.external_url}
                placeholder="https://"
                invalid={Boolean(errors.external_url)}
                aria-describedby={describedBy("external_url", true)}
                onChange={(event) => update("external_url", event.target.value)}
              />
            </FormField>
            <FormField label="Notes" htmlFor={field("notes")} error={errors.notes}>
              <Textarea
                id={field("notes")}
                rows={3}
                value={draft.notes}
                maxLength={EVAL_NOTES_MAX}
                placeholder="What changed, failure modes you saw, what to try next."
                onChange={(event) => update("notes", event.target.value)}
              />
            </FormField>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              {mode === "create" ? "Log run" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
