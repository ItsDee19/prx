"use client";

import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Repeat, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { proposeRetainerAction } from "@/actions/templates";
import { ClientChip } from "@/components/clients/client-chip";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getBuiltinTemplate } from "@/lib/templates";
import type { ProjectWithMeta } from "@/lib/types";
import { cn, formatDate, pluralize } from "@/lib/utils";
import { TemplateSchedulePreview } from "./template-schedule-preview";
import { useConversionState } from "./use-conversion-state";

const RETAINER_TEMPLATE = getBuiltinTemplate("retainer");
const RETAINER_TEMPLATE_KEY = "builtin:retainer";

type RetainerSource = Pick<ProjectWithMeta, "id" | "name" | "client" | "labels" | "members" | "engagement_type" | "template_key">;

/** A retainer is never proposed from a retainer (checked again on the server). */
export function canProposeRetainer(project: Pick<ProjectWithMeta, "engagement_type" | "template_key">): boolean {
  return project.engagement_type !== "retainer" && project.template_key !== RETAINER_TEMPLATE_KEY;
}

function retainerName(name: string): string {
  const full = `Retainer: ${name}`;
  return full.length <= 120 ? full : `${full.slice(0, 119).trimEnd()}…`;
}

/** "" -> null, whole hours -> number, otherwise NaN (invalid). */
function parseHours(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

export interface ProposeRetainerDialogProps {
  project: RetainerSource;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Single element that opens the dialog; optional when controlled (e.g. from a menu item). */
  trigger?: ReactNode;
}

/**
 * Propose retainer: a To start Retainer project for the same client with this
 * engagement's labels and members, linked back to it, starting when the
 * tuning window closes (editable), with a monthly hours budget and the three
 * monthly reviews. Opens the new project when it is created.
 */
export function ProposeRetainerDialog({ project, open: controlledOpen, onOpenChange, trigger }: ProposeRetainerDialogProps) {
  const router = useRouter();
  const uid = useId();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const { state, error: stateError } = useConversionState(project.id, open);
  const [name, setName] = useState(() => retainerName(project.name));
  const [startDate, setStartDate] = useState("");
  const [hours, setHours] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName(retainerName(project.name));
      setStartDate("");
      setHours(null);
      setErrors({});
      setError(null);
    }
  }

  function setOpen(next: boolean) {
    if (pending) return;
    if (controlledOpen === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  }

  const effectiveStart = startDate || state?.default_retainer_start || "";
  const hoursText = hours ?? (state?.default_retainer_hours != null ? String(state.default_retainer_hours) : "");
  const existing = state?.conversions.filter((item) => item.template_key === RETAINER_TEMPLATE_KEY) ?? [];
  const blocked = state !== null && !state.can_propose_retainer;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "Name is required";
    const budget = parseHours(hoursText);
    if (Number.isNaN(budget)) found.budget_hours = "Enter whole hours, e.g. 40";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setError(null);
    startTransition(async () => {
      const result = await proposeRetainerAction(project.id, {
        name: name.trim(),
        start_date: effectiveStart || undefined,
        budget_hours: budget,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setError(result.error);
        return;
      }
      toast.success("Retainer proposed", { description: "It starts as To start with three monthly reviews." });
      if (controlledOpen === undefined) setInnerOpen(false);
      onOpenChange?.(false);
      router.push(`/projects/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent title="Propose retainer" description="Keep supporting this client after delivery." size="md">
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="flex min-w-0 items-start gap-2.5 rounded-xl border border-border bg-surface-2/40 p-3.5 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 space-y-1.5">
              <p className="text-fg">
                A Retainer proposal
                {project.client ? (
                  <>
                    {" for "}
                    <ClientChip client={project.client} showName />
                  </>
                ) : null}
                : monthly updates, monitoring and fixes against an hours budget.
              </p>
              <p className="text-xs text-fg-muted">
                It keeps {pluralize(project.labels.length, "label")} and {pluralize(project.members.length, "member")}, and
                links back to this project. Contract terms are not copied.
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
              {state?.retainer_blocker}
            </p>
          ) : null}
          {existing.length > 0 ? (
            <p className="flex items-start gap-1.5 text-xs text-fg-muted" aria-live="polite">
              <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                Already proposed:{" "}
                {existing.map((item, index) => (
                  <span key={item.id}>
                    {index > 0 ? ", " : null}
                    <Link href={`/projects/${item.id}`} className="font-medium text-accent hover:underline">
                      {item.name}
                    </Link>
                  </span>
                ))}
                .
              </span>
            </p>
          ) : null}

          {error && !Object.values(errors).some(Boolean) ? (
            <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <FormField label="Retainer name" htmlFor={`${uid}-name`} error={errors.name} required>
            <Input
              id={`${uid}-name`}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setErrors((current) => ({ ...current, name: "" }));
              }}
              maxLength={120}
              autoComplete="off"
              autoFocus
              invalid={Boolean(errors.name)}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="Start date"
              htmlFor={`${uid}-start`}
              error={errors.start_date}
              hint={
                state && !startDate && state.default_retainer_start !== state.today
                  ? `When tuning ends, ${formatDate(state.default_retainer_start)}.`
                  : undefined
              }
              className="min-w-0"
            >
              <Input
                id={`${uid}-start`}
                type="date"
                value={effectiveStart}
                onChange={(event) => setStartDate(event.target.value)}
                className="min-w-0 supports-[-webkit-touch-callout:none]:appearance-none"
              />
            </FormField>
            <FormField
              label="Hours per month"
              htmlFor={`${uid}-hours`}
              error={errors.budget_hours}
              hint="Burn is tracked against logged time."
              className="min-w-0"
            >
              <div className="relative">
                <Input
                  id={`${uid}-hours`}
                  inputMode="numeric"
                  value={hoursText}
                  onChange={(event) => {
                    setHours(event.target.value);
                    setErrors((current) => ({ ...current, budget_hours: "" }));
                  }}
                  placeholder="Hours"
                  autoComplete="off"
                  invalid={Boolean(errors.budget_hours)}
                  className="pr-9 tabular-nums"
                />
                <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle">
                  h
                </span>
              </div>
            </FormField>
          </div>

          {RETAINER_TEMPLATE ? (
            state ? (
              <TemplateSchedulePreview
                payload={RETAINER_TEMPLATE.payload}
                startDate={effectiveStart}
                templateName={RETAINER_TEMPLATE.name}
              />
            ) : (
              <Skeleton className="h-32 w-full rounded-xl" />
            )
          ) : null}

          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={pending} className="w-full sm:w-auto">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending} disabled={!state || blocked} className="w-full sm:w-auto">
              <Repeat aria-hidden />
              Propose retainer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface ProposeRetainerButtonProps {
  project: RetainerSource;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}

/** "Propose retainer" for any engagement that is not itself a retainer; nothing otherwise. */
export function ProposeRetainerButton({ project, variant = "outline", size = "md", className }: ProposeRetainerButtonProps) {
  if (!canProposeRetainer(project)) return null;
  return (
    <ProposeRetainerDialog
      project={project}
      trigger={
        <Button variant={variant} size={size} className={cn(className)}>
          <Repeat aria-hidden />
          Propose retainer
        </Button>
      }
    />
  );
}
