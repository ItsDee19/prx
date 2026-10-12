"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { createBatchAction, updateBatchAction } from "@/actions/batches";
import {
  AGREEMENT_METRIC_CONFIG,
  BATCH_STATUS_CONFIG,
  BATCH_STATUS_ORDER,
  BATCH_UNIT_TYPE_CONFIG,
  MAX_DB_INT,
} from "@/lib/constants";
import { BATCH_GUIDELINE_MAX, BATCH_NAME_MAX, BATCH_NOTES_MAX } from "@/lib/schemas/batches";
import {
  AGREEMENT_METRICS,
  BATCH_UNIT_TYPES,
  type AgreementMetric,
  type BatchStatus,
  type BatchUnitType,
  type CreateBatchInput,
  type DataBatch,
  type MilestoneRef,
  type UpdateBatchInput,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  agreementToInput,
  fractionToInput,
  inputToAgreement,
  inputToFraction,
} from "./batch-utils";

interface Draft {
  is_calibration: boolean;
  number: string;
  name: string;
  unit_type: BatchUnitType;
  units_target: string;
  units_delivered: string;
  units_accepted: string;
  status: BatchStatus;
  due_date: string;
  gold_accuracy: string;
  quality_threshold: string;
  agreement_metric: AgreementMetric | "";
  agreement_score: string;
  agreement_threshold: string;
  guideline_version: string;
  milestone_id: string;
  notes: string;
}

export interface BatchDialogProps {
  mode: "create" | "edit";
  projectId: string;
  /** Required in edit mode. */
  batch?: DataBatch | null;
  /** Another batch of the project is already the calibration batch. */
  calibrationTaken: boolean;
  /** Prefills for a new batch (e.g. the calibration banner's "Plan calibration batch"). */
  defaults?: Partial<Pick<Draft, "is_calibration" | "unit_type" | "quality_threshold">>;
  milestones: MilestoneRef[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function draftFrom(batch: DataBatch | null | undefined, defaults: BatchDialogProps["defaults"]): Draft {
  return {
    is_calibration: batch?.is_calibration ?? defaults?.is_calibration ?? false,
    number: batch ? String(batch.number) : "",
    name: batch?.name ?? "",
    unit_type: batch?.unit_type ?? defaults?.unit_type ?? "records",
    units_target: batch ? String(batch.units_target) : "",
    units_delivered: batch ? String(batch.units_delivered) : "",
    units_accepted: batch ? String(batch.units_accepted) : "",
    status: batch?.status ?? "planned",
    due_date: batch?.due_date ?? "",
    gold_accuracy: fractionToInput(batch?.gold_accuracy ?? null),
    quality_threshold: batch ? fractionToInput(batch.quality_threshold) : (defaults?.quality_threshold ?? ""),
    agreement_metric: batch?.agreement_metric ?? "",
    agreement_score: agreementToInput(batch?.agreement_score ?? null, batch?.agreement_metric ?? null),
    agreement_threshold: agreementToInput(batch?.agreement_threshold ?? null, batch?.agreement_metric ?? null),
    guideline_version: batch?.guideline_version ?? "",
    milestone_id: batch?.milestone_id ?? "",
    notes: batch?.notes ?? "",
  };
}

/** Whole number from a text field ("2,000" -> 2000); undefined when invalid, null when empty. */
function parseCount(text: string): number | null | undefined {
  const cleaned = text.trim().replace(/[,\s_]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+$/.test(cleaned)) return undefined;
  const value = Number(cleaned);
  return value <= MAX_DB_INT ? value : undefined;
}

/**
 * Add / edit a data batch: calibration flag, number and name, unit type,
 * planned / delivered / accepted units, status and due date, gold-set
 * accuracy against the quality threshold (percentages), the agreement metric
 * with its score and threshold, guideline version, phase and notes.
 */
export function BatchDialog({
  mode,
  projectId,
  batch,
  calibrationTaken,
  defaults,
  milestones,
  open,
  onOpenChange,
}: BatchDialogProps) {
  const router = useRouter();
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(batch, defaults));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const field = (name: string) => `${id}-${name}`;

  const openKey = open ? `open:${batch?.id ?? "new"}:${defaults?.is_calibration ? "cal" : ""}` : "closed";
  const [shownKey, setShownKey] = useState(openKey);
  if (shownKey !== openKey) {
    setShownKey(openKey);
    if (open) {
      setDraft(draftFrom(batch, defaults));
      setErrors({});
    }
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      // Accepting a delivered batch: start from "everything delivered was accepted".
      if (key === "status" && value === "accepted" && (current.units_accepted.trim() === "" || current.units_accepted.trim() === "0")) {
        const delivered = parseCount(current.units_delivered);
        if (typeof delivered === "number" && delivered > 0) next.units_accepted = String(delivered);
      }
      return next;
    });
    if (errors[key]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  function validate(): Omit<CreateBatchInput, "project_id"> | null {
    const next: Record<string, string> = {};
    const number = parseCount(draft.number);
    if (number === undefined) next.number = "Use a whole number";
    const target = parseCount(draft.units_target);
    if (target === undefined || target === null || target < 1) next.units_target = "Plan at least 1 unit";
    const delivered = parseCount(draft.units_delivered);
    if (delivered === undefined) next.units_delivered = "Use a whole number";
    const accepted = parseCount(draft.units_accepted);
    if (accepted === undefined) next.units_accepted = "Use a whole number";
    if (typeof accepted === "number" && accepted > (delivered ?? 0)) {
      next.units_accepted = "Accepted units cannot exceed delivered units";
    }
    const gold = inputToFraction(draft.gold_accuracy);
    if (gold === undefined || (gold !== null && (gold < 0 || gold > 1))) next.gold_accuracy = "Enter 0 to 100";
    const threshold = inputToFraction(draft.quality_threshold);
    if (threshold === undefined || (threshold !== null && (threshold < 0 || threshold > 1))) {
      next.quality_threshold = "Enter 0 to 100";
    }
    const metric = draft.agreement_metric || null;
    const percentScale = metric === "percent";
    const score = inputToAgreement(draft.agreement_score, metric);
    const scoreRangeError = percentScale ? "Enter 0 to 100" : "Enter -1 to 1";
    if (score === undefined || (score !== null && (score < (percentScale ? 0 : -1) || score > 1))) {
      next.agreement_score = scoreRangeError;
    }
    const agreementThreshold = inputToAgreement(draft.agreement_threshold, metric);
    if (
      agreementThreshold === undefined ||
      (agreementThreshold !== null && (agreementThreshold < (percentScale ? 0 : -1) || agreementThreshold > 1))
    ) {
      next.agreement_threshold = scoreRangeError;
    }
    if (!metric && (draft.agreement_score.trim() || draft.agreement_threshold.trim())) {
      next.agreement_metric = "Choose the agreement metric";
    }
    if (draft.is_calibration && calibrationTaken && !(batch?.is_calibration ?? false)) {
      next.is_calibration = "This project already has a calibration batch";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return null;
    return {
      ...(number !== null && number !== undefined ? { number } : {}),
      is_calibration: draft.is_calibration,
      name: draft.name.trim(),
      unit_type: draft.unit_type,
      units_target: target as number,
      units_delivered: delivered ?? 0,
      units_accepted: accepted ?? 0,
      status: draft.status,
      due_date: draft.due_date || null,
      gold_accuracy: gold ?? null,
      quality_threshold: threshold ?? null,
      agreement_metric: metric,
      agreement_score: score ?? null,
      agreement_threshold: agreementThreshold ?? null,
      guideline_version: draft.guideline_version.trim(),
      milestone_id: draft.milestone_id || null,
      notes: draft.notes.trim(),
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = validate();
    if (!values) return;
    setPending(true);
    try {
      if (mode === "create") {
        const result = await createBatchAction({ project_id: projectId, ...values });
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          toast.error(result.error);
          return;
        }
        toast.success(`Added ${result.data.is_calibration ? "the calibration batch" : `Batch ${result.data.number}`}`);
      } else {
        if (!batch) return;
        const patch: UpdateBatchInput = { ...values };
        if (draft.number.trim() === "") delete patch.number;
        const result = await updateBatchAction(batch.id, patch);
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
      toast.error("Could not save the batch. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const err = (name: string) => (errors[name] ? `${field(name)}-error` : undefined);
  const unit = BATCH_UNIT_TYPE_CONFIG[draft.unit_type];
  const agreementPercent = draft.agreement_metric === "percent";
  const calibrationLocked = calibrationTaken && !(batch?.is_calibration ?? false);

  const countInput = (name: "units_target" | "units_delivered" | "units_accepted", label: string, required = false) => (
    <FormField label={label} htmlFor={field(name)} error={errors[name]} required={required}>
      <Input
        id={field(name)}
        inputMode="numeric"
        value={draft[name]}
        placeholder="0"
        invalid={Boolean(errors[name])}
        aria-describedby={err(name)}
        className="tabular-nums"
        onChange={(event) => update(name, event.target.value)}
      />
    </FormField>
  );

  const percentInput = (name: "gold_accuracy" | "quality_threshold", label: string, hint?: string) => (
    <FormField label={label} htmlFor={field(name)} error={errors[name]} hint={hint}>
      <div className="relative">
        <Input
          id={field(name)}
          inputMode="decimal"
          value={draft[name]}
          placeholder="95"
          invalid={Boolean(errors[name])}
          aria-describedby={err(name) ?? (hint ? `${field(name)}-hint` : undefined)}
          className="pr-8 tabular-nums"
          onChange={(event) => update(name, event.target.value)}
        />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-fg-muted">
          %
        </span>
      </div>
    </FormField>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => (!pending ? onOpenChange(next) : undefined)}>
      <DialogContent
        size="lg"
        title={mode === "create" ? (draft.is_calibration ? "Plan the calibration batch" : "Add batch") : `Edit Batch ${batch?.number ?? ""}`}
        description="Units are counted in the batch's unit type. Accuracy and thresholds are percentages."
      >
        <form onSubmit={submit} noValidate className="space-y-5">
          <div
            className={cn(
              "flex items-start justify-between gap-4 rounded-xl border px-3 py-3",
              draft.is_calibration ? "border-accent/40 bg-accent-soft/40" : "border-border bg-surface-2/40",
            )}
          >
            <div className="min-w-0">
              <label htmlFor={field("calibration")} className="text-sm font-medium text-fg">
                Calibration batch
              </label>
              <p id={`${field("calibration")}-hint`} className="mt-0.5 text-xs text-fg-muted">
                {calibrationLocked
                  ? "Another batch is this project's calibration batch."
                  : "The paid pilot batch. Production batches should wait until it is accepted."}
              </p>
              {errors.is_calibration ? (
                <p role="alert" className="mt-1 text-xs text-danger">
                  {errors.is_calibration}
                </p>
              ) : null}
            </div>
            <Switch
              id={field("calibration")}
              checked={draft.is_calibration}
              disabled={calibrationLocked}
              onCheckedChange={(checked) => update("is_calibration", checked)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Number" htmlFor={field("number")} error={errors.number} hint={mode === "create" ? "Leave empty to use the next number." : undefined}>
              <Input
                id={field("number")}
                inputMode="numeric"
                value={draft.number}
                placeholder="Auto"
                invalid={Boolean(errors.number)}
                aria-describedby={err("number") ?? (mode === "create" ? `${field("number")}-hint` : undefined)}
                className="tabular-nums"
                onChange={(event) => update("number", event.target.value)}
              />
            </FormField>
            <FormField label="Name" htmlFor={field("name")} error={errors.name}>
              <Input
                id={field("name")}
                value={draft.name}
                maxLength={BATCH_NAME_MAX}
                placeholder="What this batch contains"
                onChange={(event) => update("name", event.target.value)}
              />
            </FormField>

            <FormField label="Unit type" htmlFor={field("unit")}>
              <NativeSelect
                id={field("unit")}
                value={draft.unit_type}
                onChange={(event) => update("unit_type", event.target.value as BatchUnitType)}
              >
                {BATCH_UNIT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {BATCH_UNIT_TYPE_CONFIG[type].label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Status" htmlFor={field("status")}>
              <NativeSelect
                id={field("status")}
                value={draft.status}
                onChange={(event) => update("status", event.target.value as BatchStatus)}
              >
                {BATCH_STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {BATCH_STATUS_CONFIG[status].label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>

          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-medium text-fg">Units ({unit.plural})</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {countInput("units_target", "Planned", true)}
              {countInput("units_delivered", "Delivered")}
              {countInput("units_accepted", "Accepted")}
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-medium text-fg">Quality</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {percentInput("gold_accuracy", "Gold-set accuracy")}
              {percentInput("quality_threshold", "Accuracy threshold", "The agreed minimum, e.g. 95%.")}
              <FormField label="Agreement metric" htmlFor={field("agreement_metric")} error={errors.agreement_metric}>
                <NativeSelect
                  id={field("agreement_metric")}
                  value={draft.agreement_metric}
                  invalid={Boolean(errors.agreement_metric)}
                  onChange={(event) => update("agreement_metric", event.target.value as AgreementMetric | "")}
                >
                  <option value="">Not measured</option>
                  {AGREEMENT_METRICS.map((metric) => (
                    <option key={metric} value={metric}>
                      {AGREEMENT_METRIC_CONFIG[metric].label}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                {(["agreement_score", "agreement_threshold"] as const).map((name) => (
                  <FormField
                    key={name}
                    label={name === "agreement_score" ? "Score" : "Threshold"}
                    htmlFor={field(name)}
                    error={errors[name]}
                  >
                    <div className="relative">
                      <Input
                        id={field(name)}
                        inputMode="decimal"
                        value={draft[name]}
                        disabled={!draft.agreement_metric}
                        placeholder={agreementPercent ? "90" : "0.8"}
                        invalid={Boolean(errors[name])}
                        aria-describedby={err(name)}
                        className={cn("tabular-nums", agreementPercent && "pr-8")}
                        onChange={(event) => update(name, event.target.value)}
                      />
                      {agreementPercent ? (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-fg-muted"
                        >
                          %
                        </span>
                      ) : null}
                    </div>
                  </FormField>
                ))}
              </div>
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Due date" htmlFor={field("due")}>
              <Input
                id={field("due")}
                type="date"
                value={draft.due_date}
                onChange={(event) => update("due_date", event.target.value)}
              />
            </FormField>
            <FormField label="Guideline version" htmlFor={field("guideline")}>
              <Input
                id={field("guideline")}
                value={draft.guideline_version}
                maxLength={BATCH_GUIDELINE_MAX}
                placeholder="Guideline version"
                onChange={(event) => update("guideline_version", event.target.value)}
              />
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
            <FormField label="Notes" htmlFor={field("notes")} className="sm:col-span-2">
              <Textarea
                id={field("notes")}
                rows={3}
                value={draft.notes}
                maxLength={BATCH_NOTES_MAX}
                placeholder="Rejection reasons, corrections, client feedback."
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
              {mode === "create" ? "Add batch" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
