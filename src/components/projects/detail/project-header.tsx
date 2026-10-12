import { Flag, Gavel } from "lucide-react";
import { ClientChip } from "@/components/clients/client-chip";
import { UserAvatar } from "@/components/ui/avatar";
import { PageHeader, type Breadcrumb } from "@/components/ui/page-header";
import { RagDot } from "@/components/ui/rag-dot";
import { Tooltip } from "@/components/ui/tooltip";
import { PriorityBadge } from "@/components/projects/priority-badge";
import { StatusSelect } from "@/components/projects/status-select";
import { FavoriteToggle } from "@/components/views/favorite-toggle";
import type { ProjectAncestor, ProjectWithMeta, UserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProjectActions } from "./project-actions";
import { ProjectWatchButton } from "./project-watch-button";

export interface ProjectHeaderProps {
  project: ProjectWithMeta;
  ancestors: ProjectAncestor[];
  users: UserSummary[];
  /** canDeleteProject(viewer, project), computed on the server. */
  canDelete: boolean;
  /** Descendants removed with the project (countSubtree). */
  subtreeTotal: number;
  /** The viewer starred this project (isFavorite, loaded on the server). */
  favorite: boolean;
}

/**
 * The project page header: breadcrumbs (Projects › ancestors › project), the
 * colour dot and name, then status, priority, health, client, current phase
 * and owner, with Favourite, Watch and the project actions on the right (a full-width
 * row on phones).
 */
export function ProjectHeader({ project, ancestors, users, canDelete, subtreeTotal, favorite }: ProjectHeaderProps) {
  const breadcrumbs: Breadcrumb[] = [
    { label: "Projects", href: "/projects" },
    ...ancestors.map((ancestor) => ({ label: ancestor.name, href: `/projects/${ancestor.id}` })),
    { label: project.name },
  ];
  const phase = project.current_phase;
  const gate = phase?.status === "gate_review";

  return (
    <PageHeader
      className="mb-4 sm:mb-5"
      breadcrumbs={breadcrumbs}
      title={
        <span className="flex min-w-0 items-start gap-2.5 sm:gap-3">
          {/* Centred on the first line of the title (28px line, 32px from sm). */}
          <span
            aria-hidden
            className="mt-[0.4375rem] size-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10 sm:mt-[0.5625rem]"
            style={{ backgroundColor: project.color ?? "var(--fg-subtle)" }}
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">{project.name}</span>
        </span>
      }
      description={
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <StatusSelect projectId={project.id} status={project.status} size="sm" />
          <PriorityBadge priority={project.priority} />
          <RagDot health={project.health} showLabel />
          {project.client ? <ClientChip client={project.client} /> : null}
          {phase ? (
            <span
              className={cn(
                "inline-flex h-5 min-w-0 max-w-full items-center gap-1 rounded-full px-2 text-[11px] font-medium",
                gate ? "bg-warning/10 text-warning ring-1 ring-inset ring-warning/30" : "bg-accent-soft text-accent-soft-fg",
              )}
            >
              {gate ? <Gavel className="size-3 shrink-0" aria-hidden /> : <Flag className="size-3 shrink-0" aria-hidden />}
              <span className="sr-only">{gate ? "In gate review:" : "Current phase:"}</span>
              <span className="truncate">{phase.name}</span>
            </span>
          ) : null}
          {project.owner ? (
            <Tooltip content={`Owner: ${project.owner.name}`}>
              <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs text-fg-muted">
                <UserAvatar user={project.owner} size="xs" />
                <span className="truncate">{project.owner.name}</span>
              </span>
            </Tooltip>
          ) : (
            <span className="text-xs text-fg-subtle">Unassigned</span>
          )}
          {project.parent_name ? (
            <span className="min-w-0 max-w-full truncate text-xs text-fg-subtle" title={project.parent_name}>
              in {project.parent_name}
            </span>
          ) : null}
        </span>
      }
      actions={
        <>
          <FavoriteToggle projectId={project.id} initial={favorite} size="md" projectName={project.name} />
          <ProjectWatchButton projectId={project.id} />
          <ProjectActions project={project} users={users} subtreeTotal={subtreeTotal} canDelete={canDelete} />
        </>
      }
    />
  );
}
