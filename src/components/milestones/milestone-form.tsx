"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ICONS } from "@/components/ui/icon";
import { createMilestoneAction, updateMilestoneAction } from "@/actions/milestones";
import { CURRENCY_CONFIG, INVOICE_STATUS_CONFIG, MILESTONE_KIND_CONFIG } from "@/lib/constants";
import { MILESTONE_DESCRIPTION_MAX, MILESTONE_NAME_MAX } from "@/lib/schemas/milestones";
import { parseMoneyInput } from "@/lib/money";
import {
  INVOICE_STATUSES,
  MILESTONE_KINDS,
  type CreateMilestoneInput,
  type Currency,
  type InvoiceStatus,
  type MilestoneKind,
  type MilestoneWithMeta,
  type UpdateMilestoneInput,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface Draft {
  kind: MilestoneKind;
  name: string;
  description: string;
  start_date: string;
  due_date: string;
  requires_gate: boolean;
  /** Raw text; parsed with parseMoneyInput ("1,50,000", "1.5L"). */
  price: string;
  invoice_status: InvoiceStatus;
}

function draftFrom(milestone?: MilestoneWithMeta, defaultKind: MilestoneKind = "phase"): Draft {
  return {
    kind: milestone?.kind ?? defaultKind,
    name: milestone?.name ?? "",
    description: milestone?.description ?? "",
    start_date: milestone?.start_date ?? "",
    due_date: milestone?.due_date ?? "",
    requires_gate: milestone?.requires_gate ?? false,
    price: milestone?.price !== null && milestone?.price !== undefined ? String(milestone.price) : "",
    invoice_status: milestone?.invoice_status ?? "not_invoiced",
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const KIND_OPTIONS = MILESTONE_KINDS.map((kind) => ({
  value: kind,
  label: MILESTONE_KIND_CONFIG[kind].label,
  icon: ICONS[MILESTONE_KIND_CONFIG[kind].icon],
}));

export interface MilestoneFormProps {
  mode: "create" | "edit";
  projectId: string;
  /** Required in edit mode. */
  milestone?: MilestoneWithMeta;
  isAdmin: boolean;
  /** The project's currency; prices are disabled without one. */
  currency: Currency | null;
  /**
   * Admin or project owner. Anyone else cannot remove a gate, nor add one to a
   * phase that is active, in gate review or decided (updateMilestoneAction
   * refuses it); the checkbox is disabled with a hint. Defaults to `isAdmin`.
   */
  canChangeGate?: boolean;
  /** Called after a successful save (edit) or add (create). */
  onDone?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Fields for one phase or point milestone: kind, name, dates, gate flag,
 * description and, for admins only, the fixed price and invoice status.
 * Non-admins never send the commercial keys.
 */
export function MilestoneForm({
  mode,
  projectId,
  milestone,
  isAdmin,
  currency,
  canChangeGate = isAdmin,
  onDone,
  onCancel,
  autoFocus = false,
  className,
}: MilestoneFormProps) {
  const router = useRouter();
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(milestone));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const isPhase = draft.kind === "phase";
  const field = (name: string) => `${id}-${name}`;
  // Mirrors isGuardedGateChange in src/actions/milestones.ts.
  const gateLocked =
    mode === "edit" &&
    milestone !== undefined &&
    !canChangeGate &&
    (milestone.requires_gate ||
      milestone.status === "active" ||
      milestone.status === "gate_review" ||
      milestone.gate_decision !== null);

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

  /**
   * A point milestone has one date (the form hides its start). Template point
   * milestones are stored with start = due (computeTemplateSchedule), so one
   * that had a start keeps start = due when its date or kind changes, and an
   * untouched date leaves start_date exactly as stored (no spurious change).
   */
  function pointStartDate(dueDate: string | null): string | null {
    if (!milestone) return null;
    if (milestone.kind === "milestone" && dueDate === milestone.due_date) return milestone.start_date;
    return milestone.start_date ? dueDate : null;
  }

  function validate(): { ok: true; price: number | null } | { ok: false } {
    const next: Record<string, string> = {};
    const name = draft.name.trim();
    if (!name) next.name = "Name is required";
    else if (name.length > MILESTONE_NAME_MAX) next.name = `Name must be ${MILESTONE_NAME_MAX} characters or fewer`;
    if (draft.description.trim().length > MILESTONE_DESCRIPTION_MAX) {
      next.description = `Description must be ${MILESTONE_DESCRIPTION_MAX} characters or fewer`;
    }
    if (isPhase && draft.start_date && draft.due_date && draft.due_date < draft.start_date) {
      next.due_date = "Due date must be on or after the start date";
    }
    let price: number | null = null;
    if (isAdmin && isPhase && draft.price.trim() !== "") {
      price = parseMoneyInput(draft.price);
      if (price === null) next.price = "Enter a whole amount, e.g. 1,50,000 or 1.5L";
    }
    setErrors(next);
    return Object.keys(next).length === 0 ? { ok: true, price } : { ok: false };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = validate();
    if (!checked.ok) return;

    const dueDate = orNull(draft.due_date);
    const startDate = isPhase ? orNull(draft.start_date) : pointStartDate(dueDate);
    const requiresGate = isPhase && draft.requires_gate;
    const price = isPhase ? checked.price : null;

    setPending(true);
    try {
      if (mode === "create") {
        const input: CreateMilestoneInput = {
          project_id: projectId,
          name: draft.name.trim(),
          description: draft.description.trim(),
          kind: draft.kind,
          start_date: startDate,
          due_date: dueDate,
          requires_gate: requiresGate,
        };
        if (isAdmin) {
          input.price = price;
          input.invoice_status = draft.invoice_status;
        }
        const result = await createMilestoneAction(input);
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          toast.error(result.error);
          return;
        }
        toast.success(`${MILESTONE_KIND_CONFIG[result.data.kind].label} "${result.data.name}" added`);
        setDraft((current) => ({ ...draftFrom(undefined, current.kind), requires_gate: current.requires_gate }));
        setErrors({});
        nameRef.current?.focus();
        router.refresh();
        onDone?.();
        return;
      }

      if (!milestone) return;
      const patch: UpdateMilestoneInput = {};
      if (draft.name.trim() !== milestone.name) patch.name = draft.name.trim();
      if (draft.description.trim() !== milestone.description.trim()) patch.description = draft.description.trim();
      if (draft.kind !== milestone.kind) patch.kind = draft.kind;
      if (startDate !== milestone.start_date) patch.start_date = startDate;
      if (dueDate !== milestone.due_date) patch.due_date = dueDate;
      if (requiresGate !== milestone.requires_gate) patch.requires_gate = requiresGate;
      if (isAdmin) {
        if (price !== milestone.price) patch.price = price;
        if (draft.invoice_status !== milestone.invoice_status) patch.invoice_status = draft.invoice_status;
      }
      if (Object.keys(patch).length === 0) {
        onDone?.();
        return;
      }
      const result = await updateMilestoneAction(milestone.id, patch);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success("Changes saved");
      router.refresh();
      onDone?.();
    } catch {
      toast.error("Could not save. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const describedBy = (name: string, hint: boolean) =>
    errors[name] ? `${field(name)}-error` : hint ? `${field(name)}-hint` : undefined;

  return (
    <form onSubmit={submit} noValidate className={cn("space-y-4", className)}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-fg">Type</span>
          <div>
            <SegmentedControl
              value={draft.kind}
              onChange={(value) => update("kind", value)}
              options={KIND_OPTIONS}
              ariaLabel="Phase or milestone"
            />
          </div>
          <p className="text-xs text-fg-muted">{MILESTONE_KIND_CONFIG[draft.kind].description}</p>
        </div>

        <FormField label="Name" htmlFor={field("name")} error={errors.name} required className="sm:col-span-2">
          <Input
            ref={nameRef}
            id={field("name")}
            value={draft.name}
            autoFocus={autoFocus}
            maxLength={MILESTONE_NAME_MAX + 20}
            placeholder={isPhase ? "Phase name" : "Milestone name"}
            invalid={Boolean(errors.name)}
            aria-describedby={describedBy("name", false)}
            onChange={(event) => update("name", event.target.value)}
          />
        </FormField>

        {isPhase ? (
          <FormField label="Start date" htmlFor={field("start_date")} error={errors.start_date}>
            <Input
              id={field("start_date")}
              type="date"
              value={draft.start_date}
              invalid={Boolean(errors.start_date)}
              aria-describedby={describedBy("start_date", false)}
              onChange={(event) => update("start_date", event.target.value)}
            />
          </FormField>
        ) : null}
        <FormField
          label={isPhase ? "Due date" : "Date"}
          htmlFor={field("due_date")}
          error={errors.due_date}
          className={isPhase ? undefined : "sm:col-span-2"}
        >
          <Input
            id={field("due_date")}
            type="date"
            value={draft.due_date}
            min={isPhase && draft.start_date ? draft.start_date : undefined}
            invalid={Boolean(errors.due_date)}
            aria-describedby={describedBy("due_date", false)}
            onChange={(event) => update("due_date", event.target.value)}
          />
        </FormField>

        {isPhase ? (
          <div className="sm:col-span-2">
            <label
              htmlFor={field("gate")}
              className={cn(
                "flex items-start gap-2.5 rounded-[10px] px-1 py-1 pointer-coarse:py-2",
                gateLocked ? "cursor-not-allowed" : "cursor-pointer",
              )}
            >
              <Checkbox
                id={field("gate")}
                checked={draft.requires_gate}
                disabled={gateLocked}
                onChange={(event) => update("requires_gate", event.target.checked)}
                className="mt-0.5"
                aria-describedby={`${field("gate")}-hint`}
              />
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium", gateLocked ? "text-fg-muted" : "text-fg")}>
                  Requires a gate review
                </span>
                <span id={`${field("gate")}-hint`} className="block text-xs text-fg-muted [overflow-wrap:anywhere]">
                  {gateLocked
                    ? "Only an admin or the project owner can change this phase's gate."
                    : "A Go / Extend once / Stop decision closes the phase."}
                </span>
              </span>
            </label>
          </div>
        ) : null}

        <FormField
          label="Description"
          htmlFor={field("description")}
          error={errors.description}
          className="sm:col-span-2"
        >
          <Textarea
            id={field("description")}
            rows={2}
            value={draft.description}
            placeholder="Scope, exit criteria or anything the team should know."
            invalid={Boolean(errors.description)}
            aria-describedby={describedBy("description", false)}
            onChange={(event) => update("description", event.target.value)}
          />
        </FormField>

        {isAdmin && isPhase ? (
          <>
            <FormField
              label="Price"
              htmlFor={field("price")}
              error={errors.price}
              hint={
                currency
                  ? `Whole amount in ${CURRENCY_CONFIG[currency].label.toLowerCase()}s. Admins only.`
                  : "Set the project's currency (Edit project) before adding prices."
              }
            >
              <div className="relative">
                {currency ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-fg-muted"
                  >
                    {CURRENCY_CONFIG[currency].symbol}
                  </span>
                ) : null}
                <Input
                  id={field("price")}
                  inputMode="decimal"
                  value={draft.price}
                  disabled={!currency}
                  placeholder={currency === "INR" ? "1,50,000 or 1.5L" : currency === "USD" ? "25,000 or 25K" : "No currency"}
                  invalid={Boolean(errors.price)}
                  aria-describedby={describedBy("price", true)}
                  onChange={(event) => update("price", event.target.value)}
                  className={cn("tabular-nums", currency && "pl-7")}
                />
              </div>
            </FormField>
            <FormField label="Invoice status" htmlFor={field("invoice")} error={errors.invoice_status}>
              <NativeSelect
                id={field("invoice")}
                value={draft.invoice_status}
                onChange={(event) => update("invoice_status", event.target.value as InvoiceStatus)}
              >
                {INVOICE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {INVOICE_STATUS_CONFIG[status].label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" size="sm" loading={pending}>
          {mode === "create" ? (
            <>
              <Plus aria-hidden />
              Add {isPhase ? "phase" : "milestone"}
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
