import type { ReactNode } from "react";
import { ClientChip } from "@/components/clients/client-chip";
import { ServiceLineBadge } from "@/components/clients/service-line-badge";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { TimeAgo } from "@/components/ui/time-ago";
import { DueDate } from "@/components/projects/due-date";
import {
  BUDGET_PERIOD_CONFIG,
  DELIVERY_STATE_CONFIG,
  ENGAGEMENT_TYPE_CONFIG,
  type BadgeTone,
  type IconName,
} from "@/lib/constants";
import type { ProjectWithMeta, UserSummary } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { MembersEditor } from "./members-editor";
import { ProgressEditor } from "./progress-editor";

export interface DetailsPanelProps {
  project: ProjectWithMeta;
  users: UserSummary[];
  /** Display name of the creator (resolved server-side; may be a deactivated user). */
  createdByName: string;
  /** Workspace today (overdue state of the due date). */
  today?: string;
}

function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 border-t border-border py-3",
        "sm:grid-cols-[6.5rem_minmax(0,1fr)]",
        className,
      )}
    >
      <dt className="pt-0.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="min-w-0 text-sm text-fg">{children}</dd>
    </div>
  );
}

function OptionBadge({ tone, icon, label }: { tone: BadgeTone; icon: IconName; label: string }) {
  return (
    <Badge tone={tone} className="max-w-full gap-1">
      <Icon name={icon} className="size-3" />
      <span className="truncate">{label}</span>
    </Badge>
  );
}

const NONE = <span className="text-fg-subtle">&mdash;</span>;

/** One-line basis for derived progress (null = the mode's own description). */
function progressDetail(project: ProjectWithMeta): string | null {
  switch (project.progress_mode) {
    case "tasks":
      return project.task_count > 0
        ? `${project.task_done_count} of ${project.task_count} tasks done.`
        : "No tasks yet.";
    case "milestones":
      return project.current_phase ? `Current phase: ${project.current_phase.name}.` : null;
    default:
      return null;
  }
}

/**
 * Definition list of the project's metadata with inline editors for members
 * and (manual) progress: engagement (client, service line, engagement type,
 * delivery state, hours budget), people, dates and progress mode. The contract
 * value and hourly rate are never shown here (admins see them in the
 * commercial card).
 *
 * Layout: one column of label/value rows on phones and in the desktop side
 * column (xl up); a compact two-column list from md to xl, where the panel
 * spans the full page width. Rows carry a top border; the first row of each
 * column drops it, and the list's negative block margin cancels the outer
 * rows' padding so the card padding stays even.
 */
export function DetailsPanel({ project, users, createdByName, today }: DetailsPanelProps) {
  const engagement = project.engagement_type ? ENGAGEMENT_TYPE_CONFIG[project.engagement_type] : null;
  const delivery = DELIVERY_STATE_CONFIG[project.delivery_state];

  return (
    <dl
      className={cn(
        "-my-3 grid grid-cols-1",
        "[&>div:first-child]:border-t-0",
        "md:grid-cols-2 md:gap-x-8 md:[&>div:nth-child(2)]:border-t-0",
        "xl:grid-cols-1 xl:gap-x-0 xl:[&>div:nth-child(2)]:border-t",
      )}
    >
      <Row label="Client">
        {project.client ? <ClientChip client={project.client} showName /> : <span className="text-fg-subtle">No client</span>}
      </Row>
      <Row label="Service">{project.service_line ? <ServiceLineBadge value={project.service_line} /> : NONE}</Row>
      <Row label="Engagement">
        {engagement ? <OptionBadge tone={engagement.tone} icon={engagement.icon} label={engagement.label} /> : NONE}
      </Row>
      <Row label="Delivery">
        <OptionBadge tone={delivery.tone} icon={delivery.icon} label={delivery.label} />
      </Row>
      <Row label="Owner">
        {project.owner ? (
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar user={project.owner} size="sm" />
            <span className="min-w-0 truncate" title={project.owner.name}>
              {project.owner.name}
            </span>
          </span>
        ) : (
          <span className="text-fg-subtle">Unassigned</span>
        )}
      </Row>
      <Row label="Members">
        <MembersEditor projectId={project.id} members={project.members} users={users} />
      </Row>
      <Row label="Start date">
        {project.start_date ? (
          <time dateTime={project.start_date} className="tabular-nums">
            {formatDate(project.start_date)}
          </time>
        ) : (
          NONE
        )}
      </Row>
      <Row label="Due date">
        <DueDate date={project.due_date} status={project.status} withIcon today={today} className="text-sm" />
      </Row>
      {/* The editor needs width for its slider: label above it on phones and in the narrow side
          column (xl up); label beside it from sm, spanning both list columns from md to xl. */}
      <Row label="Progress" className="grid-cols-1 md:col-span-2 xl:col-span-1 xl:grid-cols-1">
        <ProgressEditor
          projectId={project.id}
          progress={project.progress}
          mode={project.progress_mode}
          detail={progressDetail(project)}
        />
      </Row>
      <Row label="Budget">
        {project.budget_hours !== null ? (
          <span className="tabular-nums">
            {project.budget_hours.toLocaleString("en-US")}h{" "}
            <span className="text-fg-muted">{BUDGET_PERIOD_CONFIG[project.budget_period].label.toLowerCase()}</span>
          </span>
        ) : (
          <span className="text-fg-subtle">No hours budget</span>
        )}
      </Row>
      <Row label="Created by">
        <span className="block truncate" title={createdByName}>
          {createdByName}
        </span>
      </Row>
      <Row label="Created">
        <TimeAgo date={project.created_at} className="text-fg-muted" />
      </Row>
      <Row label="Updated">
        <TimeAgo date={project.updated_at} className="text-fg-muted" />
      </Row>
      {project.completed_at ? (
        <Row label="Completed">
          <TimeAgo date={project.completed_at} className="text-fg-muted" />
        </Row>
      ) : null}
    </dl>
  );
}
