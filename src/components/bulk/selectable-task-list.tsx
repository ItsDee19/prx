"use client";

import { useMemo } from "react";
import { TaskList, type TaskListProps } from "@/components/tasks/task-list";
import type { LabelSummary, MilestoneRef } from "@/lib/types";
import { BulkActionBar } from "./bulk-action-bar";
import { useSelection } from "./use-selection";

export interface SelectableTaskListProps extends Omit<TaskListProps, "selectable" | "selectedIds" | "onSelectionChange"> {
  /** Label catalogue for the bulk Labels action. */
  labels: LabelSummary[];
  /**
   * Phases of the one project every task belongs to (project Tasks tab): the
   * bulk bar then offers "Phase". Omit on cross-project lists such as My tasks.
   */
  bulkMilestones?: MilestoneRef[];
}

/**
 * TaskList with bulk selection (checkbox column, shift-click ranges, Ctrl/Cmd+A,
 * x on the focused row) and the floating BulkActionBar. Server pages render this
 * client wrapper, which owns the selection state, instead of passing callbacks.
 */
export function SelectableTaskList({ labels, bulkMilestones, ...listProps }: SelectableTaskListProps) {
  const itemIds = useMemo(() => listProps.tasks.map((task) => task.id), [listProps.tasks]);
  const selection = useSelection({ itemIds });

  return (
    <>
      <TaskList
        {...listProps}
        selectable
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
      />
      <BulkActionBar
        kind="tasks"
        selectedIds={selection.selectedIds}
        onClear={selection.clear}
        users={listProps.users}
        labels={labels}
        milestones={bulkMilestones}
      />
    </>
  );
}
