"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Hourglass } from "lucide-react";
import { toast } from "sonner";
import { listLabelsAction } from "@/actions/labels";
import { listMilestoneRefsAction } from "@/actions/milestones";
import { setTaskLabelsAction, updateTaskStatusAction } from "@/actions/tasks";
import { LabelPicker } from "@/components/labels/label-picker";
import { PriorityBadge } from "@/components/projects/priority-badge";
import { UserAvatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { TimeAgo } from "@/components/ui/time-ago";
import { PRIORITY_CONFIG, PRIORITY_ORDER, TASK_STATUS_CONFIG } from "@/lib/constants";
import { formatMinutes, parseDuration } from "@/lib/duration";
import type { LabelSummary, MilestoneRef, Priority, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TaskDrawerSectionProps } from "../drawer-sections";
import { AssigneeEditor, DateEditor, useSaveTask } from "../task-inline-editors";
import { TaskStatusBadge } from "../task-status";
import { TaskStatusMenu } from "../task-status-menu";

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-9 grid-cols-[minmax(6.5rem,8rem)_minmax(0,1fr)] items-center gap-3">
      <dt className="text-sm text-fg-muted">{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}</dt>
      <dd className="flex min-w-0 items-center">{children}</dd>
    </div>
  );
}

const PILL_TRIGGER =
  "relative inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full px-2 text-sm outline-none " +
  "transition-[background-color] duration-(--dur-2) hover:bg-surface-2 data-[state=open]:bg-surface-2 " +
  "focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-y-1 pointer-coarse:after:inset-x-0";

/** Status, priority, assignee, dates, estimate, phase, labels, deliverable flag and provenance. */
export function TaskPropertiesSection({ task, users, today, onChanged }: TaskDrawerSectionProps) {
  const save = useSaveTask(() => onChanged());
  const estimateId = useId();
  const phaseId = useId();
  const deliverableId = useId();

  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [milestoneId, setMilestoneId] = useState(task.milestone_id ?? "");
  const [deliverable, setDeliverable] = useState(task.is_deliverable);
  const [labelIds, setLabelIds] = useState(task.labels.map((label) => label.id));
  const [estimate, setEstimate] = useState(task.estimate_minutes === null ? "" : formatMinutes(task.estimate_minutes));
  const [estimateError, setEstimateError] = useState<string | null>(null);
  // Escape cancels the estimate edit: the blur that follows (the drawer blurs on Escape) must not save it.
  const skipEstimateCommit = useRef(false);
  const [synced, setSynced] = useState(task);
  if (synced !== task) {
    setSynced(task);
    setStatus(task.status);
    setPriority(task.priority);
    setMilestoneId(task.milestone_id ?? "");
    setDeliverable(task.is_deliverable);
    setLabelIds(task.labels.map((label) => label.id));
    setEstimate(task.estimate_minutes === null ? "" : formatMinutes(task.estimate_minutes));
    setEstimateError(null);
  }

  const [milestones, setMilestones] = useState<MilestoneRef[] | null>(null);
  const [labels, setLabels] = useState<LabelSummary[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([listMilestoneRefsAction(task.project_id), listLabelsAction()]).then(([phaseResult, labelResult]) => {
      if (cancelled) return;
      setMilestones(phaseResult.ok ? phaseResult.data : []);
      setLabels(labelResult.ok ? labelResult.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [task.project_id]);

  async function changeStatus(next: TaskStatus) {
    const previous = status;
    setStatus(next);
    const result = await updateTaskStatusAction(task.id, next);
    if (!result.ok) {
      setStatus(previous);
      toast.error(result.error);
      return;
    }
    toast.success(`${task.key} moved to ${TASK_STATUS_CONFIG[next].label}.`, { duration: 2500 });
    onChanged();
  }

  async function changePriority(next: Priority) {
    if (next === priority) return;
    const previous = priority;
    setPriority(next);
    if (!(await save(task.id, { priority: next }))) setPriority(previous);
  }

  async function changeMilestone(next: string) {
    const previous = milestoneId;
    setMilestoneId(next);
    if (!(await save(task.id, { milestone_id: next || null }))) setMilestoneId(previous);
  }

  async function changeDeliverable(next: boolean) {
    setDeliverable(next);
    if (!(await save(task.id, { is_deliverable: next }))) setDeliverable(!next);
  }

  async function changeLabels(ids: string[]) {
    const previous = labelIds;
    setLabelIds(ids);
    const result = await setTaskLabelsAction(task.id, ids);
    if (!result.ok) {
      setLabelIds(previous);
      toast.error(result.error);
      return;
    }
    onChanged();
  }

  async function commitEstimate() {
    const text = estimate.trim();
    if (!text) {
      setEstimateError(null);
      if (task.estimate_minutes !== null) await save(task.id, { estimate_minutes: null });
      return;
    }
    const minutes = parseDuration(text);
    if (minutes === null) {
      setEstimateError("Use a duration like 2h 30m, 90m or 1.5.");
      return;
    }
    setEstimateError(null);
    setEstimate(formatMinutes(minutes));
    if (minutes !== task.estimate_minutes) await save(task.id, { estimate_minutes: minutes });
  }

  // The task's own labels stay pickable before the catalogue loads (and if one was just created).
  const known = new Set((labels ?? []).map((label) => label.id));
  const labelOptions = [...(labels ?? []), ...task.labels.filter((label) => !known.has(label.id))];

  return (
    <dl className="space-y-1">
      <Row label="Status">
        <TaskStatusMenu
          taskId={task.id}
          status={status}
          taskLabel={task.key}
          onSelect={(next) => void changeStatus(next)}
          trigger={
            <button type="button" className={PILL_TRIGGER} aria-label={`Status: ${TASK_STATUS_CONFIG[status].label}. Change status`}>
              <TaskStatusBadge status={status} />
              <ChevronDown aria-hidden className="size-3.5 text-fg-subtle" />
            </button>
          }
        />
      </Row>
      <Row label="Priority">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={PILL_TRIGGER} aria-label={`Priority: ${PRIORITY_CONFIG[priority].label}. Change priority`}>
              <PriorityBadge priority={priority} />
              <ChevronDown aria-hidden className="size-3.5 text-fg-subtle" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {PRIORITY_ORDER.map((value) => (
              <DropdownMenuItem
                key={value}
                role="menuitemradio"
                aria-checked={value === priority}
                onSelect={() => void changePriority(value)}
              >
                <PriorityBadge priority={value} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Row>
      <Row label="Assignee">
        <AssigneeEditor task={task} users={users} variant="full" onSaved={() => onChanged()} className="-ml-1" />
      </Row>
      <Row label="Start date">
        <DateEditor task={task} field="start_date" today={today} variant="full" onSaved={() => onChanged()} className="-ml-1" />
      </Row>
      <Row label="Due date">
        <DateEditor task={task} field="due_date" today={today} variant="full" onSaved={() => onChanged()} className="-ml-1" />
      </Row>
      <Row label="Estimate" htmlFor={estimateId}>
        <div className="flex w-full min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <input
              id={estimateId}
              type="text"
              inputMode="text"
              value={estimate}
              placeholder="e.g. 2h 30m"
              aria-invalid={estimateError ? true : undefined}
              aria-describedby={estimateError ? `${estimateId}-error` : undefined}
              onChange={(event) => {
                skipEstimateCommit.current = false;
                setEstimate(event.target.value);
              }}
              onBlur={() => {
                if (skipEstimateCommit.current) {
                  skipEstimateCommit.current = false;
                  return;
                }
                void commitEstimate();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitEstimate();
                } else if (event.key === "Escape" && !event.nativeEvent.isComposing) {
                  skipEstimateCommit.current = true;
                  setEstimate(task.estimate_minutes === null ? "" : formatMinutes(task.estimate_minutes));
                  setEstimateError(null);
                }
              }}
              className={cn(
                "h-8 w-28 min-w-0 rounded-[10px] border border-transparent bg-transparent px-2 text-base tabular-nums text-fg outline-none sm:text-sm",
                "placeholder:text-fg-subtle hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
                estimateError && "border-danger",
              )}
            />
            {task.logged_minutes > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs tabular-nums text-fg-muted">
                <Hourglass aria-hidden className="size-3.5" />
                {formatMinutes(task.logged_minutes)} logged
              </span>
            ) : null}
          </div>
          {estimateError ? (
            <p id={`${estimateId}-error`} role="alert" className="px-2 text-xs text-danger">
              {estimateError}
            </p>
          ) : null}
        </div>
      </Row>
      <Row label="Phase" htmlFor={phaseId}>
        <NativeSelect
          id={phaseId}
          value={milestoneId}
          disabled={milestones === null}
          onChange={(event) => void changeMilestone(event.target.value)}
          wrapperClassName="w-full max-w-64"
          className="h-8"
        >
          <option value="">No phase</option>
          {(milestones ?? (task.milestone ? [task.milestone] : [])).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </NativeSelect>
      </Row>
      <Row label="Labels">
        <LabelPicker labels={labelOptions} value={labelIds} onChange={(ids) => void changeLabels(ids)} aria-label={`Labels of ${task.key}`} />
      </Row>
      <Row label="Deliverable" htmlFor={deliverableId}>
        <span className="flex items-center gap-2 px-1">
          <Switch
            id={deliverableId}
            checked={deliverable}
            onCheckedChange={(value) => void changeDeliverable(value)}
            aria-label="Client deliverable"
          />
          <span className="text-xs text-fg-muted">{deliverable ? "Counts toward the phase's deliverables." : "Not a client deliverable."}</span>
        </span>
      </Row>
      <Row label="Reporter">
        {task.creator ? (
          <span className="flex min-w-0 items-center gap-2 px-1">
            <UserAvatar user={task.creator} size="xs" />
            <span className="truncate text-sm text-fg">{task.creator.name}</span>
          </span>
        ) : (
          <span className="px-1 text-sm text-fg-subtle">Unknown</span>
        )}
      </Row>
      <Row label="Created">
        <TimeAgo date={task.created_at} className="px-1 text-sm text-fg-muted" />
      </Row>
      <Row label="Updated">
        <TimeAgo date={task.updated_at} className="px-1 text-sm text-fg-muted" />
      </Row>
    </dl>
  );
}
