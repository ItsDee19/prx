"use client";

import { FolderKanban, List, SquareKanban, X } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import { SaveViewButton } from "@/components/views/save-view-button";
import type { LabelSummary, ProjectSummary } from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { FilterMenu, FilterPill, LabelFilter, useUpdateParams } from "./task-filters";
import type { TaskView } from "./task-helpers";

export type MyTasksScope = "assigned" | "created";

export interface MyTasksToolbarProps {
  scope: MyTasksScope;
  /** Viewing someone else's tasks (`?assignee=`): the scope toggle is hidden. */
  forAssignee: boolean;
  view: TaskView;
  projectId: string;
  labelIds: string[];
  projects: ProjectSummary[];
  labels: LabelSummary[];
  resultCount: number;
}

/** Scope (assigned to me / created by me), view, project and label filters for /tasks, kept in the URL. */
export function MyTasksToolbar({
  scope,
  forAssignee,
  view,
  projectId,
  labelIds,
  projects,
  labels,
  resultCount,
}: MyTasksToolbarProps) {
  const { update, pending } = useUpdateParams();
  const filtered = Boolean(projectId) || labelIds.length > 0;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {!forAssignee ? (
        <SegmentedControl<MyTasksScope>
          value={scope}
          onChange={(next) => update({ scope: next === "assigned" ? null : next })}
          ariaLabel="Whose tasks"
          options={[
            { value: "assigned", label: "Assigned to me" },
            { value: "created", label: "Created by me" },
          ]}
        />
      ) : null}
      <SegmentedControl<TaskView>
        value={view}
        onChange={(next) => update({ view: next === "list" ? null : next })}
        ariaLabel="Task view"
        iconOnly
        options={[
          { value: "list", label: "List", icon: List },
          { value: "board", label: "Board", icon: SquareKanban },
        ]}
      />
      <FilterMenu
        label="Project"
        allLabel="All projects"
        value={projectId}
        onChange={(value) => update({ project: value || null })}
        icon={<FolderKanban aria-hidden className="size-3.5" />}
        options={projects.map((project) => ({
          value: project.id,
          label: project.client_code ? `${project.client_code} · ${project.name}` : project.name,
        }))}
      />
      <LabelFilter labels={labels} value={labelIds} onChange={(ids) => update({ label: ids })} />
      {filtered ? (
        <FilterPill active={false} onClick={() => update({ project: null, label: null })} className="border-transparent bg-transparent">
          <X aria-hidden className="size-3.5" />
          Clear filters
        </FilterPill>
      ) : null}
      <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-xs tabular-nums text-fg-muted">
        {pending ? <Spinner size="sm" /> : null}
        {pluralize(resultCount, "open task")}
      </span>
      <SaveViewButton scope="tasks" className="ml-auto" />
    </div>
  );
}
