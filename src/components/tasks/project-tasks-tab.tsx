import { SquareKanban } from "lucide-react";
import { SelectableTaskList } from "@/components/bulk/selectable-task-list";
import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { EmptyState } from "@/components/ui/empty-state";
import { listLabels } from "@/lib/data/labels";
import { listMilestoneRefs } from "@/lib/data/milestones";
import { listParentTaskKeys, listTasks } from "@/lib/data/tasks";
import type { TaskFilters } from "@/lib/types";
import { NewTaskButton } from "./new-task-button";
import { ProjectTasksToolbar } from "./project-tasks-toolbar";
import { TaskBoard } from "./task-board";
import { firstParam, listParam, parseGroupBy, parseTaskView } from "./task-helpers";

/**
 * The project page's Tasks tab (server). Board or list (`?view=board|list`,
 * default board) of the project's top-level tasks, filtered by
 * `?assignee=<id>|me|unassigned`, `?label=<id>` (repeatable, any-of) and
 * `?milestone=<id>|none`; the list groups by `?group=` (default phase).
 * Unfiltered, subtasks live inside their parent's drawer; any filter also
 * matches subtasks (marked "Subtask of PRX-n") so nobody's work is hidden.
 */
export async function ProjectTasksTab({ project, users, today, searchParams, viewer }: ProjectTabProps) {
  const view = parseTaskView(firstParam(searchParams.view), "board");
  const groupBy = parseGroupBy(firstParam(searchParams.group), "milestone");
  const assigneeParam = firstParam(searchParams.assignee) ?? "";
  const milestoneParam = firstParam(searchParams.milestone) ?? "";
  const labelIds = listParam(searchParams.label);

  const filtered = Boolean(assigneeParam || milestoneParam || labelIds.length > 0);

  const filters: TaskFilters = { projectId: project.id, sort: "position" };
  if (!filtered) filters.parentTaskId = null;
  if (assigneeParam === "unassigned") filters.assigneeId = null;
  else if (assigneeParam === "me") filters.assigneeId = viewer.id;
  else if (assigneeParam) filters.assigneeId = assigneeParam;
  if (milestoneParam === "none") filters.milestoneId = null;
  else if (milestoneParam) filters.milestoneId = milestoneParam;
  if (labelIds.length > 0) filters.labelIds = labelIds;

  const [tasks, milestones, labels] = await Promise.all([
    listTasks(filters),
    listMilestoneRefs(project.id),
    listLabels(),
  ]);
  const parentKeys = filtered ? await listParentTaskKeys(tasks) : {};

  return (
    <section aria-label="Tasks" className="min-w-0">
      <ProjectTasksToolbar
        projectId={project.id}
        view={view}
        groupBy={groupBy}
        assignee={assigneeParam}
        milestone={milestoneParam}
        labelIds={labelIds}
        users={users}
        labels={labels}
        milestones={milestones}
        resultCount={tasks.length}
        filtered={filtered}
      />

      {tasks.length === 0 && !filtered ? (
        <EmptyState
          icon={SquareKanban}
          title="No tasks yet."
          description="Break the work into tasks with an owner, a due date and an estimate."
          action={<NewTaskButton projectId={project.id} label="Add the first task" />}
          className="mt-4"
        />
      ) : view === "board" ? (
        <TaskBoard
          tasks={tasks}
          projectId={project.id}
          users={users}
          milestones={milestones}
          today={today}
          defaultMilestoneId={milestoneParam && milestoneParam !== "none" ? milestoneParam : null}
          parentKeys={parentKeys}
          viewerId={viewer.id}
          className="mt-4"
        />
      ) : (
        <SelectableTaskList
          tasks={tasks}
          users={users}
          labels={labels}
          milestones={milestones}
          bulkMilestones={milestones}
          groupBy={groupBy}
          today={today}
          emptyMessage={filtered ? "No tasks match these filters." : undefined}
          parentKeys={parentKeys}
          viewerId={viewer.id}
          className="mt-4"
        />
      )}
    </section>
  );
}
