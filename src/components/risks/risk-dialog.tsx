"use client";

import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createRiskAction, updateRiskAction } from "@/actions/risks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { UserPicker } from "@/components/ui/user-picker";
import {
  RISK_CATEGORY_CONFIG,
  RISK_CATEGORY_ORDER,
  RISK_IMPACT_LABELS,
  RISK_KIND_CONFIG,
  RISK_KIND_ORDER,
  RISK_LIKELIHOOD_LABELS,
  RISK_STATUS_CONFIG,
} from "@/lib/constants";
import { createRiskSchema, RISK_TITLE_MAX } from "@/lib/schemas/risks";
import {
  RISK_STATUSES,
  type CreateRiskInput,
  type Risk,
  type RiskCategory,
  type RiskKind,
  type RiskStatus,
  type UpdateRiskInput,
  type UserSummary,
} from "@/lib/types";
import { fieldErrorsFromIssues } from "@/lib/validation";
import { RiskScoreBadge } from "./risk-score-badge";
import { dueDateLabel } from "./risk-utils";
import { ScalePicker } from "./scale-picker";

export interface RiskDialogProps {
  mode: "create" | "edit";
  projectId: string;
  /** Required in edit mode. */
  risk?: Risk;
  users: UserSummary[];
  /** Single element that opens the dialog (rendered with `asChild`). Optional when controlled. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Create-mode defaults (e.g. the kind tab that is open). */
  defaultKind?: RiskKind;
  onSaved?: (risk: Risk) => void;
}

interface Values {
  kind: RiskKind;
  category: RiskCategory;
  title: string;
  description: string;
  likelihood: number | null;
  impact: number | null;
  owner_id: string | null;
  mitigation: string;
  status: RiskStatus;
  review_date: string;
  due_date: string;
}

function initialValues(risk: Risk | undefined, defaultKind: RiskKind): Values {
  return {
    kind: risk?.kind ?? defaultKind,
    category: risk?.category ?? "other",
    title: risk?.title ?? "",
    description: risk?.description ?? "",
    likelihood: risk?.likelihood ?? null,
    impact: risk?.impact ?? null,
    owner_id: risk?.owner_id ?? null,
    mitigation: risk?.mitigation ?? "",
    status: risk?.status ?? "open",
    review_date: risk?.review_date ?? "",
    due_date: risk?.due_date ?? "",
  };
}

/**
 * Create or edit a RAID item: type, AI-work category, title, description,
 * likelihood x impact (live score), owner, status, mitigation, review date and
 * due / confirm-by date. Assigning an owner notifies them (risk_assigned).
 */
export function RiskDialog({
  mode,
  projectId,
  risk,
  users,
  trigger,
  open: controlledOpen,
  onOpenChange,
  defaultKind = "risk",
  onSaved,
}: RiskDialogProps) {
  const router = useRouter();
  const baseId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [values, setValues] = useState<Values>(() => initialValues(risk, defaultKind));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const id = (key: string) => `${baseId}-${key}`;

  function setOpen(next: boolean) {
    if (pending) return;
    if (next) {
      setValues(initialValues(risk, defaultKind));
      setErrors({});
    }
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: "" }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: UpdateRiskInput = {
      kind: values.kind,
      category: values.category,
      title: values.title,
      description: values.description,
      likelihood: values.likelihood,
      impact: values.impact,
      owner_id: values.owner_id,
      mitigation: values.mitigation,
      status: values.status,
      review_date: values.review_date || null,
      due_date: values.due_date || null,
    };
    const input: CreateRiskInput = { project_id: projectId, title: values.title, ...patch };
    const parsed = createRiskSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      const firstKey = parsed.error.issues[0]?.path[0];
      if (typeof firstKey === "string") document.getElementById(id(firstKey))?.focus();
      return;
    }
    startTransition(async () => {
      const result =
        mode === "edit" && risk ? await updateRiskAction(risk.id, patch) : await createRiskAction(input);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success(
        mode === "edit"
          ? "Saved."
          : `${RISK_KIND_CONFIG[result.data.kind].label} added.${result.data.owner_id && result.data.owner_id !== risk?.owner_id ? " The owner has been notified." : ""}`,
      );
      if (controlledOpen === undefined) setUncontrolledOpen(false);
      onOpenChange?.(false);
      onSaved?.(result.data);
      router.refresh();
    });
  }

  const kindConfig = RISK_KIND_CONFIG[values.kind];
  const isDecision = values.kind === "decision";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        size="lg"
        title={mode === "edit" ? `Edit ${kindConfig.label.toLowerCase()}` : "Add to the RAID log"}
        description={kindConfig.description}
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Type" htmlFor={id("kind")} error={errors.kind}>
              <NativeSelect
                id={id("kind")}
                value={values.kind}
                onChange={(event) => set("kind", event.target.value as RiskKind)}
              >
                {RISK_KIND_ORDER.map((kind) => (
                  <option key={kind} value={kind}>
                    {RISK_KIND_CONFIG[kind].label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField
              label="Category"
              htmlFor={id("category")}
              error={errors.category}
              hint={RISK_CATEGORY_CONFIG[values.category].description}
            >
              <NativeSelect
                id={id("category")}
                value={values.category}
                onChange={(event) => set("category", event.target.value as RiskCategory)}
                aria-describedby={`${id("category")}-hint`}
              >
                {RISK_CATEGORY_ORDER.map((category) => (
                  <option key={category} value={category}>
                    {RISK_CATEGORY_CONFIG[category].label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>

          <FormField label="Title" htmlFor={id("title")} required error={errors.title}>
            <Input
              id={id("title")}
              value={values.title}
              onChange={(event) => set("title", event.target.value)}
              maxLength={RISK_TITLE_MAX}
              invalid={Boolean(errors.title)}
              placeholder={
                values.kind === "dependency"
                  ? "Client call recordings not yet received"
                  : values.kind === "decision"
                    ? "Use GPT-4.1 mini for intent routing"
                    : "Model accuracy below target on regional accents"
              }
              autoFocus
            />
          </FormField>

          <FormField label="Description" htmlFor={id("description")} error={errors.description}>
            <Textarea
              id={id("description")}
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
              rows={2}
              className="field-sizing-content max-h-60"
            />
          </FormField>

          {!isDecision ? (
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p id={id("likelihood-label")} className="text-sm font-medium text-fg">
                    Likelihood
                  </p>
                  <ScalePicker
                    id={id("likelihood")}
                    aria-labelledby={id("likelihood-label")}
                    value={values.likelihood}
                    onChange={(value) => set("likelihood", value)}
                    labels={RISK_LIKELIHOOD_LABELS}
                  />
                </div>
                <div className="space-y-1.5">
                  <p id={id("impact-label")} className="text-sm font-medium text-fg">
                    Impact
                  </p>
                  <ScalePicker
                    id={id("impact")}
                    aria-labelledby={id("impact-label")}
                    value={values.impact}
                    onChange={(value) => set("impact", value)}
                    labels={RISK_IMPACT_LABELS}
                  />
                </div>
              </div>
              <p className="mt-3 flex items-center gap-2 text-xs text-fg-muted" aria-live="polite">
                Score
                <RiskScoreBadge likelihood={values.likelihood} impact={values.impact} />
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p id={id("owner-label")} className="text-sm font-medium text-fg">
                Owner
              </p>
              <UserPicker
                users={users}
                value={values.owner_id}
                onChange={(value) => set("owner_id", value)}
                allowUnassigned
                placeholder="No owner"
                aria-label="Owner"
              />
              {errors.owner_id ? (
                <p role="alert" className="text-xs text-danger">
                  {errors.owner_id}
                </p>
              ) : null}
            </div>
            <FormField label="Status" htmlFor={id("status")} error={errors.status}>
              <NativeSelect
                id={id("status")}
                value={values.status}
                onChange={(event) => set("status", event.target.value as RiskStatus)}
              >
                {RISK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {RISK_STATUS_CONFIG[status].label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>

          <FormField
            label={isDecision ? "Rationale" : values.kind === "issue" ? "Response plan" : "Mitigation"}
            htmlFor={id("mitigation")}
            error={errors.mitigation}
          >
            <Textarea
              id={id("mitigation")}
              value={values.mitigation}
              onChange={(event) => set("mitigation", event.target.value)}
              rows={2}
              className="field-sizing-content max-h-60"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Review date"
              htmlFor={id("review_date")}
              error={errors.review_date}
              hint="When the team looks at this again."
            >
              <Input
                id={id("review_date")}
                type="date"
                value={values.review_date}
                onChange={(event) => set("review_date", event.target.value)}
                invalid={Boolean(errors.review_date)}
                aria-describedby={`${id("review_date")}-hint`}
              />
            </FormField>
            <FormField
              label={values.kind === "dependency" || values.kind === "assumption" ? "Confirm by" : "Due date"}
              htmlFor={id("due_date")}
              error={errors.due_date}
              hint={
                dueDateLabel(values.kind) === "Confirm by"
                  ? "When it must be confirmed or received."
                  : "When it must be resolved."
              }
            >
              <Input
                id={id("due_date")}
                type="date"
                value={values.due_date}
                onChange={(event) => set("due_date", event.target.value)}
                invalid={Boolean(errors.due_date)}
                aria-describedby={`${id("due_date")}-hint`}
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
              {mode === "edit" ? "Save" : `Add ${kindConfig.label.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
