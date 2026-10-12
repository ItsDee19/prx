import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, Plus, SearchX } from "lucide-react";
import { SelectableProjectList } from "@/components/bulk/selectable-project-list";
import { ProjectBoard } from "@/components/projects/project-board";
import {
  countActiveFilters,
  parseProjectParams,
  toProjectFilters,
  type RawSearchParams,
} from "@/components/projects/project-filters";
import { ProjectsToolbar } from "@/components/projects/projects-toolbar";
import { NewProjectWithTemplate } from "@/components/templates";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/data/app-settings";
import { listClientSummaries } from "@/lib/data/clients";
import { listLabels } from "@/lib/data/labels";
import { listProjects } from "@/lib/data/projects";
import { listUserSummaries } from "@/lib/data/users";
import { listFavoriteProjectIds } from "@/lib/data/views";
import type { WorkspaceDateContext } from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { safeTimeZone, workspaceToday } from "@/lib/workspace-time";

export const metadata: Metadata = { title: "Projects" };

interface ProjectsPageProps {
  searchParams: Promise<RawSearchParams>;
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const user = await requireUser();
  const params = parseProjectParams(await searchParams);
  const filters = toProjectFilters(params);
  // The list and board never show amounts, so projects load without commercial fields for everyone.
  const [projects, users, clients, labels, settings, favoriteIds] = await Promise.all([
    listProjects(filters),
    listUserSummaries(),
    listClientSummaries(),
    listLabels(),
    getAppSettings(),
    listFavoriteProjectIds(user.id),
  ]);
  const timeZone = safeTimeZone(settings.workspace_timezone);
  const workspace: WorkspaceDateContext = {
    today: workspaceToday(timeZone),
    timeZone,
    cadenceDays: settings.update_cadence_days,
  };
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
        actions={<NewProjectWithTemplate users={users} today={workspace.today} trigger={newProjectTrigger} />}
      />

      <ProjectsToolbar
        params={params}
        users={users}
        clients={clients}
        labels={labels}
        resultCount={projects.length}
      />

      {projects.length === 0 ? (
        activeFilters > 0 ? (
          <EmptyState
            icon={SearchX}
            title="No projects match."
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
            title="No projects yet."
            description="Create the first engagement to start tracking work across the team."
            action={<NewProjectWithTemplate users={users} today={workspace.today} trigger={newProjectTrigger} />}
          />
        )
      ) : params.view === "list" ? (
        <SelectableProjectList
          projects={projects}
          sort={params.sort}
          workspace={workspace}
          users={users}
          labels={labels}
        />
      ) : (
        <ProjectBoard projects={projects} users={users} workspace={workspace} favoriteIds={favoriteIds} />
      )}
    </div>
  );
}
