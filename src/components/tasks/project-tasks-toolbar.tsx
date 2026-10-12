"use client";

import { Layers, List, Rows3, SquareKanban, UserRound, X } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import type { LabelSummary, MilestoneRef, UserSummary } from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { NewTaskButton } from "./new-task-button";
import { FilterMenu, FilterPill, LabelFilter, useUpdateParams } from "./task-filters";
import { TASK_GROUP_BY_OPTIONS, type TaskGroupBy, type TaskView } from "./task-helpers";

export interface ProjectTasksToolbarProps {
  projectId: string;
  view: TaskView;
  groupBy: TaskGroupBy;
  /** "", "me", "unassigned" or a user id. */
  assignee: string;
  /** "", "none" or a milestone id. */
  milestone: string;
  labelIds: string[];
  users: UserSummary[];
  labels: LabelSummary[];
  milestones: MilestoneRef[];
  resultCount: number;
  filtered: boolean;
}

/** View toggle, filters (assignee, phase, labels), list grouping and New task, all in the URL. */
export function ProjectTasksToolbar({
  projectId,
  view,
  groupBy,
  assignee,
  milestone,
  labelIds,
  users,
  labels,
  milestones,
  resultCount,
  filtered,
}: ProjectTasksToolbarProps) {
  const { update, pending } = useUpdateParams();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <SegmentedControl<TaskView>
          value={view}
          onChange={(next) => update({ view: next === "board" ? null : next })}
          ariaLabel="Task view"
          options={[
            { value: "board", label: "Board", icon: SquareKanban },
            { value: "list", label: "List", icon: List },
          ]}
        />
        <FilterMenu
          label="Assignee"
          allLabel="Anyone"
          value={assignee}
          onChange={(value) => update({ assignee: value || null })}
          icon={<UserRound aria-hidden className="size-3.5" />}
          specialOptions={[
            { value: "me", label: "Me" },
            { value: "unassigned", label: "Unassigned" },
          ]}
          options={users.map((user) => ({
            value: user.id,
            label: user.name,
            icon: <UserAvatar user={user} size="xs" />,
          }))}
        />
        {milestones.length > 0 ? (
          <FilterMenu
            label="Phase"
            allLabel="All phases"
            value={milestone}
            onChange={(value) => update({ milestone: value || null })}
            icon={<Layers aria-hidden className="size-3.5" />}
            specialOptions={[{ value: "none", label: "No phase" }]}
            options={milestones.map((item) => ({ value: item.id, label: item.name }))}
          />
        ) : null}
        <LabelFilter labels={labels} value={labelIds} onChange={(ids) => update({ label: ids })} />
        {view === "list" ? (
          <FilterMenu
            label="Group"
            allLabel="Phase"
            value={groupBy === "milestone" ? "" : groupBy}
            onChange={(value) => update({ group: value || null })}
            icon={<Rows3 aria-hidden className="size-3.5" />}
            options={TASK_GROUP_BY_OPTIONS.filter((option) => option.value !== "milestone")}
          />
        ) : null}
        {filtered ? (
          <FilterPill
            active={false}
            onClick={() => update({ assignee: null, milestone: null, label: null })}
            className="border-transparent bg-transparent"
          >
            <X aria-hidden className="size-3.5" />
            Clear filters
          </FilterPill>
        ) : null}
        <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-xs tabular-nums text-fg-muted">
          {pending ? <Spinner size="sm" /> : null}
          {pluralize(resultCount, "task")}
        </span>
      </div>
      <NewTaskButton
        projectId={projectId}
        milestoneId={milestone && milestone !== "none" ? milestone : undefined}
        className="shrink-0"
      />
    </div>
  );
}
