import { CalendarRange, Gavel, TriangleAlert } from "lucide-react";
import { computeTemplateSchedule } from "@/lib/templates";
import type { TemplatePayload } from "@/lib/types";
import { cn, formatDate, pluralize } from "@/lib/utils";
import { isDateOnly } from "@/lib/workspace-time";
import { PhaseStrip } from "./phase-strip";

export interface TemplateSchedulePreviewProps {
  payload: TemplatePayload;
  /** "YYYY-MM-DD"; anything else shows a prompt to pick a start date. */
  startDate: string | null | undefined;
  /** The form's due date: empty means it is filled from the build end on create. */
  dueDate?: string | null;
  templateName?: string;
  className?: string;
}

const SHORT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

function range(start: string, end: string): string {
  if (start === end) return formatDate(start, SHORT);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDate(start, sameYear ? SHORT : undefined)} – ${formatDate(end)}`;
}

/**
 * The exact phase and milestone dates a template produces from a start date
 * (`computeTemplateSchedule`, the same function `applyTemplate` uses), with
 * the build end that becomes an empty due date and the tuning window. Used by
 * the New project details step (`detailsAside`) and the conversion dialogs.
 */
export function TemplateSchedulePreview({ payload, startDate, dueDate, templateName, className }: TemplateSchedulePreviewProps) {
  const validStart = typeof startDate === "string" && isDateOnly(startDate) ? startDate : null;
  const schedule = validStart ? computeTemplateSchedule(payload, validStart) : null;
  const tuning = schedule?.milestones.find((milestone) => milestone.is_tuning) ?? null;
  const hasPlan = payload.milestones.length > 0;
  const dueBeforeBuild = Boolean(schedule && dueDate && hasPlan && dueDate < schedule.build_end_date);

  return (
    <section
      aria-label={templateName ? `Plan from the ${templateName} template` : "Template plan"}
      className={cn("reveal-fade min-w-0 rounded-xl border border-border bg-surface-2/40 p-3.5", className)}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-fg">
          <CalendarRange className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg [overflow-wrap:anywhere]">
            {templateName ? `${templateName} plan` : "Plan"}
          </p>
          <p className="text-xs text-fg-muted">
            {!schedule
              ? "Pick a start date to see the phase dates."
              : !hasPlan
                ? "This template has no phases."
                : tuning
                  ? `Build ends ${formatDate(schedule.build_end_date)} · tuning until ${formatDate(tuning.due_date)}.`
                  : `Ends ${formatDate(schedule.build_end_date)}.`}
          </p>
        </div>
      </div>

      {hasPlan ? <PhaseStrip payload={payload} className="mt-3" /> : null}

      {schedule && hasPlan ? (
        <ol className="mt-3 space-y-1">
          {schedule.milestones.map((milestone, index) => {
            const deliverables = milestone.tasks.filter((task) => task.is_deliverable).length;
            return (
              <li
                key={`${milestone.key}-${index}`}
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-1 py-1 text-xs"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0",
                    milestone.kind === "milestone" ? "rotate-45 rounded-[2px] bg-fg" : "rounded-full",
                    milestone.kind === "phase" && (milestone.is_tuning ? "bg-accent-3" : "bg-accent"),
                  )}
                />
                <span className="min-w-0 truncate font-medium text-fg">{milestone.name}</span>
                <span className="shrink-0 text-right tabular-nums text-fg-muted">
                  {range(milestone.start_date, milestone.due_date)}
                </span>
                {milestone.requires_gate || deliverables > 0 ? (
                  <span className="col-start-2 col-end-4 flex min-w-0 flex-wrap items-center gap-x-2 text-[11px] text-fg-muted">
                    {milestone.requires_gate ? (
                      <span className="inline-flex items-center gap-1">
                        <Gavel className="size-3" aria-hidden />
                        Go/no-go gate
                      </span>
                    ) : null}
                    {deliverables > 0 ? <span className="tabular-nums">{pluralize(deliverables, "deliverable")}</span> : null}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {schedule && hasPlan && !dueDate ? (
        <p className="mt-2 text-xs text-fg-muted">
          Due date: {formatDate(schedule.build_end_date)}, the end of the build. Set one above to override it.
        </p>
      ) : null}
      {dueBeforeBuild && schedule ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          The due date is before the plan&apos;s build end ({formatDate(schedule.build_end_date)}).
        </p>
      ) : null}
    </section>
  );
}
