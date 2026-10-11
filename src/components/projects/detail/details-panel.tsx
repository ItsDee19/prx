import type { ReactNode } from "react";
import { UserAvatar } from "@/components/ui/avatar";
import { TimeAgo } from "@/components/ui/time-ago";
import { DueDate } from "@/components/projects/due-date";
import type { ProjectWithMeta, UserSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { MembersEditor } from "./members-editor";
import { ProgressEditor } from "./progress-editor";

export interface DetailsPanelProps {
  project: ProjectWithMeta;
  users: UserSummary[];
  /** Display name of the creator (resolved server-side; may be a deactivated user). */
  createdByName: string;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
      <dt className="pt-0.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="min-w-0 text-sm text-fg">{children}</dd>
    </div>
  );
}

/** Definition list of the project's metadata with inline editors for members and progress. */
export function DetailsPanel({ project, users, createdByName }: DetailsPanelProps) {
  return (
    <dl className="divide-y divide-border">
      <Row label="Owner">
        {project.owner ? (
          <span className="inline-flex max-w-full items-center gap-2">
            <UserAvatar user={project.owner} size="sm" />
            <span className="truncate">{project.owner.name}</span>
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
          <span className="text-fg-subtle">&mdash;</span>
        )}
      </Row>
      <Row label="Due date">
        <DueDate date={project.due_date} status={project.status} withIcon className="text-sm" />
      </Row>
      <Row label="Progress">
        <ProgressEditor projectId={project.id} progress={project.progress} />
      </Row>
      <Row label="Created by">
        <span className="truncate">{createdByName}</span>
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
