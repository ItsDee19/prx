"use client";

import { useEffect, useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Lock } from "lucide-react";
import { toast } from "sonner";
import { previewProjectTemplateAction, saveProjectAsTemplateAction } from "@/actions/templates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { SERVICE_LINE_CONFIG, SERVICE_LINE_ORDER } from "@/lib/constants";
import { TEMPLATE_DESCRIPTION_MAX, TEMPLATE_NAME_MAX } from "@/lib/schemas/templates";
import type { Project, ProjectTemplate, ServiceLine, TemplatePayload } from "@/lib/types";
import { PhaseStrip } from "./phase-strip";
import { summarizeTemplatePayload, summaryLine } from "./template-utils";

export interface SaveAsTemplateDialogProps {
  project: Pick<Project, "id" | "name" | "service_line">;
  /** Single element that opens the dialog. Optional when controlled (e.g. from a menu item). */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved?: (template: ProjectTemplate) => void;
}

function suggestedName(name: string): string {
  const suggestion = `${name} playbook`;
  return suggestion.length <= TEMPLATE_NAME_MAX ? suggestion : name.slice(0, TEMPLATE_NAME_MAX).trimEnd();
}

/**
 * Save as template (project actions menu): previews what is captured (phases
 * and tasks as day offsets from the project start, the scorecard targets,
 * open risks and labels), then saves a custom template that appears in
 * New project > Start from. Amounts and invoice details are never captured.
 */
export function SaveAsTemplateDialog({ project, trigger, open: controlledOpen, onOpenChange, onSaved }: SaveAsTemplateDialogProps) {
  const router = useRouter();
  const uid = useId();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const [name, setName] = useState(() => suggestedName(project.name));
  const [description, setDescription] = useState("");
  const [serviceLine, setServiceLine] = useState<ServiceLine | "">(project.service_line ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TemplatePayload | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName(suggestedName(project.name));
      setDescription("");
      setServiceLine(project.service_line ?? "");
      setErrors({});
      setFormError(null);
      setPreview(null);
      setPreviewError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    previewProjectTemplateAction(project.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setPreview(result.data);
      else setPreviewError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open, project.id]);

  function setOpen(next: boolean) {
    if (pending) return;
    if (controlledOpen === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setErrors({ name: "Name the template" });
      return;
    }
    startTransition(async () => {
      const result = await saveProjectAsTemplateAction(project.id, {
        name: name.trim(),
        description: description.trim(),
        service_line: serviceLine || null,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors?.name) setFormError(result.error);
        return;
      }
      toast.success("Template saved", { description: "Find it under New project, in Start from." });
      if (controlledOpen === undefined) setInnerOpen(false);
      onOpenChange?.(false);
      router.refresh();
      onSaved?.(result.data);
    });
  }

  const summary = preview ? summarizeTemplatePayload(preview) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        title="Save as template"
        description="Reuse this project's plan for the next engagement."
        size="md"
      >
        <form onSubmit={submit} noValidate className="space-y-4">
          {formError ? (
            <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {formError}
            </div>
          ) : null}

          <section aria-label="What the template captures" className="rounded-xl border border-border bg-surface-2/40 p-3.5">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-fg">
                <Bookmark className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1" aria-live="polite">
                {preview && summary ? (
                  <>
                    <p className="text-sm font-medium tabular-nums text-fg">{summaryLine(summary, { labels: true })}</p>
                    <p className="text-xs text-fg-muted">
                      Dates are saved as days from the project start. Cancelled tasks, subtasks and tasks without a
                      phase are left out.
                    </p>
                  </>
                ) : previewError ? (
                  <p role="alert" className="text-sm text-danger">
                    {previewError}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <span className="sr-only">Reading the project plan…</span>
                    <Skeleton className="h-4 w-48 rounded-md" />
                    <Skeleton className="h-3 w-64 max-w-full rounded-md" />
                  </div>
                )}
              </div>
            </div>
            {preview && preview.milestones.length > 0 ? <PhaseStrip payload={preview} showChips maxChips={6} className="mt-3" /> : null}
            <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
              <Lock className="size-3.5 shrink-0" aria-hidden />
              Amounts, phase prices and invoice details are never saved in templates.
            </p>
          </section>

          <FormField label="Name" htmlFor={`${uid}-name`} error={errors.name} required>
            <Input
              id={`${uid}-name`}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setErrors((current) => ({ ...current, name: "" }));
              }}
              maxLength={TEMPLATE_NAME_MAX}
              autoComplete="off"
              autoFocus
              invalid={Boolean(errors.name)}
            />
          </FormField>
          <FormField label="Description" htmlFor={`${uid}-description`} error={errors.description} hint="When should the team pick this template?">
            <Textarea
              id={`${uid}-description`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              maxLength={TEMPLATE_DESCRIPTION_MAX}
              invalid={Boolean(errors.description)}
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

          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={pending} className="w-full sm:w-auto">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending} disabled={Boolean(previewError)} className="w-full sm:w-auto">
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
