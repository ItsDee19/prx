"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Check, ChevronDown, Pencil, Trash2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { deleteCustomTemplateAction, updateCustomTemplateAction } from "@/actions/templates";
import { ServiceLineBadge } from "@/components/clients/service-line-badge";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Icon } from "@/components/ui/icon";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SERVICE_LINE_CONFIG, SERVICE_LINE_ORDER } from "@/lib/constants";
import type { CustomTemplateWithMeta } from "@/lib/data/templates";
import { TEMPLATE_DESCRIPTION_MAX, TEMPLATE_NAME_MAX } from "@/lib/schemas/templates";
import { BUILTIN_TEMPLATE_OPTIONS, templateDurationLabel } from "@/lib/templates";
import type { ServiceLine } from "@/lib/types";
import { cn, formatDate, pluralize } from "@/lib/utils";
import { PhaseStrip } from "./phase-strip";
import { summarizeTemplatePayload, summaryLine } from "./template-utils";

export interface TemplatesManagerProps {
  templates: CustomTemplateWithMeta[];
  /** Admins rename, describe, re-tag and delete custom templates; members see the list. */
  isAdmin: boolean;
}

function EditForm({ template, onDone }: { template: CustomTemplateWithMeta; onDone: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [serviceLine, setServiceLine] = useState<ServiceLine | "">(template.service_line ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setErrors({ name: "Name the template" });
      return;
    }
    startTransition(async () => {
      const result = await updateCustomTemplateAction(template.id, {
        name: name.trim(),
        description: description.trim(),
        service_line: serviceLine || null,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) setError(result.error);
        return;
      }
      toast.success("Template saved");
      onDone();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={save}
      noValidate
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onDone();
        }
      }}
      className="reveal-fade space-y-3 px-4 py-4 sm:px-5"
    >
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <FormField label="Name" htmlFor={`${uid}-name`} error={errors.name} required>
        <Input
          id={`${uid}-name`}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setErrors({});
          }}
          maxLength={TEMPLATE_NAME_MAX}
          autoComplete="off"
          autoFocus
          invalid={Boolean(errors.name)}
        />
      </FormField>
      <FormField label="Description" htmlFor={`${uid}-description`} error={errors.description}>
        <Textarea
          id={`${uid}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          maxLength={TEMPLATE_DESCRIPTION_MAX}
        />
      </FormField>
      <FormField label="Service line" htmlFor={`${uid}-service`} error={errors.service_line}>
        <NativeSelect
          id={`${uid}-service`}
          value={serviceLine}
          onChange={(event) => setServiceLine(event.target.value as ServiceLine | "")}
        >
          <option value="">Any service line</option>
          {SERVICE_LINE_ORDER.map((value) => (
            <option key={value} value={value}>
              {SERVICE_LINE_CONFIG[value].label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onDone} disabled={pending} className="w-full sm:w-auto">
          <X aria-hidden />
          Cancel
        </Button>
        <Button type="submit" loading={pending} className="w-full sm:w-auto">
          <Check aria-hidden />
          Save
        </Button>
      </div>
    </form>
  );
}

function TemplateRow({ template, isAdmin }: { template: CustomTemplateWithMeta; isAdmin: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const summary = summarizeTemplatePayload(template.payload);

  async function remove() {
    const result = await deleteCustomTemplateAction(template.id);
    if (!result.ok) {
      toast.error(result.error);
      throw new Error(result.error);
    }
    toast.success(`Deleted "${template.name}"`);
    router.refresh();
  }

  if (editing) return <EditForm template={template} onDone={() => setEditing(false)} />;

  return (
    <div className="group flex min-w-0 items-start gap-3 px-4 py-3.5 transition-colors duration-(--dur-2) hover:bg-surface-2/40 sm:px-5">
      <span aria-hidden className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-2/12 text-accent-2">
        <Bookmark className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 truncate text-sm font-semibold text-fg">{template.name}</p>
          {template.service_line ? <ServiceLineBadge value={template.service_line} /> : null}
          {template.damaged ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
              <TriangleAlert className="size-3.5" aria-hidden />
              Unreadable, delete it
            </span>
          ) : null}
        </div>
        {template.description ? (
          <p className="line-clamp-2 text-xs text-fg-muted [overflow-wrap:anywhere]">{template.description}</p>
        ) : null}
        {!template.damaged ? (
          <p className="text-xs tabular-nums text-fg-muted">
            {templateDurationLabel(template.payload)} · {summaryLine(summary, { labels: true })}
          </p>
        ) : null}
        {template.payload.milestones.length > 0 ? <PhaseStrip payload={template.payload} showChips maxChips={6} className="max-w-xl pt-0.5" /> : null}
        <p className="text-xs text-fg-muted [overflow-wrap:anywhere]">
          {template.usage_count > 0 ? `Used by ${pluralize(template.usage_count, "project")}` : "Not used yet"}
          {template.source_project_id && template.source_project_name ? (
            <>
              {" · From "}
              <Link href={`/projects/${template.source_project_id}`} className="font-medium text-accent hover:underline">
                {template.source_project_name}
              </Link>
            </>
          ) : null}
          {` · Saved ${formatDate(template.created_at)}${template.creator_name ? ` by ${template.creator_name}` : ""}`}
        </p>
      </div>
      {isAdmin ? (
        <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity duration-(--dur-2) sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 pointer-coarse:opacity-100">
          {!template.damaged ? (
            <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label={`Edit ${template.name}`} className="size-8">
              <Pencil aria-hidden />
            </Button>
          ) : null}
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Delete ${template.name}`} className="size-8 hover:text-danger">
                <Trash2 aria-hidden />
              </Button>
            }
            title={`Delete "${template.name}"?`}
            description={
              template.usage_count > 0
                ? `${pluralize(template.usage_count, "project")} created from it keep their phases and tasks. This cannot be undone.`
                : "This cannot be undone."
            }
            confirmLabel="Delete template"
            destructive
            onConfirm={remove}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Settings > Templates: custom templates saved from projects (phase strip,
 * size, usage, source project), editable and deletable by admins, then the
 * built-in AvlysAI playbooks for reference (read-only).
 */
export function TemplatesManager({ templates, isAdmin }: TemplatesManagerProps) {
  const builtinId = useId();
  const [showBuiltins, setShowBuiltins] = useState(false);

  return (
    <div>
      <CardContent className="pt-5">
        <p className="text-sm font-medium text-fg">Your templates</p>
        <p className="mt-0.5 text-xs text-fg-muted">
          Save a well-run project as a template from its actions menu. It then shows in New project, under Start from.
        </p>
      </CardContent>
      {templates.length === 0 ? (
        <CardContent className="pb-5">
          <EmptyState
            icon={Bookmark}
            title="No custom templates yet."
            description="Open a project and choose Save as template."
          />
        </CardContent>
      ) : (
        <Stagger as="ul" className="divide-y divide-border border-y border-border">
          {templates.map((template) => (
            <StaggerItem key={template.id} as="li">
              <TemplateRow template={template} isAdmin={isAdmin} />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <div className={cn(templates.length === 0 && "border-t border-border")}>
        <button
          type="button"
          aria-expanded={showBuiltins}
          aria-controls={builtinId}
          onClick={() => setShowBuiltins((current) => !current)}
          className="flex w-full min-w-0 items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors duration-(--dur-2) hover:bg-surface-2/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-fg">Built-in playbooks</span>
            <span className="block truncate text-xs text-fg-muted">
              {BUILTIN_TEMPLATE_OPTIONS.map((option) => option.name).join(" · ")}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-fg-subtle transition-transform duration-(--dur-3) ease-out-quart",
              showBuiltins && "rotate-180",
            )}
          />
        </button>
        {showBuiltins ? (
          <ul id={builtinId} className="divide-y divide-border border-t border-border">
            {BUILTIN_TEMPLATE_OPTIONS.map((option) => (
              <li key={option.key} className="reveal-fade flex min-w-0 items-start gap-3 px-4 py-3.5 sm:px-5">
                <span aria-hidden className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg">
                  <Icon name={option.icon} className="size-4" />
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-sm font-semibold text-fg">{option.name}</p>
                  <p className="text-xs tabular-nums text-fg-muted">
                    {option.duration_label} · {summaryLine(summarizeTemplatePayload(option.payload))}
                  </p>
                  <PhaseStrip payload={option.payload} showChips maxChips={6} className="max-w-xl" />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
