import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { taskPageHref } from "@/components/tasks/task-helpers";
import { TaskPageActions, TaskPageView } from "@/components/tasks/task-page-view";
import { TaskKey, TaskStatusBadge } from "@/components/tasks/task-status";
import { TaskTitleEditor } from "@/components/tasks/task-title-editor";
import { PageHeader, type Breadcrumb } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { getTaskAccess, getTaskByKey, getTaskDetail } from "@/lib/data/tasks";
import { listUserSummaries } from "@/lib/data/users";

interface TaskPageProps {
  params: Promise<{ key: string }>;
}

/** Memoised per request so generateMetadata and the page share one lookup. */
const loadTask = cache(getTaskByKey);

function decodeKey(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: TaskPageProps): Promise<Metadata> {
  const { key } = await params;
  const task = await loadTask(decodeKey(key));
  return { title: task ? `${task.key} ${task.title}` : "Task not found" };
}

/** Canonical task page (`/tasks/PRX-12`): the drawer's sections as a full page. */
export default async function TaskPage({ params }: TaskPageProps) {
  const [{ key }, user] = await Promise.all([params, requireUser()]);
  const requested = decodeKey(key);
  const task = await loadTask(requested);
  if (!task) notFound();
  // "prx-12" or "#12" resolve too; keep one canonical URL.
  if (requested !== task.key) redirect(taskPageHref(task.key));

  const [detail, users, today, access] = await Promise.all([
    getTaskDetail(task.id),
    listUserSummaries(),
    getWorkspaceToday(),
    getTaskAccess(task.id),
  ]);
  if (!detail || !access) notFound();

  const isAdmin = user.role === "admin";
  const canDelete = isAdmin || access.created_by === user.id || access.project_owner_id === user.id;
  const breadcrumbs: Breadcrumb[] = [
    { label: "Projects", href: "/projects" },
    { label: detail.project.name, href: `/projects/${detail.project.id}?tab=tasks` },
    ...(detail.parent ? [{ label: detail.parent.key, href: taskPageHref(detail.parent.key) }] : []),
    { label: detail.key },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={<TaskTitleEditor task={detail} />}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={detail.status} />
            <TaskKey value={detail.key} className="text-xs" />
            {detail.project.client_code ? (
              <span className="font-mono text-[11px] text-fg-subtle">{detail.project.client_code}</span>
            ) : null}
          </span>
        }
        actions={
          <TaskPageActions taskId={detail.id} taskKey={detail.key} projectId={detail.project.id} canDelete={canDelete} />
        }
      />
      <TaskPageView
        task={detail}
        users={users}
        viewerId={user.id}
        isAdmin={isAdmin}
        today={today}
        blobEnabled={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
      />
    </div>
  );
}
