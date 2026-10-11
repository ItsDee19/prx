import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, FolderKanban } from "lucide-react";
import { ProjectCard } from "@/components/projects/project-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { ProjectWithMeta } from "@/lib/types";

export interface MyProjectsProps {
  projects: ProjectWithMeta[];
  /** Rendered inside the empty state (typically a "New project" ProjectDialog trigger). */
  emptyAction?: ReactNode;
  className?: string;
}

/** Open projects the current user owns, created or belongs to. */
export function MyProjects({ projects, emptyAction, className }: MyProjectsProps) {
  return (
    <Card className={className}>
      <CardHeader className="items-center">
        <div className="min-w-0">
          <CardTitle>My projects</CardTitle>
          <CardDescription>Open projects you own or are part of</CardDescription>
        </div>
        <Link
          href="/projects"
          className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-accent transition-colors duration-150 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          View all
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Projects you own, create or join will show up here."
            action={emptyAction}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {projects.map((project) => (
              <li key={project.id} className="min-w-0">
                <ProjectCard project={project} compact className="h-full" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
