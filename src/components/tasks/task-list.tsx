"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ListChecks } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { EmptyState } from "@/components/ui/empty-state";
import { TASK_STATUS_CONFIG, TASK_STATUS_ORDER } from "@/lib/constants";
import type { MilestoneRef, TaskWithMeta, UserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { dueGroupOf, isClosedTaskStatus, MY_TASK_GROUP_LABELS, MY_TASK_GROUP_ORDER, type TaskGroupBy } from "./task-helpers";
import { TaskRow } from "./task-row";
import { TaskStatusIcon } from "./task-status";
import { useTaskListNavigation } from "./use-task-list-navigation";

export interface TaskListProps {
  tasks: TaskWithMeta[];
  users: UserSummary[];
  groupBy?: TaskGroupBy;
  /** Phase order and names for groupBy "milestone". */
  milestones?: MilestoneRef[];
  showProject?: boolean;
  /** Bulk selection (W5): checkbox column, shift-click ranges, Ctrl/Cmd+A. */
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  /** Workspace today. */
  today: string;
  /** Shown instead of the default empty state when there is nothing to list. */
  emptyMessage?: string;
  /** Parent keys by parent task id (listParentTaskKeys): subtasks show "Subtask of PRX-n". */
  parentKeys?: Record<string, string>;
  /** The signed-in user: enables the "a" (assign to me) list shortcut. */
  viewerId?: string;
  className?: string;
}

interface TaskGroup {
  id: string;
  label: string;
  tasks: TaskWithMeta[];
  tone?: "danger";
  icon?: ReactNode;
}

const NO_MILESTONE = "__none";

function groupTasks(
  tasks: TaskWithMeta[],
  groupBy: TaskGroupBy,
  milestones: MilestoneRef[],
  today: string,
): TaskGroup[] {
  if (groupBy === "none") return [{ id: "all", label: "Tasks", tasks }];

  if (groupBy === "status") {
    return TASK_STATUS_ORDER.map((status) => ({
      id: status,
      label: TASK_STATUS_CONFIG[status].label,
      tasks: tasks.filter((task) => task.status === status),
      icon: <TaskStatusIcon status={status} />,
    })).filter((group) => group.tasks.length > 0);
  }

  if (groupBy === "due") {
    // Done and cancelled tasks are never "overdue": they get their own group at the end.
    const open = tasks.filter((task) => !isClosedTaskStatus(task.status));
    const groups: TaskGroup[] = MY_TASK_GROUP_ORDER.map((key) => ({
      id: key,
      label: MY_TASK_GROUP_LABELS[key],
      tasks: open.filter((task) => dueGroupOf(task.due_date, today) === key),
      tone: key === "overdue" ? ("danger" as const) : undefined,
    }));
    groups.push({ id: "closed", label: "Done or cancelled", tasks: tasks.filter((task) => isClosedTaskStatus(task.status)) });
    return groups.filter((group) => group.tasks.length > 0);
  }

  // Phase: in phase order (unknown phases after, by name), "No phase" last.
  const known = new Map(milestones.map((item, index) => [item.id, index]));
  const byMilestone = new Map<string, TaskGroup>();
  for (const task of tasks) {
    const id = task.milestone?.id ?? NO_MILESTONE;
    const group = byMilestone.get(id) ?? { id, label: task.milestone?.name ?? "No phase", tasks: [] };
    group.tasks.push(task);
    byMilestone.set(id, group);
  }
  return [...byMilestone.values()].sort((a, b) => {
    if (a.id === NO_MILESTONE) return 1;
    if (b.id === NO_MILESTONE) return -1;
    const ai = known.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = known.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.label.localeCompare(b.label);
  });
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Grouped task list (phase / status / due date / none) with inline status,
 * assignee and due editors. Groups collapse. Rows reveal with a short stagger
 * on first mount only. With `selectable`, rows get checkboxes (shift-click
 * selects a range, Ctrl/Cmd+A selects every visible row). Keyboard: j/k move
 * between rows, Enter opens, s opens the status menu, a assigns to the viewer
 * and x toggles selection (useListNavigation).
 */
export function TaskList({
  tasks,
  users,
  groupBy = "none",
  milestones = [],
  showProject = false,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  today,
  emptyMessage,
  parentKeys,
  viewerId,
  className,
}: TaskListProps) {
  const groups = useMemo(() => groupTasks(tasks, groupBy, milestones, today), [tasks, groupBy, milestones, today]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const lastToggled = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleIds = useMemo(
    () => groups.filter((group) => !collapsed.has(group.id)).flatMap((group) => group.tasks.map((task) => task.id)),
    [groups, collapsed],
  );

  function toggleGroup(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeSelection(taskId: string, isSelected: boolean, shiftKey: boolean) {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    const anchor = lastToggled.current;
    if (shiftKey && anchor && anchor !== taskId && visibleIds.includes(anchor)) {
      const [from, to] = [visibleIds.indexOf(anchor), visibleIds.indexOf(taskId)].sort((a, b) => a - b);
      for (const id of visibleIds.slice(from, to + 1)) {
        if (isSelected) next.add(id);
        else next.delete(id);
      }
    } else if (isSelected) {
      next.add(taskId);
    } else {
      next.delete(taskId);
    }
    lastToggled.current = taskId;
    onSelectionChange(visibleIds.filter((id) => next.has(id)).concat([...next].filter((id) => !visibleIds.includes(id))));
  }

  useTaskListNavigation({
    itemIds: visibleIds,
    tasksById,
    viewerId,
    onToggleSelect:
      selectable && onSelectionChange ? (id) => changeSelection(id, !selected.has(id), false) : undefined,
    selectedIds: selectable ? selectedIds : undefined,
    containerRef,
  });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!selectable || !onSelectionChange) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a" && !isTypingTarget(event.target)) {
      event.preventDefault();
      onSelectionChange(visibleIds);
    }
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title={emptyMessage ?? "No tasks here."}
        description={emptyMessage ? undefined : "Tasks you add will show up in this list."}
        className={className}
      />
    );
  }

  return (
    <div ref={containerRef} onKeyDown={onKeyDown} className={cn("min-w-0 space-y-4", className)}>
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.id);
        const headingId = `task-group-${groupBy}-${group.id}`;
        return (
          <section key={group.id} aria-labelledby={groupBy === "none" ? undefined : headingId} aria-label={groupBy === "none" ? "Tasks" : undefined}>
            {groupBy !== "none" ? (
              <h2 id={headingId} className="mb-1.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={!isCollapsed}
                  className="group/heading inline-flex max-w-full items-center gap-2 rounded-full px-1.5 py-1 text-sm font-semibold text-fg outline-none transition-colors duration-(--dur-2) hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0 text-fg-subtle transition-transform duration-(--dur-3) ease-(--ease-out-quart)",
                      isCollapsed && "-rotate-90",
                    )}
                  />
                  {group.icon}
                  <span className={cn("truncate", group.tone === "danger" && "text-danger")}>{group.label}</span>
                  <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-medium tabular-nums text-fg-muted">
                    {group.tasks.length}
                  </span>
                </button>
              </h2>
            ) : null}
            {!isCollapsed ? (
              <Stagger
                as="ul"
                className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
              >
                {group.tasks.map((task) => (
                  <StaggerItem key={task.id} as="li">
                    <TaskRow
                      task={task}
                      users={users}
                      today={today}
                      showProject={showProject}
                      showMilestone={groupBy !== "milestone"}
                      parentKey={task.parent_task_id ? (parentKeys?.[task.parent_task_id] ?? null) : null}
                      selectable={selectable}
                      selected={selected.has(task.id)}
                      selectionActive={selected.size > 0}
                      onSelectedChange={(value, shiftKey) => changeSelection(task.id, value, shiftKey)}
                    />
                  </StaggerItem>
                ))}
              </Stagger>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
