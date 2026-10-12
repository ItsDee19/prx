"use client";

import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Rocket, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { convertToPilotAction } from "@/actions/templates";
import { ClientChip } from "@/components/clients/client-chip";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { SERVICE_LINE_CONFIG } from "@/lib/constants";
import { getBuiltinTemplate } from "@/lib/templates";
import type { ProjectWithMeta, ServiceLine } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { TemplateSchedulePreview } from "./template-schedule-preview";
import { useConversionState } from "./use-conversion-state";

const PILOT_TEMPLATE = getBuiltinTemplate("ai_delivery");
const PILOT_TEMPLATE_KEY = "builtin:ai_delivery";
const PILOT_SERVICE_LINES: ServiceLine[] = PILOT_TEMPLATE?.service_lines ?? ["ai_agents"];

type ConversionProject = Pick<ProjectWithMeta, "id" | "name" | "client" | "labels" | "members" | "service_line" | "template_key">;

/** Assessment-shaped projects: the only ones that can ever be converted (checked again on the server). */
export function isAssessmentProject(project: Pick<ProjectWithMeta, "service_line" | "template_key">): boolean {
  return project.service_line === "consulting" || project.template_key === "builtin:ai_readiness";
}

function pilotName(name: string): string {
  const full = `Pilot: ${name}`;
  return full.length <= 120 ? full : `${full.slice(0, 119).trimEnd()}…`;
}

export interface ConvertToPilotDialogProps {
  project: ConversionProject;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Single element that opens the dialog; optional when controlled (e.g. from a menu item). */
  trigger?: ReactNode;
}

/**
 * Convert to pilot: a new AI delivery project for the same client with the
 * assessment's labels, success metrics and members, linked back to it. The
 * dialog checks eligibility (Plan phase done), warns when a pilot already
 * exists, lets the user name it, pick its start date and service line, and
 * previews the dated plan. Opens the new project when it is created.
 */
export function ConvertToPilotDialog({ project, open: controlledOpen, onOpenChange, trigger }: ConvertToPilotDialogProps) {
  const router = useRouter();
  const uid = useId();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const { state, error: stateError } = useConversionState(project.id, open);
  const [name, setName] = useState(() => pilotName(project.name));
  const [startDate, setStartDate] = useState("");
  const [serviceLine, setServiceLine] = useState<ServiceLine>(PILOT_SERVICE_LINES[0]);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName(pilotName(project.name));
      setStartDate("");
      setServiceLine(PILOT_SERVICE_LINES[0]);
      setError(null);
      setNameError(null);
    }
  }

  function setOpen(next: boolean) {
    if (pending) return;
    if (controlledOpen === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  }

  const effectiveStart = startDate || state?.today || "";
  const existingPilots = state?.conversions.filter((item) => item.template_key === PILOT_TEMPLATE_KEY) ?? [];
  const blocked = state !== null && !state.can_convert_to_pilot;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError("Name is required");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await convertToPilotAction(project.id, {
        name: name.trim(),
        start_date: effectiveStart || undefined,
        service_line: serviceLine,
      });
      if (!result.ok) {
        if (result.fieldErrors?.name) setNameError(result.fieldErrors.name);
        setError(result.error);
        return;
      }
      toast.success("Pilot created", { description: "Phases, deliverables and gates are dated from the start date." });
      if (controlledOpen === undefined) setInnerOpen(false);
      onOpenChange?.(false);
      router.push(`/projects/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent title="Convert to pilot" description="Turn this assessment into an AI delivery engagement." size="md">
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="flex min-w-0 items-start gap-2.5 rounded-xl border border-border bg-surface-2/40 p-3.5 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 space-y-1.5">
              <p className="text-fg">
                A new AI delivery project
                {project.client ? (
                  <>
                    {" for "}
                    <ClientChip client={project.client} showName />
                  </>
                ) : null}
                , linked back to this assessment.
              </p>
              <p className="text-xs text-fg-muted">
                It keeps {pluralize(project.labels.length, "label")}, {pluralize(project.members.length, "member")} and
                the success metrics agreed here. Contract terms are not copied.
              </p>
            </div>
          </div>

          {stateError ? (
            <p role="alert" className="text-sm text-danger">
              {stateError}
            </p>
          ) : blocked ? (
            <p role="alert" className="flex items-start gap-1.5 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {state?.pilot_blocker}
            </p>
          ) : null}
          {existingPilots.length > 0 ? (
            <p className="flex items-start gap-1.5 text-xs text-fg-muted" aria-live="polite">
              <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                Already converted:{" "}
                {existingPilots.map((pilot, index) => (
                  <span key={pilot.id}>
                    {index > 0 ? ", " : null}
                    <Link href={`/projects/${pilot.id}`} className="font-medium text-accent hover:underline">
                      {pilot.name}
                    </Link>
                  </span>
                ))}
                . Creating another adds a second pilot.
              </span>
            </p>
          ) : null}

          {error && !nameError ? (
            <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <FormField label="Pilot name" htmlFor={`${uid}-name`} error={nameError} required>
            <Input
              id={`${uid}-name`}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
              }}
              maxLength={120}
              autoComplete="off"
              autoFocus
              invalid={Boolean(nameError)}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Start date" htmlFor={`${uid}-start`} className="min-w-0">
              <Input
                id={`${uid}-start`}
                type="date"
                value={effectiveStart}
                onChange={(event) => setStartDate(event.target.value)}
                className="min-w-0 supports-[-webkit-touch-callout:none]:appearance-none"
              />
            </FormField>
            <FormField label="Service line" htmlFor={`${uid}-service`} className="min-w-0">
              <NativeSelect
                id={`${uid}-service`}
                value={serviceLine}
                onChange={(event) => setServiceLine(event.target.value as ServiceLine)}
              >
                {PILOT_SERVICE_LINES.map((value) => (
                  <option key={value} value={value}>
                    {SERVICE_LINE_CONFIG[value].label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>

          {PILOT_TEMPLATE ? (
            state ? (
              <TemplateSchedulePreview payload={PILOT_TEMPLATE.payload} startDate={effectiveStart} templateName={PILOT_TEMPLATE.name} />
            ) : (
              <Skeleton className="h-40 w-full rounded-xl" />
            )
          ) : null}

          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={pending} className="w-full sm:w-auto">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending} disabled={!state || blocked} className="w-full sm:w-auto">
              <Rocket aria-hidden />
              Create pilot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface ConvertToPilotButtonProps {
  project: ConversionProject;
  /**
   * Server-computed eligibility. Omitted: the button checks itself (only for
   * assessment-shaped projects) and renders nothing until the Plan phase is done.
   */
  eligible?: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}

/** "Convert to pilot" on an assessment whose Plan phase is done; nothing otherwise. */
export function ConvertToPilotButton({ project, eligible, variant = "primary", size = "md", className }: ConvertToPilotButtonProps) {
  const shouldCheck = eligible === undefined && isAssessmentProject(project);
  const { state } = useConversionState(project.id, shouldCheck);
  const visible = eligible ?? state?.can_convert_to_pilot ?? false;
  if (!visible) return null;
  return (
    <ConvertToPilotDialog
      project={project}
      trigger={
        <Button variant={variant} size={size} className={cn("reveal-fade", className)}>
          <Rocket aria-hidden />
          Convert to pilot
        </Button>
      }
    />
  );
}
