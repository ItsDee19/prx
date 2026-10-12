import Link from "next/link";
import { Clock, ListChecks, MessageSquare, SquareCheck } from "lucide-react";
import { ClientChip } from "@/components/clients/client-chip";
import { ServiceLineBadge } from "@/components/clients/service-line-badge";
import { LabelChips } from "@/components/labels/label-chips";
import { AvatarStack } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress";
import { RagDot } from "@/components/ui/rag-dot";
import { Tooltip } from "@/components/ui/tooltip";
import { FavoriteToggle } from "@/components/views/favorite-toggle";
import { MILESTONE_STATUS_CONFIG } from "@/lib/constants";
import type { MilestoneSummary, ProjectWithMeta, UserSummary, WorkspaceDateContext } from "@/lib/types";
import { cn, isUpdateDue, pluralize } from "@/lib/utils";
import { DueDate } from "./due-date";
import { PriorityBadge } from "./priority-badge";
import { StatusBadge } from "./status-badge";

export interface ProjectCardProps {
  project: ProjectWithMeta;
  /** Tighter layout without the description (dashboard lists). */
  compact?: boolean;
  /** Workspace today, timezone and update cadence (server pages pass it); enables "Update due" and workspace-time due dates. */
  workspace?: WorkspaceDateContext;
  /**
   * The viewer's favourite state (`listFavoriteProjectIds` on the server). When
   * given, a star toggle sits in the card's top-right corner; omitted, no star.
   */
  favorite?: boolean;
  className?: string;
}

/** Owner first, then members, without repeating the owner. */
export function projectPeople(project: ProjectWithMeta): UserSummary[] {
  const people: UserSummary[] = [];
  const seen = new Set<string>();
  for (const user of [project.owner, ...project.members]) {
    if (!user || seen.has(user.id)) continue;
    seen.add(user.id);
    people.push(user);
  }
  return people;
}

/** True when an ongoing project has gone `cadenceDays` without a status update (workspace time). */
export function projectUpdateDue(project: ProjectWithMeta, workspace: WorkspaceDateContext | undefined): boolean {
  return workspace ? isUpdateDue(project, workspace.today, workspace.cadenceDays, workspace.timeZone) : false;
}

/* ---------------------- Shared meta pieces (card, list, board) ---------------------- */

const CHIP_CLASS =
  "inline-flex h-5 min-w-0 max-w-full shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium leading-none ring-1 ring-inset";

/** The active phase ("Pilot"), amber while it awaits a gate decision. */
export function ProjectPhaseChip({ phase, className }: { phase: MilestoneSummary; className?: string }) {
  const config = MILESTONE_STATUS_CONFIG[phase.status];
  const inReview = phase.status === "gate_review";
  return (
    <Tooltip content={inReview ? `${phase.name}: awaiting a gate decision` : `Current phase: ${phase.name}`}>
      <span
        className={cn(
          CHIP_CLASS,
          inReview
            ? "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30"
            : "bg-accent-soft text-accent-soft-fg ring-accent/20",
          className,
        )}
      >
        <Icon name={config.icon} className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{phase.name}</span>
        <span className="sr-only">{inReview ? " (gate review)" : " (current phase)"}</span>
      </span>
    </Tooltip>
  );
}

/** "Update due": an ongoing engagement without a status update this cadence. */
export function UpdateDueBadge({ className }: { className?: string }) {
  return (
    <Tooltip content="No status update this cycle. Post one from the project's Updates tab.">
      <span
        className={cn(
          CHIP_CLASS,
          "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30",
          className,
        )}
      >
        <Clock className="size-3 shrink-0" aria-hidden />
        Update due
      </span>
    </Tooltip>
  );
}

/** Done / total tasks, shown when progress comes from tasks. */
export function TaskCountPill({ project, className }: { project: ProjectWithMeta; className?: string }) {
  if (project.progress_mode !== "tasks" || project.task_count === 0) return null;
  const label = `${project.task_done_count} of ${pluralize(project.task_count, "task")} done`;
  return (
    <Tooltip content={label}>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-fg-muted",
          className,
        )}
      >
        <ListChecks className="size-3.5 shrink-0" aria-hidden />
        {project.task_done_count}/{project.task_count}
        <span className="sr-only">{label}</span>
      </span>
    </Tooltip>
  );
}

/** Completed / total direct sub-projects. */
export function SubprojectPill({ project, className }: { project: ProjectWithMeta; className?: string }) {
  if (project.subproject_count === 0) return null;
  const label = `${project.subproject_completed} of ${pluralize(project.subproject_count, "sub-project")} completed`;
  return (
    <Tooltip content={label}>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-fg-muted",
          className,
        )}
      >
        <SquareCheck className="size-3.5 shrink-0" aria-hidden />
        {project.subproject_completed}/{project.subproject_count}
        <span className="sr-only">{label}</span>
      </span>
    </Tooltip>
  );
}

/** Client code and service line icon, side by side (nothing when neither is set). */
export function ProjectEngagementTags({ project, className }: { project: ProjectWithMeta; className?: string }) {
  if (!project.client && !project.service_line) return null;
  return (
    <span className={cn("inline-flex min-w-0 shrink-0 items-center gap-1", className)}>
      {project.client ? <ClientChip client={project.client} /> : null}
      {project.service_line ? <ServiceLineBadge value={project.service_line} iconOnly /> : null}
    </span>
  );
}

/**
 * A project summary rendered as a single link. It holds no state, so a board
 * can wrap it in a draggable element without forwarding refs. With `favorite`
 * the favourite star is rendered next to the link (a sibling, never nested
 * inside the anchor) and positioned over the card's top-right corner.
 */
export function ProjectCard({ favorite, ...props }: ProjectCardProps) {
  if (favorite === undefined) return <ProjectCardLink {...props} />;
  return (
    <div className="relative min-w-0">
      <ProjectCardLink {...props} reserveCorner />
      <FavoriteToggle
        projectId={props.project.id}
        initial={favorite}
        projectName={props.project.name}
        className={cn("absolute right-1.5", props.compact ? "top-1.5" : "top-2")}
      />
    </div>
  );
}

function ProjectCardLink({
  project,
  compact = false,
  workspace,
  className,
  reserveCorner = false,
}: Omit<ProjectCardProps, "favorite"> & { reserveCorner?: boolean }) {
  const people = projectPeople(project);
  const updateDue = projectUpdateDue(project, workspace);
  const hasSignals = Boolean(project.current_phase) || updateDue || project.health !== null;

  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        "group block min-w-0 rounded-2xl border border-border bg-surface shadow-card outline-none",
        "transition-[border-color,box-shadow,transform] duration-(--dur-2) ease-out-quart",
        "hover:-translate-y-px hover:border-border-strong hover:shadow-pop motion-reduce:hover:translate-y-0",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        compact ? "p-3" : "p-3.5",
        className,
      )}
    >
      <div className={cn("flex items-start gap-2", reserveCorner && "pr-7")}>
        {project.color ? (
          <span
            aria-hidden
            className="mt-1.5 size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium leading-5 text-fg transition-colors duration-(--dur-2) group-hover:text-accent"
            title={project.name}
          >
            {project.name}
          </p>
          {project.parent_name || project.client || project.service_line ? (
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
              <ProjectEngagementTags project={project} />
              {project.parent_name ? (
                <span className="min-w-0 truncate text-xs text-fg-subtle" title={project.parent_name}>
                  in {project.parent_name}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <PriorityBadge priority={project.priority} iconOnly className="-mr-1 -mt-0.5" />
      </div>

      {!compact && project.description ? (
        <p className="mt-2 line-clamp-2 text-xs leading-[1.2rem] text-fg-muted [overflow-wrap:anywhere]">
          {project.description}
        </p>
      ) : null}

      {hasSignals ? (
        <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", compact ? "mt-2" : "mt-2.5")}>
          {project.health !== null ? <RagDot health={project.health} showLabel className="mr-0.5" /> : null}
          {project.current_phase ? <ProjectPhaseChip phase={project.current_phase} /> : null}
          {updateDue ? <UpdateDueBadge /> : null}
        </div>
      ) : null}

      {project.labels.length > 0 ? <LabelChips labels={project.labels} max={3} className="mt-2" /> : null}

      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", compact ? "mt-2" : "mt-3")}>
        <StatusBadge status={project.status} />
        <DueDate date={project.due_date} status={project.status} withIcon today={workspace?.today} />
        <SubprojectPill project={project} />
        <TaskCountPill project={project} />
        {project.comment_count > 0 ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-fg-muted"
            title={pluralize(project.comment_count, "comment")}
          >
            <MessageSquare className="size-3.5 shrink-0" aria-hidden />
            {project.comment_count}
            <span className="sr-only">{pluralize(project.comment_count, "comment")}</span>
          </span>
        ) : null}
        {people.length > 0 ? <AvatarStack users={people} size="xs" max={3} className="ml-auto shrink-0" /> : null}
      </div>

      <ProgressBar value={project.progress} size="sm" showLabel className={cn(compact ? "mt-2" : "mt-3")} />
    </Link>
  );
}
