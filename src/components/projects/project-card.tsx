import Link from "next/link";
import { MessageSquare, SquareCheck } from "lucide-react";
import { AvatarStack } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import type { ProjectWithMeta, UserSummary } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { DueDate } from "./due-date";
import { PriorityBadge } from "./priority-badge";
import { StatusBadge } from "./status-badge";

export interface ProjectCardProps {
  project: ProjectWithMeta;
  /** Tighter layout without the description (dashboard lists). */
  compact?: boolean;
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

/**
 * A project summary rendered as a single link. It holds no state, so a board
 * can wrap it in a draggable element without forwarding refs.
 */
export function ProjectCard({ project, compact = false, className }: ProjectCardProps) {
  const people = projectPeople(project);
  const hasSubprojects = project.subproject_count > 0;
  const subLabel = `${project.subproject_completed} of ${pluralize(project.subproject_count, "sub-project")} completed`;

  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        "group block rounded-lg border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none",
        "transition-[border-color,box-shadow] duration-150",
        "hover:border-border-strong hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent",
        compact ? "p-3" : "p-3.5",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {project.color ? (
          <span
            aria-hidden
            className="mt-1.5 size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-5 text-fg group-hover:text-accent">
            {project.name}
          </p>
          {project.parent_name ? (
            <p className="truncate text-xs text-fg-subtle">in {project.parent_name}</p>
          ) : null}
        </div>
        <PriorityBadge priority={project.priority} iconOnly className="-mr-1 -mt-0.5" />
      </div>

      {!compact && project.description ? (
        <p className="mt-2 line-clamp-2 text-xs leading-[1.2rem] text-fg-muted">
          {project.description}
        </p>
      ) : null}

      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", compact ? "mt-2" : "mt-3")}>
        <StatusBadge status={project.status} />
        <DueDate date={project.due_date} status={project.status} withIcon />
        {hasSubprojects ? (
          <Tooltip content={subLabel}>
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-fg-muted">
              <SquareCheck className="size-3.5 shrink-0" aria-hidden />
              {project.subproject_completed}/{project.subproject_count}
              <span className="sr-only">{subLabel}</span>
            </span>
          </Tooltip>
        ) : null}
        {project.comment_count > 0 ? (
          <span
            className="inline-flex items-center gap-1 text-[11px] tabular-nums text-fg-muted"
            title={pluralize(project.comment_count, "comment")}
          >
            <MessageSquare className="size-3.5 shrink-0" aria-hidden />
            {project.comment_count}
            <span className="sr-only">{pluralize(project.comment_count, "comment")}</span>
          </span>
        ) : null}
        {people.length > 0 ? <AvatarStack users={people} size="xs" max={3} className="ml-auto" /> : null}
      </div>

      <ProgressBar value={project.progress} size="sm" showLabel className={cn(compact ? "mt-2" : "mt-3")} />
    </Link>
  );
}
