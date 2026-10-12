"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { createProjectFromTemplateAction, listTemplateOptionsAction } from "@/actions/templates";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { BUILTIN_TEMPLATE_OPTIONS, type TemplateOption } from "@/lib/templates";
import type { CreateProjectFullInput, ProjectStatus, UserSummary } from "@/lib/types";
import { TemplatePicker } from "./template-picker";
import { TemplateSchedulePreview } from "./template-schedule-preview";
import { suggestedOption, templatePrefill } from "./template-utils";

export interface NewProjectWithTemplateProps {
  users: UserSummary[];
  /** Single element that opens the dialog. Optional for controlled hosts (`open` / `onOpenChange`). */
  trigger?: ReactNode;
  /** Workspace today: the default start date and the base of every date preview. */
  today: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Create a sub-project of this project. */
  parentId?: string | null;
  parentName?: string | null;
  /** Initial form values (e.g. `{ client_id }` from a client page); `service_line` also suggests a template. */
  defaults?: Partial<CreateProjectFullInput>;
  /** Initial status (e.g. the board column "+ Add" came from). */
  defaultStatus?: ProjectStatus;
  /** Preselected template key; null = Blank project. Default: the suggestion for `defaults.service_line`, else Blank. */
  defaultTemplateKey?: string | null;
  /** After creation. Default: open the new project. */
  onSuccess?: (id: string) => void;
}

/**
 * New project with "Start from" as the first step: the template picker and a
 * start date (each card shows when its plan would end; the selected
 * template's phase dates preview below). Continue fills the details form
 * with the template's defaults, and the details step shows the same computed
 * schedule beside the dates (`detailsAside`), including the build end that an
 * empty due date becomes. Creating with a template calls
 * `createProjectFromTemplateAction`; Blank project uses the plain create.
 * Built-in templates show at once; custom ones load when the dialog opens.
 */
export function NewProjectWithTemplate({
  users,
  trigger,
  today,
  open: controlledOpen,
  onOpenChange,
  parentId = null,
  parentName = null,
  defaults,
  defaultStatus,
  defaultTemplateKey,
  onSuccess,
}: NewProjectWithTemplateProps) {
  const router = useRouter();
  const startId = useId();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const [options, setOptions] = useState<TemplateOption[]>(() => [...BUILTIN_TEMPLATE_OPTIONS]);
  const [loadingCustom, setLoadingCustom] = useState(false);
  const initialKey = () =>
    defaultTemplateKey !== undefined
      ? defaultTemplateKey
      : (suggestedOption(BUILTIN_TEMPLATE_OPTIONS, defaults?.service_line)?.key ?? null);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const [startDate, setStartDate] = useState(defaults?.start_date ?? today);

  // A fresh choice every time the dialog opens.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setSelectedKey(initialKey());
      setStartDate(defaults?.start_date ?? today);
      setLoadingCustom(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listTemplateOptionsAction().then((result) => {
      if (cancelled) return;
      setLoadingCustom(false);
      if (result.ok) setOptions(result.data);
      else toast.error(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selected = options.find((option) => option.key === selectedKey) ?? null;

  function handleOpenChange(next: boolean) {
    if (controlledOpen === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  }

  return (
    <ProjectDialog
      mode="create"
      users={users}
      trigger={trigger}
      open={open}
      onOpenChange={handleOpenChange}
      parentId={parentId}
      parentName={parentName}
      defaults={defaults}
      defaultStatus={defaultStatus}
      onSuccess={onSuccess ?? ((id) => router.push(`/projects/${id}`))}
      createAction={selected ? (input) => createProjectFromTemplateAction(input, selected.key) : undefined}
      detailsAside={
        selected
          ? (values) => (
              <TemplateSchedulePreview
                payload={selected.payload}
                startDate={values.start_date ?? today}
                dueDate={values.due_date ?? null}
                templateName={selected.name}
              />
            )
          : undefined
      }
      startStep={({ next }) => (
        <div className="space-y-5">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <p className="min-w-0 max-w-md text-sm text-fg-muted text-pretty">
              Start from an AvlysAI playbook. Phases, deliverables, gates, starter risks and metrics are dated from the
              start date.
            </p>
            <FormField label="Start date" htmlFor={startId} className="w-full shrink-0 sm:w-44">
              <Input
                id={startId}
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="min-w-0 supports-[-webkit-touch-callout:none]:appearance-none"
              />
            </FormField>
          </div>

          <TemplatePicker
            options={options}
            value={selected ? selected.key : null}
            onChange={setSelectedKey}
            startDate={startDate || today}
            loadingCustom={loadingCustom}
            autoFocus
          />

          {selected ? (
            <TemplateSchedulePreview
              key={selected.key}
              payload={selected.payload}
              startDate={startDate || today}
              templateName={selected.name}
            />
          ) : null}

          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                Cancel
              </Button>
            </DialogClose>
            <Button
              className="w-full min-w-0 sm:w-auto"
              onClick={() => next(templatePrefill(selected, startDate, defaults))}
            >
              <span className="truncate">{selected ? `Continue with ${selected.name}` : "Continue with a blank project"}</span>
              <ArrowRight aria-hidden />
            </Button>
          </DialogFooter>
        </div>
      )}
    />
  );
}
