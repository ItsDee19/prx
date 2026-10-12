import { CalendarCheck, Handshake, Pencil, Rocket, TriangleAlert } from "lucide-react";
import { DeliverablesChecklist } from "@/components/milestones/deliverables-checklist";
import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { ProposeRetainerButton } from "@/components/templates/propose-retainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getGoLiveSummary } from "@/lib/data/golive";
import { listDeliverables } from "@/lib/data/milestones";
import { TUNING_ALERT_DAYS } from "@/lib/constants";
import type { GoLiveSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { CloseTuningDialog } from "./close-tuning-dialog";
import { SetGoLiveDialog } from "./set-go-live-dialog";
import { TuningCountdown, tuningDay } from "./tuning-countdown";

function StatusBadge({ summary }: { summary: GoLiveSummary }) {
  if (summary.tuning_closed_at) {
    return (
      <Badge tone="green" className="gap-1">
        <Handshake className="size-3" aria-hidden />
        Handed over
      </Badge>
    );
  }
  const daysLeft = summary.days_left ?? 0;
  if ((summary.days_elapsed ?? 0) < 0) {
    return (
      <Badge tone="blue" className="gap-1">
        <CalendarCheck className="size-3" aria-hidden />
        Scheduled
      </Badge>
    );
  }
  if (daysLeft < 0) {
    return (
      <Badge tone="red" className="gap-1">
        <TriangleAlert className="size-3" aria-hidden />
        Window ended
      </Badge>
    );
  }
  if (daysLeft <= TUNING_ALERT_DAYS) {
    return (
      <Badge tone="amber" className="gap-1">
        <TriangleAlert className="size-3" aria-hidden />
        Ending soon
      </Badge>
    );
  }
  return (
    <Badge tone="violet" className="gap-1">
      <Rocket className="size-3" aria-hidden />
      Live
    </Badge>
  );
}

/**
 * Overview card "Go-live" (server; SPEC.md §20.2 / §21.2, side column order 20).
 * Before go-live: "Set go-live date". Afterwards: the tuning countdown ring
 * (day N of the window, days left), the end date, the handover checklist (the
 * deliverables of the Scale phase), Close tuning (admin or project owner) and,
 * within TUNING_ALERT_DAYS of the end, Propose retainer.
 */
export async function TuningCard({ project, viewer, isAdmin, today }: ProjectTabProps) {
  const summary = await getGoLiveSummary(project.id, today);
  const handover = summary.scale_milestone_id ? await listDeliverables(summary.scale_milestone_id) : [];
  const canClose = isAdmin || project.owner_id === viewer.id;
  const live = summary.go_live_date !== null;
  const closed = summary.tuning_closed_at !== null;
  // Only the fields ProposeRetainerButton reads (never the admin-only amounts).
  const retainerSource = {
    id: project.id,
    name: project.name,
    client: project.client,
    labels: project.labels,
    members: project.members,
    engagement_type: project.engagement_type,
    template_key: project.template_key,
  };

  if (!live || !summary.go_live_date) {
    return (
      <section aria-labelledby="project-golive-heading">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle id="project-golive-heading">Go-live</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent"
              >
                <Rocket className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">Not live yet.</p>
                <p className="mt-0.5 text-sm text-fg-muted">
                  Set the go-live date to start the {summary.tuning_days}-day tuning countdown.
                  {handover.length > 0
                    ? ` The handover checklist has ${summary.handover_total} ${summary.handover_total === 1 ? "item" : "items"}.`
                    : ""}
                </p>
              </div>
            </div>
            <SetGoLiveDialog
              projectId={project.id}
              goLiveDate={null}
              tuningDays={summary.tuning_days}
              today={today}
              trigger={
                <Button size="sm" className="w-full sm:w-auto">
                  <Rocket aria-hidden />
                  Set go-live date
                </Button>
              }
            />
          </CardContent>
        </Card>
      </section>
    );
  }

  const day = tuningDay(summary);
  const daysLeft = summary.days_left ?? 0;
  const showRetainer = summary.can_propose_retainer;

  return (
    <section aria-labelledby="project-golive-heading">
      <Card>
        <CardHeader className="items-center pb-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CardTitle id="project-golive-heading">Go-live and tuning</CardTitle>
            <StatusBadge summary={summary} />
          </div>
          {!closed ? (
            <SetGoLiveDialog
              projectId={project.id}
              goLiveDate={summary.go_live_date}
              tuningDays={summary.tuning_days}
              today={today}
              trigger={
                <Button variant="ghost" size="icon" className="-mr-2 size-8" aria-label="Edit go-live date">
                  <Pencil aria-hidden />
                </Button>
              }
            />
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
            <TuningCountdown summary={summary} />
            <dl className="min-w-[10.5rem] flex-1 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3 whitespace-nowrap">
                <dt className="text-fg-muted">Live since</dt>
                <dd className="font-medium tabular-nums text-fg">{formatDate(summary.go_live_date)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 whitespace-nowrap">
                <dt className="text-fg-muted">Window</dt>
                <dd className="tabular-nums text-fg">
                  {(summary.days_elapsed ?? 0) < 0
                    ? `${summary.tuning_days} days`
                    : `Day ${day} of ${summary.tuning_days}`}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 whitespace-nowrap">
                <dt className="text-fg-muted">Ends</dt>
                <dd className="tabular-nums text-fg">{formatDate(summary.tuning_end_date)}</dd>
              </div>
              {closed ? (
                <div className="flex items-baseline justify-between gap-3 whitespace-nowrap">
                  <dt className="text-fg-muted">Handed over</dt>
                  <dd className="tabular-nums text-fg">{formatDate(summary.tuning_closed_at)}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          {showRetainer ? (
            <div className="reveal space-y-3 rounded-xl bg-warning/10 px-3.5 py-3 ring-1 ring-inset ring-warning/30">
              <p className="flex items-start gap-2 text-sm text-fg">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  {daysLeft < 0
                    ? "The tuning window has ended. Close it out, or keep supporting the client on a retainer."
                    : daysLeft === 0
                      ? "Tuning ends today. Close it out, or keep supporting the client on a retainer."
                      : `Tuning ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}. Close it out, or keep supporting the client on a retainer.`}
                </span>
              </p>
              <ProposeRetainerButton project={retainerSource} size="sm" className="w-full sm:w-auto" />
            </div>
          ) : null}

          <section aria-labelledby="project-handover-heading" className="space-y-2.5">
            <h4
              id="project-handover-heading"
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted"
            >
              <Handshake className="size-3.5" aria-hidden />
              Handover checklist
            </h4>
            {summary.scale_milestone_id ? (
              <DeliverablesChecklist deliverables={handover} readOnly={closed} />
            ) : (
              <p className="text-sm text-fg-muted">
                No handover checklist yet. It lists the deliverables of the Scale phase (repository, cloud accounts,
                runbook, training, access revoked), as set up by the AI delivery template.
              </p>
            )}
          </section>
        </CardContent>
        {!closed && canClose ? (
          <CardFooter className="justify-between">
            <p className="text-xs text-fg-muted">
              {summary.handover_total === 0
                ? "Close tuning to hand the project over."
                : summary.handover_done >= summary.handover_total
                  ? "Checklist complete. Ready to hand over."
                  : "Hand over once the checklist is done."}
            </p>
            <CloseTuningDialog
              projectId={project.id}
              handoverDone={summary.handover_done}
              handoverTotal={summary.handover_total}
              daysLeft={summary.days_left}
            />
          </CardFooter>
        ) : null}
      </Card>
    </section>
  );
}
