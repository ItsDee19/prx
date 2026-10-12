import { Suspense, cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Reveal } from "@/components/motion";
import { ProjectHeader } from "@/components/projects/detail/project-header";
import { ProjectTabSkeleton } from "@/components/projects/detail/project-tab-skeleton";
import { ProjectTabsNav } from "@/components/projects/detail/project-tabs-nav";
import { resolveProjectTab, visibleProjectTabs } from "@/components/projects/detail/tabs/registry";
import type { ProjectTabContext, ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { canDeleteProject, requireUser } from "@/lib/auth";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { getProjectTabCounts } from "@/lib/data/project-detail";
import { countSubtree, getProject, getProjectAncestors } from "@/lib/data/projects";
import { listUserSummaries } from "@/lib/data/users";
import { isFavorite } from "@/lib/data/views";

interface ProjectPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Memoised per request so generateMetadata and the page share one lookup.
 * Admin-only fields are loaded only for admins (SPEC.md section 23.3).
 */
const loadProject = cache((id: string, includeCommercial: boolean) => getProject(id, { includeCommercial }));

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const project = await loadProject(id, user.role === "admin");
  return { title: project ? project.name : "Project not found" };
}

/**
 * Project detail: header, tab bar and the active tab (`?tab=`, default
 * overview; unknown or hidden tabs fall back to the overview). Only the
 * active tab's component renders, so only its data loads; it streams in
 * behind a skeleton and rises in when it arrives.
 */
export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, requireUser()]);
  const isAdmin = user.role === "admin";

  const project = await loadProject(id, isAdmin);
  if (!project) notFound();

  // Everything below depends only on the project: fetch it concurrently.
  const [ancestors, counts, users, subtree, today, favorite] = await Promise.all([
    getProjectAncestors(id),
    getProjectTabCounts(id),
    listUserSummaries(),
    countSubtree(id),
    getWorkspaceToday(),
    isFavorite(user.id, id),
  ]);

  const context: ProjectTabContext = { project, viewer: user, isAdmin, counts };
  const tabs = visibleProjectTabs(context);
  const active = resolveProjectTab(query.tab, tabs);
  const tabProps: ProjectTabProps = { ...context, users, today, searchParams: query };
  const ActiveTab = active.component;

  return (
    <div className="min-w-0">
      <ProjectHeader
        project={project}
        ancestors={ancestors}
        users={users}
        canDelete={canDeleteProject(user, project)}
        subtreeTotal={subtree.total}
        favorite={favorite}
      />
      <ProjectTabsNav
        projectId={project.id}
        tabs={tabs}
        activeId={active.id}
        context={context}
        className="mb-4 sm:mb-6"
      />
      <div role="region" aria-label={active.label} className="min-w-0">
        <Suspense key={active.id} fallback={<ProjectTabSkeleton tab={active.id} />}>
          <Reveal key={active.id} y={6} className="min-w-0">
            <ActiveTab {...tabProps} />
          </Reveal>
        </Suspense>
      </div>
    </div>
  );
}
