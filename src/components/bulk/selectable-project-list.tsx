"use client";

import { useMemo } from "react";
import { ProjectList, type ProjectListProps } from "@/components/projects/project-list";
import type { LabelSummary, UserSummary } from "@/lib/types";
import { BulkActionBar } from "./bulk-action-bar";
import { useSelection } from "./use-selection";

export interface SelectableProjectListProps extends Omit<ProjectListProps, "selectable" | "selectedIds" | "onSelectionChange"> {
  /** Active people for the bulk Owner action. */
  users: UserSummary[];
  /** Label catalogue for the bulk Labels action. */
  labels: LabelSummary[];
}

/**
 * The projects list view with bulk selection and the floating BulkActionBar
 * (status, owner, priority, labels). A client wrapper that owns the selection,
 * so the server page passes only serialisable props.
 */
export function SelectableProjectList({ users, labels, ...listProps }: SelectableProjectListProps) {
  const itemIds = useMemo(() => listProps.projects.map((project) => project.id), [listProps.projects]);
  const selection = useSelection({ itemIds });

  return (
    <>
      <ProjectList
        {...listProps}
        selectable
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
      />
      <BulkActionBar
        kind="projects"
        selectedIds={selection.selectedIds}
        onClear={selection.clear}
        users={users}
        labels={labels}
      />
    </>
  );
}
