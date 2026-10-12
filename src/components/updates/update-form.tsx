"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { RAG_CONFIG, RAG_DIMENSIONS, STATUS_HEADLINE_MAX } from "@/lib/constants";
import { createStatusUpdateSchema } from "@/lib/schemas/status-updates";
import type { CreateStatusUpdateInput, RagHealth } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fieldErrorsFromIssues } from "@/lib/validation";
import { RagPicker } from "./rag-picker";

export interface UpdateFormValues {
  health: RagHealth | null;
  schedule_rag: RagHealth | null;
  budget_rag: RagHealth | null;
  scope_rag: RagHealth | null;
  quality_rag: RagHealth | null;
  headline: string;
  done: string;
  next: string;
  blockers: string;
  client_asks: string;
  internal_notes: string;
}

export type UpdateFormInput = Omit<CreateStatusUpdateInput, "project_id">;

export const EMPTY_UPDATE_VALUES: UpdateFormValues = {
  health: null,
  schedule_rag: null,
  budget_rag: null,
  scope_rag: null,
  quality_rag: null,
  headline: "",
  done: "",
  next: "",
  blockers: "",
  client_asks: "",
  internal_notes: "",
};

export interface UpdateFormProps {
  projectId: string;
  initial: UpdateFormValues;
  /** Budget RAG suggested from hours burn (composer only). */
  suggestedBudgetRag?: RagHealth | null;
  /** Last week's "Next" text, offered as a starting point for "Done" (composer only). */
  carryOverNext?: string | null;
  /** Rendered above the fields (e.g. the changes preview). */
  header?: ReactNode;
  submitLabel: string;
  pending: boolean;
  /** Server field errors from the last submit. */
  serverErrors?: Record<string, string>;
  onSubmit: (input: UpdateFormInput) => void;
  onCancel?: () => void;
  autoFocusHeadline?: boolean;
  /** Rendered inside a Dialog: the actions use the sticky DialogFooter. */
  inDialog?: boolean;
}

type DimensionKey = (typeof RAG_DIMENSIONS)[number]["key"];

const SECTIONS = [
  { key: "done", label: "Done this week", placeholder: "What shipped or moved forward. One item per line." },
  { key: "next", label: "Next", placeholder: "What happens next week." },
  { key: "blockers", label: "Blockers", placeholder: "What is stuck and who can unblock it." },
  { key: "client_asks", label: "Client asks", placeholder: "Decisions, data or access we need from the client." },
] as const;

/**
 * Status update fields shared by the composer and the edit dialog: overall
 * health (required), optional schedule / budget / scope / quality RAGs,
 * headline (1-140 with a live counter), the four sections and internal notes
 * (never part of "Copy for client"). Validation mirrors the server schema.
 */
export function UpdateForm({
  projectId,
  initial,
  suggestedBudgetRag = null,
  carryOverNext = null,
  header,
  submitLabel,
  pending,
  serverErrors,
  onSubmit,
  onCancel,
  autoFocusHeadline = false,
  inDialog = false,
}: UpdateFormProps) {
  const baseId = useId();
  const [values, setValues] = useState<UpdateFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const shownErrors = { ...serverErrors, ...errors };
  const headlineLength = values.headline.trim().length;

  function set<K extends keyof UpdateFormValues>(key: K, value: UpdateFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: "" }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = {
      project_id: projectId,
      health: values.health ?? undefined,
      schedule_rag: values.schedule_rag,
      budget_rag: values.budget_rag,
      scope_rag: values.scope_rag,
      quality_rag: values.quality_rag,
      headline: values.headline,
      done: values.done,
      next: values.next,
      blockers: values.blockers,
      client_asks: values.client_asks,
      internal_notes: values.internal_notes,
    };
    const parsed = createStatusUpdateSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      const firstKey = parsed.error.issues[0]?.path[0];
      if (typeof firstKey === "string") {
        const element = document.getElementById(`${baseId}-${firstKey}`);
        const target =
          element?.getAttribute("role") === "radiogroup"
            ? element.querySelector<HTMLElement>('[tabindex="0"]')
            : element;
        target?.focus();
      }
      return;
    }
    const data = parsed.data;
    onSubmit({
      health: data.health,
      schedule_rag: data.schedule_rag ?? null,
      budget_rag: data.budget_rag ?? null,
      scope_rag: data.scope_rag ?? null,
      quality_rag: data.quality_rag ?? null,
      headline: data.headline,
      done: data.done ?? "",
      next: data.next ?? "",
      blockers: data.blockers ?? "",
      client_asks: data.client_asks ?? "",
      internal_notes: data.internal_notes ?? "",
    });
  }

  const id = (key: string) => `${baseId}-${key}`;

  const actions = (
    <>
      {onCancel ? (
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      ) : null}
      <Button type="submit" loading={pending}>
        {submitLabel}
      </Button>
    </>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {header}

      <div className="space-y-2">
        <p id={id("health-label")} className="text-sm font-medium text-fg">
          Overall health
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        </p>
        <RagPicker
          id={id("health")}
          aria-label="Overall health"
          value={values.health}
          onChange={(value) => set("health", value)}
          invalid={Boolean(shownErrors.health)}
        />
        {values.health ? (
          <p className="text-xs text-fg-muted">{RAG_CONFIG[values.health].description}</p>
        ) : null}
        {shownErrors.health ? (
          <p role="alert" className="text-xs text-danger">
            {shownErrors.health}
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-2.5">
        <legend className="text-sm font-medium text-fg">
          Dimensions <span className="font-normal text-fg-muted">(optional)</span>
        </legend>
        <div className="grid gap-x-6 gap-y-3 lg:grid-cols-2">
          {RAG_DIMENSIONS.map((dimension) => {
            const key: DimensionKey = dimension.key;
            const suggested = key === "budget_rag" ? suggestedBudgetRag : null;
            return (
              <div key={key} className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="w-16 shrink-0 text-xs font-medium text-fg-muted">{dimension.label}</span>
                  <RagPicker
                    size="sm"
                    allowNone
                    aria-label={`${dimension.label} health`}
                    value={values[key]}
                    onChange={(value) => set(key, value)}
                  />
                </div>
                {suggested ? (
                  <p className="flex items-center gap-1.5 pl-[4.5rem] text-xs text-fg-muted">
                    <Sparkles aria-hidden className="size-3 text-accent-2" />
                    <span>
                      Suggested from hours burn: {RAG_CONFIG[suggested].label}.
                      {values.budget_rag !== suggested ? (
                        <button
                          type="button"
                          onClick={() => set("budget_rag", suggested)}
                          className="ml-1 rounded font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Use it
                        </button>
                      ) : null}
                    </span>
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>

      <FormField
        label="Headline"
        htmlFor={id("headline")}
        required
        error={shownErrors.headline}
        hint="One line a busy reader can act on."
      >
        <div className="relative">
          <Input
            id={id("headline")}
            value={values.headline}
            onChange={(event) => set("headline", event.target.value)}
            maxLength={STATUS_HEADLINE_MAX + 20}
            invalid={Boolean(shownErrors.headline)}
            aria-describedby={`${id("headline")}-count ${shownErrors.headline ? `${id("headline")}-error` : `${id("headline")}-hint`}`}
            placeholder="One line on where the engagement stands."
            autoFocus={autoFocusHeadline}
            className="pr-16"
          />
          <span
            id={`${id("headline")}-count`}
            aria-live="polite"
            className={cn(
              "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums",
              headlineLength > STATUS_HEADLINE_MAX ? "font-medium text-danger" : "text-fg-subtle",
            )}
          >
            <span className="sr-only">Characters used: </span>
            {headlineLength}/{STATUS_HEADLINE_MAX}
          </span>
        </div>
      </FormField>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((section) => (
          <FormField key={section.key} label={section.label} htmlFor={id(section.key)} error={shownErrors[section.key]}>
            <Textarea
              id={id(section.key)}
              value={values[section.key]}
              onChange={(event) => set(section.key, event.target.value)}
              rows={3}
              placeholder={section.placeholder}
              invalid={Boolean(shownErrors[section.key])}
              className="field-sizing-content max-h-80"
            />
            {section.key === "done" && carryOverNext && !values.done.trim() ? (
              <button
                type="button"
                onClick={() => set("done", carryOverNext)}
                className="mt-1 rounded text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Start from last week&apos;s next steps
              </button>
            ) : null}
          </FormField>
        ))}
      </div>

      <FormField
        label={
          <span className="inline-flex items-center gap-1.5">
            <Lock aria-hidden className="size-3.5 text-fg-subtle" />
            Internal notes
          </span>
        }
        htmlFor={id("internal_notes")}
        error={shownErrors.internal_notes}
        hint="Team only. Never included in Copy for client."
      >
        <Textarea
          id={id("internal_notes")}
          value={values.internal_notes}
          onChange={(event) => set("internal_notes", event.target.value)}
          rows={2}
          aria-describedby={`${id("internal_notes")}-hint`}
          className="field-sizing-content max-h-64"
        />
      </FormField>

      {inDialog ? <DialogFooter>{actions}</DialogFooter> : (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">{actions}</div>
      )}
    </form>
  );
}

/** Form values of a saved update (edit mode). */
export function valuesFromUpdate(update: {
  health: RagHealth;
  schedule_rag: RagHealth | null;
  budget_rag: RagHealth | null;
  scope_rag: RagHealth | null;
  quality_rag: RagHealth | null;
  headline: string;
  done: string;
  next: string;
  blockers: string;
  client_asks: string;
  internal_notes: string;
}): UpdateFormValues {
  return {
    health: update.health,
    schedule_rag: update.schedule_rag,
    budget_rag: update.budget_rag,
    scope_rag: update.scope_rag,
    quality_rag: update.quality_rag,
    headline: update.headline,
    done: update.done,
    next: update.next,
    blockers: update.blockers,
    client_asks: update.client_asks,
    internal_notes: update.internal_notes,
  };
}
