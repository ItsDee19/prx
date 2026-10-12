"use client";

import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { createMetricAction, updateMetricAction } from "@/actions/scorecard";
import { METRIC_PRESETS, type MetricPreset, type MetricPresetMetric } from "@/lib/constants";
import { METRIC_NAME_MAX, METRIC_NOTES_MAX, METRIC_REASON_MAX, METRIC_UNIT_MAX } from "@/lib/schemas/scorecard";
import type { MetricDirection, ServiceLine, SuccessMetric } from "@/lib/types";
import { cn, formatDate, formatMetricValue } from "@/lib/utils";
import { METRIC_UNIT_SUGGESTIONS, parseInputValue, toInputValue } from "./metric-values";

export interface MetricDialogProps {
  projectId: string;
  /** Edit this metric; omit to add a new one. */
  metric?: SuccessMetric | null;
  /** Presets for this service line are offered first. */
  serviceLine: ServiceLine | null;
  /** Names already on the scorecard (presets with these names are disabled). */
  existingNames: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional trigger element (rendered with asChild). */
  trigger?: ReactNode;
}

const DIRECTION_OPTIONS = [
  { value: "higher" as const, label: "Higher is better", icon: TrendingUp },
  { value: "lower" as const, label: "Lower is better", icon: TrendingDown },
];

type ValueKey = "baseline" | "target" | "current";

/** Visual order of the fields, for focusing the first invalid one. */
const FIELD_ORDER = ["name", "unit", "baseline", "target", "current", "reason"] as const;

/** Presets ordered so the ones for this service line come first. */
function orderedPresets(serviceLine: ServiceLine | null): MetricPreset[] {
  const presets = [...METRIC_PRESETS];
  if (!serviceLine) return presets;
  return presets.sort(
    (a, b) => Number(b.service_lines.includes(serviceLine)) - Number(a.service_lines.includes(serviceLine)),
  );
}

/**
 * Add or edit a scorecard metric. New metrics can start from METRIC_PRESETS
 * (grouped by kind of system, the project's service line first). "%" values
 * are typed as percentages and stored as fractions. Editing the baseline,
 * target or direction of a locked metric asks for a reason (logged).
 */
export function MetricDialog({ projectId, metric, serviceLine, existingNames, open, onOpenChange, trigger }: MetricDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        size="lg"
        title={metric ? `Edit ${metric.name}` : "Add a success metric"}
        description={
          metric
            ? "Update the measurement or the agreed goal."
            : "Agree one to three measurable metrics with the client before the Pilot starts."
        }
      >
        {/* Mounted only while open, so every opening starts from the metric's saved values. */}
        <MetricForm
          projectId={projectId}
          metric={metric ?? null}
          serviceLine={serviceLine}
          existingNames={existingNames}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface MetricFormProps {
  projectId: string;
  metric: SuccessMetric | null;
  serviceLine: ServiceLine | null;
  existingNames: string[];
  onDone: () => void;
}

function MetricForm({ projectId, metric, serviceLine, existingNames, onDone }: MetricFormProps) {
  const router = useRouter();
  const uid = useId();
  const presets = useMemo(() => orderedPresets(serviceLine), [serviceLine]);
  const [presetKey, setPresetKey] = useState(presets[0]?.key ?? "");
  const initial = useMemo(
    () => ({
      name: metric?.name ?? "",
      unit: metric?.unit ?? "",
      direction: (metric?.direction ?? "higher") as MetricDirection,
      baseline: toInputValue(metric?.baseline, metric?.unit ?? ""),
      target: toInputValue(metric?.target, metric?.unit ?? ""),
      current: toInputValue(metric?.current, metric?.unit ?? ""),
      notes: metric?.notes ?? "",
    }),
    [metric],
  );
  const [name, setName] = useState(initial.name);
  const [unit, setUnit] = useState(initial.unit);
  const [direction, setDirection] = useState<MetricDirection>(initial.direction);
  const [values, setValues] = useState<Record<ValueKey, string>>({
    baseline: initial.baseline,
    target: initial.target,
    current: initial.current,
  });
  const [notes, setNotes] = useState(initial.notes);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const taken = useMemo(
    () => new Set(existingNames.filter((n) => n.toLowerCase() !== (metric?.name ?? "").toLowerCase()).map((n) => n.toLowerCase())),
    [existingNames, metric],
  );
  const activePreset = presets.find((preset) => preset.key === presetKey) ?? presets[0];
  const unitTrimmed = unit.trim();
  const isPercent = unitTrimmed === "%";
  const unitChanged = unitTrimmed !== initial.unit;

  /** Parsed value; untouched fields keep their saved value exactly (no rounding drift). */
  function valueOf(key: ValueKey): number | null | undefined {
    if (metric && !unitChanged && values[key] === initial[key]) return metric[key];
    return parseInputValue(values[key], unitTrimmed);
  }

  const goalChanged =
    metric !== null &&
    (valueOf("baseline") !== metric.baseline || valueOf("target") !== metric.target || direction !== metric.direction);
  const needsReason = metric !== null && metric.locked_at !== null && goalChanged;

  function applyPreset(item: MetricPresetMetric) {
    setName(item.name);
    setUnit(item.unit);
    setDirection(item.direction);
    setValues((current) => ({ ...current, target: toInputValue(item.target, item.unit) }));
    setErrors({});
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    const trimmed = name.trim();
    if (!trimmed) next.name = "Name the metric";
    else if (trimmed.length > METRIC_NAME_MAX) next.name = `Names must be ${METRIC_NAME_MAX} characters or fewer`;
    else if (taken.has(trimmed.toLowerCase())) next.name = "A metric with this name already exists.";
    if (unitTrimmed.length > METRIC_UNIT_MAX) next.unit = `Units must be ${METRIC_UNIT_MAX} characters or fewer`;
    for (const key of ["baseline", "target", "current"] as const) {
      const parsed = valueOf(key);
      if (parsed === undefined) next[key] = "Enter a number";
      else if (key === "target" && parsed === null) next.target = "Set the target";
      else if (isPercent && parsed !== null && (parsed < 0 || parsed > 1)) next[key] = "Use 0 to 100%";
    }
    if (needsReason && !reason.trim()) next.reason = "Say why the goal changes after the scorecard was locked";
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = FIELD_ORDER.find((key) => found[key]);
      if (first) document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }

    const baseline = valueOf("baseline") ?? null;
    const target = valueOf("target") as number;
    const current = valueOf("current") ?? null;
    setPending(true);
    try {
      const result = metric
        ? await updateMetricAction(metric.id, {
            name: name.trim(),
            unit: unitTrimmed,
            direction,
            baseline,
            target,
            current,
            notes: notes.trim(),
            ...(needsReason ? { reason: reason.trim() } : {}),
          })
        : await createMetricAction({
            project_id: projectId,
            name: name.trim(),
            unit: unitTrimmed,
            direction,
            baseline,
            target,
            current,
            notes: notes.trim(),
          });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error);
        return;
      }
      toast.success(metric ? `Saved ${result.data.name}` : `Added ${result.data.name}`);
      router.refresh();
      onDone();
    } catch {
      toast.error("Could not save the metric. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const fieldId = (key: string) => `${uid}-${key}`;
  const describedBy = (key: string, hint = false) =>
    errors[key] ? `${fieldId(key)}-error` : hint ? `${fieldId(key)}-hint` : undefined;

  function valueInput(key: ValueKey, label: string, hint?: ReactNode) {
    return (
      <FormField label={label} htmlFor={fieldId(key)} error={errors[key]} hint={hint} required={key === "target"}>
        <div className="relative">
          <Input
            id={fieldId(key)}
            inputMode="decimal"
            autoComplete="off"
            value={values[key]}
            invalid={Boolean(errors[key])}
            aria-describedby={describedBy(key, Boolean(hint))}
            onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
            placeholder={key === "target" ? (isPercent ? "65" : "0.8") : "—"}
            className={cn("tabular-nums", unitTrimmed && "pr-12")}
          />
          {unitTrimmed ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-fg-muted"
            >
              {unitTrimmed}
            </span>
          ) : null}
        </div>
      </FormField>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {!metric && activePreset ? (
        <section aria-labelledby={`${uid}-presets`} className="rounded-2xl border border-border bg-surface-2/50 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 id={`${uid}-presets`} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              <Sparkles className="size-3.5 text-accent-2" aria-hidden />
              Start from a preset
            </h4>
            <div role="group" aria-label="Kind of system" className="flex flex-wrap gap-1">
              {presets.map((preset) => {
                const active = preset.key === activePreset.key;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPresetKey(preset.key)}
                    className={cn(
                      "h-7 rounded-full px-2.5 text-xs font-medium outline-none transition-control active:scale-[0.97] pointer-coarse:h-9",
                      "focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "bg-accent-soft text-accent-soft-fg ring-1 ring-inset ring-accent/30" : "text-fg-muted hover:bg-fg/[0.06] hover:text-fg",
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label={`${activePreset.label} metrics`}>
            {activePreset.metrics.map((item) => {
              const used = taken.has(item.name.toLowerCase());
              const selected = name.trim().toLowerCase() === item.name.toLowerCase();
              return (
                <li key={item.name}>
                  <button
                    type="button"
                    disabled={used}
                    aria-pressed={selected}
                    onClick={() => applyPreset(item)}
                    className={cn(
                      "group inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] outline-none transition-control active:scale-[0.97] pointer-coarse:h-10",
                      "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                      selected
                        ? "border-accent bg-accent-soft text-accent-soft-fg"
                        : "border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2",
                    )}
                  >
                    {item.direction === "higher" ? (
                      <TrendingUp className="size-3.5 text-success" aria-hidden />
                    ) : (
                      <TrendingDown className="size-3.5 text-accent" aria-hidden />
                    )}
                    <span>{item.name}</span>
                    <span className="tabular-nums text-fg-muted">
                      {item.direction === "higher" ? "≥" : "≤"} {formatMetricValue(item.target, item.unit)}
                    </span>
                    {used ? <span className="sr-only">(already on the scorecard)</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {metric?.locked_at ? (
        <p className="flex items-start gap-2 rounded-xl bg-accent-soft/60 px-3 py-2.5 text-sm text-fg ring-1 ring-inset ring-accent/20">
          <Lock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <span>
            Locked on {formatDate(metric.locked_at)}. You can update the current value freely; changing the baseline,
            target or direction needs a reason, which is logged.
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" htmlFor={fieldId("name")} error={errors.name} required className="sm:col-span-2">
          <Input
            id={fieldId("name")}
            value={name}
            maxLength={METRIC_NAME_MAX}
            invalid={Boolean(errors.name)}
            aria-describedby={describedBy("name")}
            onChange={(event) => setName(event.target.value)}
            placeholder="Metric name"
            autoComplete="off"
          />
        </FormField>
        <FormField
          label="Unit"
          htmlFor={fieldId("unit")}
          error={errors.unit}
          hint={isPercent ? "Type percentages (65 for 65%)." : "Optional, e.g. %, ms, h."}
        >
          <Input
            id={fieldId("unit")}
            value={unit}
            maxLength={METRIC_UNIT_MAX}
            list={`${uid}-units`}
            invalid={Boolean(errors.unit)}
            aria-describedby={describedBy("unit", true)}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="%"
            autoComplete="off"
          />
          <datalist id={`${uid}-units`}>
            {METRIC_UNIT_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </FormField>
        <div className="space-y-1.5">
          <span id={`${uid}-direction`} className="block text-sm font-medium leading-5 text-fg">
            Direction
          </span>
          <SegmentedControl
            value={direction}
            onChange={setDirection}
            options={DIRECTION_OPTIONS}
            ariaLabel="Direction"
            className="w-full [&>button]:flex-1"
          />
        </div>
        {valueInput("baseline", "Baseline", "Where the client starts today.")}
        {valueInput("target", "Target", "Agreed with the client.")}
        {valueInput(
          "current",
          "Current",
          metric?.current_measured_at ? `Last measured ${formatDate(metric.current_measured_at)}.` : "Latest measurement, if any.",
        )}
        <FormField label="Notes" htmlFor={fieldId("notes")} className="sm:col-span-2">
          <Textarea
            id={fieldId("notes")}
            rows={2}
            maxLength={METRIC_NOTES_MAX}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="How it is measured, data source, sample size."
          />
        </FormField>
        {needsReason ? (
          <FormField
            label="Reason for the change"
            htmlFor={fieldId("reason")}
            error={errors.reason}
            required
            hint="Shown in the project activity."
            className="reveal sm:col-span-2"
          >
            <Textarea
              id={fieldId("reason")}
              rows={2}
              maxLength={METRIC_REASON_MAX}
              value={reason}
              invalid={Boolean(errors.reason)}
              aria-describedby={describedBy("reason", true)}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why the target changed."
            />
          </FormField>
        ) : null}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" loading={pending}>
          {metric ? "Save metric" : "Add metric"}
        </Button>
      </DialogFooter>
    </form>
  );
}
