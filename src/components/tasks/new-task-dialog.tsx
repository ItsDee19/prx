"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { listLabelsAction } from "@/actions/labels";
import { listMilestoneRefsAction } from "@/actions/milestones";
import { createTaskAction } from "@/actions/tasks";
import { LabelPicker } from "@/components/labels/label-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { UserPicker } from "@/components/ui/user-picker";
import { PRIORITY_CONFIG, PRIORITY_ORDER, TASK_STATUS_CONFIG, TASK_STATUS_ORDER } from "@/lib/constants";
import { parseDuration } from "@/lib/duration";
import { TASK_DESCRIPTION_MAX, TASK_TITLE_MAX } from "@/lib/schemas/tasks";
import type { LabelSummary, MilestoneRef, Priority, ProjectSummary, TaskStatus, UserSummary } from "@/lib/types";
import { hrefWithTask } from "./task-helpers";

export interface NewTaskPrefill {
  projectId?: string;
  status?: TaskStatus;
  dueDate?: string;
  milestoneId?: string;
}

export interface NewTaskFormProps {
  users: UserSummary[];
  projects: ProjectSummary[];
  prefill: NewTaskPrefill;
  onDone: () => void;
}

type Errors = Partial<Record<"project_id" | "title" | "description" | "due_date" | "estimate_minutes" | "_form", string>>;

/** The New task form (inside a Dialog). "Create another" keeps it open for rapid entry. */
export function NewTaskForm({ users, projects, prefill, onDone }: NewTaskFormProps) {
  const router = useRouter();
  const ids = {
    project: useId(),
    title: useId(),
    description: useId(),
    status: useId(),
    priority: useId(),
    phase: useId(),
    start: useId(),
    due: useId(),
    estimate: useId(),
    deliverable: useId(),
    another: useId(),
  };
  const titleRef = useRef<HTMLInputElement>(null);

  const [projectId, setProjectId] = useState(
    prefill.projectId && projects.some((project) => project.id === prefill.projectId) ? prefill.projectId : "",
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(prefill.status ?? "todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [milestoneId, setMilestoneId] = useState(prefill.milestoneId ?? "");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState(prefill.dueDate ?? "");
  const [estimate, setEstimate] = useState("");
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [deliverable, setDeliverable] = useState(false);
  const [another, setAnother] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  const [labels, setLabels] = useState<LabelSummary[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRef[]>([]);
  const [loadingPhases, setLoadingPhases] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listLabelsAction().then((result) => {
      if (!cancelled && result.ok) setLabels(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setMilestones([]);
      return;
    }
    setLoadingPhases(true);
    void listMilestoneRefsAction(projectId).then((result) => {
      if (cancelled) return;
      setLoadingPhases(false);
      const list = result.ok ? result.data : [];
      setMilestones(list);
      setMilestoneId((current) => (list.some((item) => item.id === current) ? current : ""));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function validate(): { errors: Errors; estimateMinutes: number | null } {
    const next: Errors = {};
    if (!projectId) next.project_id = "Choose a project.";
    if (!title.trim()) next.title = "Give the task a title.";
    if (description.length > TASK_DESCRIPTION_MAX) next.description = "That description is too long.";
    if (startDate && dueDate && dueDate < startDate) next.due_date = "The due date can't be before the start date.";
    let estimateMinutes: number | null = null;
    if (estimate.trim()) {
      estimateMinutes = parseDuration(estimate);
      if (estimateMinutes === null) next.estimate_minutes = "Use a duration like 2h 30m, 90m or 1.5.";
    }
    return { errors: next, estimateMinutes };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { errors: found, estimateMinutes } = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      const result = await createTaskAction({
        project_id: projectId,
        title: title.trim(),
        description,
        status,
        priority,
        assignee_id: assigneeId,
        milestone_id: milestoneId || null,
        start_date: startDate || null,
        due_date: dueDate || null,
        estimate_minutes: estimateMinutes,
        is_deliverable: deliverable,
        label_ids: labelIds,
      });
      if (!result.ok) {
        setErrors({ ...(result.fieldErrors ?? {}), _form: result.fieldErrors ? undefined : result.error });
        toast.error(result.error);
        return;
      }
      const task = result.data;
      toast.success(`${task.key} created.`, {
        action: {
          label: "Open",
          onClick: () =>
            router.push(hrefWithTask(window.location.pathname, window.location.search, task.key), { scroll: false }),
        },
      });
      router.refresh();
      if (another) {
        setTitle("");
        setDescription("");
        setEstimate("");
        setErrors({});
        titleRef.current?.focus();
      } else {
        onDone();
      }
    } catch {
      toast.error("Could not create the task. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      {errors._form ? (
        <p role="alert" className="rounded-[10px] bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors._form}
        </p>
      ) : null}
      <FormField label="Project" htmlFor={ids.project} error={errors.project_id} required>
        <NativeSelect
          id={ids.project}
          value={projectId}
          invalid={Boolean(errors.project_id)}
          onChange={(event) => setProjectId(event.target.value)}
        >
          <option value="">Choose a project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.client_code ? `${project.client_code} · ` : ""}
              {project.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Title" htmlFor={ids.title} error={errors.title} required>
        <Input
          ref={titleRef}
          id={ids.title}
          autoFocus
          value={title}
          maxLength={TASK_TITLE_MAX}
          placeholder="What needs doing?"
          invalid={Boolean(errors.title)}
          onChange={(event) => setTitle(event.target.value)}
        />
      </FormField>
      <FormField label="Description" htmlFor={ids.description} error={errors.description}>
        <Textarea
          id={ids.description}
          rows={3}
          value={description}
          invalid={Boolean(errors.description)}
          placeholder="Context, acceptance criteria, links."
          onChange={(event) => setDescription(event.target.value)}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Status" htmlFor={ids.status}>
          <NativeSelect id={ids.status} value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
            {TASK_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {TASK_STATUS_CONFIG[value].label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Priority" htmlFor={ids.priority}>
          <NativeSelect id={ids.priority} value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
            {PRIORITY_ORDER.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_CONFIG[value].label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-fg">Assignee</span>
          <UserPicker users={users} value={assigneeId} onChange={setAssigneeId} allowUnassigned placeholder="Unassigned" aria-label="Assignee" />
        </div>
        <FormField label="Phase" htmlFor={ids.phase} hint={projectId && !loadingPhases && milestones.length === 0 ? "This project has no phases." : undefined}>
          <NativeSelect
            id={ids.phase}
            value={milestoneId}
            disabled={!projectId || loadingPhases || milestones.length === 0}
            onChange={(event) => setMilestoneId(event.target.value)}
          >
            <option value="">No phase</option>
            {milestones.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Start date" htmlFor={ids.start}>
          <Input id={ids.start} type="date" value={startDate} max={dueDate || undefined} onChange={(event) => setStartDate(event.target.value)} />
        </FormField>
        <FormField label="Due date" htmlFor={ids.due} error={errors.due_date}>
          <Input
            id={ids.due}
            type="date"
            value={dueDate}
            min={startDate || undefined}
            invalid={Boolean(errors.due_date)}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </FormField>
        <FormField label="Estimate" htmlFor={ids.estimate} error={errors.estimate_minutes} hint="e.g. 2h 30m, 90m or 1.5 (hours).">
          <Input
            id={ids.estimate}
            value={estimate}
            invalid={Boolean(errors.estimate_minutes)}
            placeholder="2h"
            onChange={(event) => setEstimate(event.target.value)}
          />
        </FormField>
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-fg">Labels</span>
          <LabelPicker labels={labels} value={labelIds} onChange={setLabelIds} aria-label="Labels" />
        </div>
      </div>
      <label htmlFor={ids.deliverable} className="flex items-center gap-3 rounded-[12px] border border-border px-3 py-2.5">
        <Switch id={ids.deliverable} checked={deliverable} onCheckedChange={setDeliverable} aria-label="Client deliverable" />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-fg">Client deliverable</span>
          <span className="block text-xs text-fg-muted">Counts toward the phase&apos;s deliverables and needs client approval.</span>
        </span>
      </label>
      <DialogFooter>
        <label htmlFor={ids.another} className="flex items-center gap-2 text-sm text-fg-muted sm:mr-auto">
          <Checkbox id={ids.another} checked={another} onChange={(event) => setAnother(event.target.checked)} />
          Create another
        </label>
        <Button variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Create task
        </Button>
      </DialogFooter>
    </form>
  );
}
