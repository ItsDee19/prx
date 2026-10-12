"use client";

import { useId, useState, type FormEvent } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectSummary, StartTimerInput, TaskRef } from "@/lib/types";
import { ProjectSelect } from "./project-select";
import { TaskPicker } from "./task-picker";

export interface StartTimerFormProps {
  projects: ProjectSummary[];
  defaultProjectId?: string | null;
  defaultTask?: TaskRef | null;
  submitLabel: string;
  pending?: boolean;
  onSubmit: (input: StartTimerInput, labels: { project: string; task: TaskRef | null }) => void;
}

/** Project, task and note for starting (or switching) a timer. */
export function StartTimerForm({
  projects,
  defaultProjectId,
  defaultTask,
  submitLabel,
  pending = false,
  onSubmit,
}: StartTimerFormProps) {
  const id = useId();
  const initialProject =
    defaultProjectId && projects.some((project) => project.id === defaultProjectId) ? defaultProjectId : "";
  const [projectId, setProjectId] = useState(initialProject);
  const [task, setTask] = useState<TaskRef | null>(
    defaultTask && defaultTask.project_id === initialProject ? defaultTask : null,
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) {
      setError("Choose a project");
      return;
    }
    const project = projects.find((item) => item.id === projectId);
    onSubmit(
      { project_id: projectId, task_id: task?.id ?? null, note: note.trim() },
      { project: project?.name ?? "the project", task },
    );
  }

  if (projects.length === 0) {
    return <p className="text-sm text-fg-muted">No open projects yet. Create a project to track time.</p>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-project`}>Project</Label>
        <ProjectSelect
          id={`${id}-project`}
          projects={projects}
          value={projectId}
          onChange={(next) => {
            setProjectId(next);
            setError(null);
            if (next !== projectId) setTask(null);
          }}
          invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-task`}>Task</Label>
        <TaskPicker id={`${id}-task`} projectId={projectId || null} value={task} onChange={setTask} aria-label="Task" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-note`}>Note</Label>
        <Input
          id={`${id}-note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional"
          maxLength={2000}
          autoComplete="off"
        />
      </div>
      <Button type="submit" className="w-full" loading={pending}>
        <Play aria-hidden />
        {submitLabel}
      </Button>
    </form>
  );
}
