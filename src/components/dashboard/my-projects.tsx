import type { ReactNode } from "react";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { ClientChip } from "@/components/clients/client-chip";
import { ProjectPhaseChip, UpdateDueBadge, projectUpdateDue } from "@/components/projects/project-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { RagDot } from "@/components/ui/rag-dot";
import type { ProjectWithMeta, WorkspaceDateContext } from "@/lib/types";
import { BentoTile, TILE_ROW_CLASS, TILE_ROW_LINK_CLASS, TileEmpty } from "./bento";

export interface MyProjectsProps {
  /** Loaded without commercial fields. */
  projects: ProjectWithMeta[];
  workspace: WorkspaceDateContext;
  /** Rendered inside the empty state (typically a "New project" trigger). */
  emptyAction?: ReactNode;
  className?: string;
}

/** Open projects I own, created or belong to: progress ring, client, health and current phase. */
export function MyProjects({ projects, workspace, emptyAction, className }: MyProjectsProps) {
  return (
    <BentoTile
      id="home-my-projects"
      title="My projects"
      icon={FolderKanban}
      description="Open projects you own or are part of."
      action={projects.length > 0 ? { href: "/projects", label: "View all" } : undefined}
      className={className}
    >
      {projects.length === 0 ? (
        <TileEmpty
          icon={FolderKanban}
          title="You're not on an open project yet."
          description="Projects you own, create or are added to show here with their health and current phase."
          action={emptyAction}
        />
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {projects.map((project) => {
            const updateDue = projectUpdateDue(project, workspace);
            return (
              <li key={project.id} className={TILE_ROW_CLASS}>
                <ProgressRing
                  value={project.progress}
                  size={36}
                  showValue
                  tone={project.progress >= 100 ? "success" : "accent"}
                  label={`${project.name} progress`}
                />
                <div className="min-w-0 flex-1">
                  <Link href={`/projects/${project.id}`} className={TILE_ROW_LINK_CLASS}>
                    {project.name}
                  </Link>
                  <div className="relative z-10 mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                    {project.client ? <ClientChip client={project.client} /> : null}
                    <RagDot health={project.health} showLabel className="max-w-full" />
                    {project.current_phase ? <ProjectPhaseChip phase={project.current_phase} /> : null}
                    {updateDue ? <UpdateDueBadge /> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </BentoTile>
  );
}
