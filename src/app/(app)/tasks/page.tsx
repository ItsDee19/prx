import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheckBig, UserRoundX } from "lucide-react";
import { SelectableTaskList } from "@/components/bulk/selectable-task-list";
import { MyTasksToolbar } from "@/components/tasks/my-tasks-toolbar";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { TaskBoard } from "@/components/tasks/task-board";
import {
  firstParam,
  listParam,
  MY_TASK_GROUP_LABELS,
  MY_TASK_GROUP_ORDER,
  parseTaskView,
} from "@/components/tasks/task-helpers";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { listLabels } from "@/lib/data/labels";
import { listProjectSummaries } from "@/lib/data/projects";
import { listMyTasks, listParentTaskKeys } from "@/lib/data/tasks";
import { listUserSummaries } from "@/lib/data/users";
import type { MyTaskFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My tasks" };

interface TasksPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * My tasks: open tasks assigned to (`?scope=assigned`, default) or created by
 * (`?scope=created`) the viewer, grouped Overdue / Today / This week / Later /
 * No date in workspace time. `?assignee=<id>` shows any active member's open
 * tasks with the same grouping (scope is ignored). `?label=` (repeatable) and
 * `?project=` narrow either mode; `?view=list|board` (default list).
 */
export default async function TasksPage({ searchParams }: TasksPageProps) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);

  const view = parseTaskView(firstParam(params.view), "list");
  const assigneeParam = firstParam(params.assignee)?.trim() || null;
  const scope = firstParam(params.scope) === "created" ? "created" : "assigned";
  const projectId = firstParam(params.project)?.trim() || "";
  const labelIds = listParam(params.label);
  const filters: MyTaskFilters = {};
  if (projectId) filters.projectId = projectId;
  if (labelIds.length > 0) filters.labelIds = labelIds;

  const [today, users, labels, projects] = await Promise.all([
    getWorkspaceToday(),
    listUserSummaries(),
    listLabels(),
    listProjectSummaries({ openOnly: true }),
  ]);

  const target = assigneeParam ? (users.find((member) => member.id === assigneeParam) ?? null) : null;
  const viewingOther = assigneeParam !== null;
  const title = !viewingOther || target?.id === user.id ? "My tasks" : target ? `Tasks for ${target.name}` : "Tasks";

  if (viewingOther && !target) {
    return (
      <div>
        <PageHeader title={title} />
        <EmptyState
          icon={UserRoundX}
          title="That person is not an active member."
          description="They may have been deactivated. Their tasks are still on each project."
          action={
            <Link href="/tasks" className={buttonVariants({ variant: "outline" })}>
              Back to my tasks
            </Link>
          }
        />
      </div>
    );
  }

  const groups = target
    ? await listMyTasks(target.id, "assigned", today, filters)
    : await listMyTasks(user.id, scope, today, filters);
  const tasks = MY_TASK_GROUP_ORDER.flatMap((key) => groups[key]);
  const parentKeys = await listParentTaskKeys(tasks);
  const filtered = Boolean(projectId) || labelIds.length > 0;
  const counts = MY_TASK_GROUP_ORDER.filter((key) => key !== "no_date" && groups[key].length > 0);

  const emptyTitle = filtered
    ? "No open tasks match these filters."
    : target && target.id !== user.id
      ? `${target.name.split(" ")[0]} has no open tasks.`
      : scope === "created"
        ? "No open tasks you created."
        : "You're all caught up.";

  return (
    <div className="min-w-0">
      <PageHeader
        title={title}
        description={
          counts.length > 0 ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {counts.map((key) => (
                <span key={key} className={cn("tabular-nums", key === "overdue" && "font-medium text-danger")}>
                  {groups[key].length} {MY_TASK_GROUP_LABELS[key].toLowerCase()}
                </span>
              ))}
            </span>
          ) : (
            "Open tasks across every project, grouped by when they are due."
          )
        }
        actions={<NewTaskButton />}
      />

      <MyTasksToolbar
        scope={scope}
        forAssignee={viewingOther}
        view={view}
        projectId={projectId}
        labelIds={labelIds}
        projects={projects}
        labels={labels}
        resultCount={tasks.length}
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={CircleCheckBig}
          title={emptyTitle}
          description={
            filtered ? "Clear a filter to see more." : "New tasks assigned here show up grouped by their due date."
          }
          action={filtered ? undefined : <NewTaskButton variant="outline" />}
          className="mt-4"
        />
      ) : view === "board" ? (
        <TaskBoard
          tasks={tasks}
          users={users}
          showProject
          today={today}
          parentKeys={parentKeys}
          viewerId={user.id}
          className="mt-4"
        />
      ) : (
        <SelectableTaskList
          tasks={tasks}
          users={users}
          labels={labels}
          groupBy="due"
          showProject
          today={today}
          parentKeys={parentKeys}
          viewerId={user.id}
          className="mt-4"
        />
      )}
    </div>
  );
}
