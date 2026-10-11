import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, Plus, SearchX } from "lucide-react";
import { ProjectBoard } from "@/components/projects/project-board";
import { ProjectDialog } from "@/components/projects/project-dialog";
import {
  countActiveFilters,
  parseProjectParams,
  toProjectFilters,
  type RawSearchParams,
} from "@/components/projects/project-filters";
import { ProjectList } from "@/components/projects/project-list";
import { ProjectsToolbar } from "@/components/projects/projects-toolbar";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { listProjects } from "@/lib/data/projects";
import { listUserSummaries } from "@/lib/data/users";
import { pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Projects" };

interface ProjectsPageProps {
  searchParams: Promise<RawSearchParams>;
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  await requireUser();
  const params = parseProjectParams(await searchParams);
  const filters = toProjectFilters(params);
  const projects = listProjects(filters);
  const users = listUserSummaries();
  const activeFilters = countActiveFilters(params);

  const description =
    activeFilters > 0
      ? `${pluralize(projects.length, "project")} match your filters`
      : `${pluralize(projects.length, "project")}${params.includeSub ? " at every level" : ""}`;

  const newProjectTrigger = (
    <Button>
      <Plus aria-hidden />
      New project
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Projects"
        description={description}
        actions={<ProjectDialog mode="create" users={users} trigger={newProjectTrigger} />}
      />

      <ProjectsToolbar params={params} users={users} />

      {projects.length === 0 ? (
        activeFilters > 0 ? (
          <EmptyState
            icon={SearchX}
            title="No projects match"
            description="Try a different search or loosen the filters."
            action={
              <Link
                href={params.view === "list" ? "/projects?view=list" : "/projects"}
                className={buttonVariants({ variant: "outline" })}
              >
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create the first project to start tracking work across the team."
            action={<ProjectDialog mode="create" users={users} trigger={newProjectTrigger} />}
          />
        )
      ) : params.view === "list" ? (
        <ProjectList projects={projects} sort={params.sort} />
      ) : (
        <ProjectBoard projects={projects} users={users} />
      )}
    </div>
  );
}
