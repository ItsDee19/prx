import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, type Breadcrumb } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { PriorityBadge } from "@/components/projects/priority-badge";
import { StatusSelect } from "@/components/projects/status-select";
import { ActivityFeed } from "@/components/projects/detail/activity-feed";
import { CommentsSection } from "@/components/projects/detail/comments-section";
import { DetailsPanel } from "@/components/projects/detail/details-panel";
import { ProjectActions } from "@/components/projects/detail/project-actions";
import { ProjectTree } from "@/components/projects/detail/project-tree";
import { canDeleteProject, requireUser } from "@/lib/auth";
import { listProjectActivity } from "@/lib/data/activity";
import { listComments } from "@/lib/data/comments";
import {
  countSubtree,
  getProject,
  getProjectAncestors,
  getSubprojectTree,
} from "@/lib/data/projects";
import { getUserById, listUserSummaries } from "@/lib/data/users";
import { percent, pluralize } from "@/lib/utils";

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { id } = await params;
  const project = getProject(id);
  return { title: project ? project.name : "Project not found" };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const user = await requireUser();

  const project = getProject(id);
  if (!project) notFound();

  const ancestors = getProjectAncestors(id);
  const tree = getSubprojectTree(id);
  const subtree = countSubtree(id);
  const comments = listComments(id);
  const activity = listProjectActivity(id, 30);
  const users = listUserSummaries();
  const creator = getUserById(project.created_by);

  const breadcrumbs: Breadcrumb[] = [
    { label: "Projects", href: "/projects" },
    ...ancestors.map((a) => ({ label: a.name, href: `/projects/${a.id}` })),
    { label: project.name },
  ];

  const description = project.description.trim();
  const viewer = { id: user.id, name: user.name, color: user.color, role: user.role };

  return (
    <div>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="size-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
              style={{ backgroundColor: project.color ?? "var(--fg-subtle)" }}
            />
            <span className="min-w-0 break-words">{project.name}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusSelect projectId={project.id} status={project.status} size="sm" />
            <PriorityBadge priority={project.priority} />
            {project.owner ? (
              <Tooltip content={`Owner: ${project.owner.name}`}>
                <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                  <UserAvatar user={project.owner} size="xs" />
                  <span className="truncate">{project.owner.name}</span>
                </span>
              </Tooltip>
            ) : (
              <span className="text-xs text-fg-subtle">Unassigned</span>
            )}
            {project.parent_name ? (
              <span className="text-xs text-fg-subtle">in {project.parent_name}</span>
            ) : null}
          </span>
        }
        actions={
          <ProjectActions
            project={project}
            users={users}
            subtreeTotal={subtree.total}
            canDelete={canDeleteProject(user, project)}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              {description ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-fg">{description}</p>
              ) : (
                <p className="text-sm text-fg-muted">
                  No description yet.{" "}
                  <span className="inline-flex items-center gap-1 text-fg-subtle">
                    Use <Pencil className="size-3" aria-hidden /> Edit to add one.
                  </span>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-wrap">
              <div className="flex items-center gap-2">
                <CardTitle>Sub-projects</CardTitle>
                <Badge tone="neutral">{tree.length}</Badge>
              </div>
              {subtree.total > 0 ? (
                <div className="flex items-center gap-2 text-xs text-fg-muted">
                  <ProgressBar
                    value={percent(subtree.completed, subtree.total)}
                    size="sm"
                    className="w-24"
                    label="Sub-projects completed"
                  />
                  <span className="whitespace-nowrap tabular-nums">
                    {subtree.completed}/{subtree.total} done
                  </span>
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              <ProjectTree
                parent={{ id: project.id, name: project.name }}
                nodes={tree}
                users={users}
                viewer={{ id: user.id, role: user.role }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Comments</CardTitle>
                {comments.length > 0 ? <Badge tone="neutral">{comments.length}</Badge> : null}
              </div>
            </CardHeader>
            <CardContent>
              <CommentsSection projectId={project.id} comments={comments} viewer={viewer} />
            </CardContent>
          </Card>
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Project details and activity">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailsPanel
                project={project}
                users={users}
                createdByName={creator?.name ?? "Unknown user"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              {activity.length > 0 ? (
                <span className="text-xs text-fg-subtle">{pluralize(activity.length, "entry", "entries")}</span>
              ) : null}
            </CardHeader>
            <CardContent>
              <ActivityFeed items={activity} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
