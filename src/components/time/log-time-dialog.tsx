"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { logTimeAction, updateTimeEntryAction } from "@/actions/time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MAX_ENTRY_MINUTES } from "@/lib/constants";
import { formatMinutes, parseDuration } from "@/lib/duration";
import type { ActionResult, ProjectSummary, TaskRef, TimeEntry, TimeEntryWithMeta, UpdateTimeEntryInput } from "@/lib/types";
import { isDateOnly } from "@/lib/workspace-time";
import { ProjectSelect } from "./project-select";
import { TaskPicker } from "./task-picker";

export interface LogTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectSummary[];
  defaultProjectId?: string;
  defaultTaskId?: string | null;
  /** Prefilled task reference (shows its key and title before any search). */
  defaultTask?: TaskRef | null;
  /** Workspace today: the default date. */
  today: string;
  /** Edit this entry instead of logging a new one. */
  entry?: TimeEntryWithMeta | null;
  /** Called after a successful save with the saved entry. */
  onSaved?: (entry: TimeEntry) => void;
}

/**
 * Log time (or edit an entry): project, task, date, a duration typed as
 * "1h 30m", "1.5" or "90m", a billable switch and a note. New entries leave
 * billable to the server default (off on internal engagements) until the
 * switch is touched.
 */
export function LogTimeDialog(props: LogTimeDialogProps) {
  const { open, onOpenChange, entry } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={entry ? "Edit time entry" : "Log time"}
        description={entry ? `${formatMinutes(entry.minutes)} on ${entry.project.name}.` : "Record time against a project or task."}
      >
        {open ? <LogTimeForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function LogTimeForm({
  onOpenChange,
  projects,
  defaultProjectId,
  defaultTaskId,
  defaultTask,
  today,
  entry,
  onSaved,
}: LogTimeDialogProps) {
  const formId = useId();
  const options = useMemo(() => {
    if (!entry || projects.some((project) => project.id === entry.project_id)) return projects;
    return [entry.project, ...projects];
  }, [entry, projects]);

  const initialProject =
    entry?.project_id ??
    (defaultProjectId && options.some((project) => project.id === defaultProjectId) ? defaultProjectId : "");
  const initialTask: TaskRef | null =
    entry?.task ?? (defaultTask && defaultTask.id === defaultTaskId ? defaultTask : null);

  const [projectId, setProjectId] = useState(initialProject);
  const [task, setTask] = useState<TaskRef | null>(initialTask);
  const [date, setDate] = useState(entry?.entry_date ?? today);
  const [duration, setDuration] = useState(entry ? formatMinutes(entry.minutes) : "");
  const [billable, setBillable] = useState(entry?.billable ?? true);
  const [billableTouched, setBillableTouched] = useState(false);
  const [note, setNote] = useState(entry?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const minutes = parseDuration(duration);
  const durationValid = minutes !== null && minutes >= 1 && minutes <= MAX_ENTRY_MINUTES;

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!projectId) next.project_id = "Choose a project";
    if (!isDateOnly(date)) next.entry_date = "Choose a date";
    if (!duration.trim()) next.minutes = "Enter a duration such as 1h 30m";
    else if (minutes === null) next.minutes = "Use 1h 30m, 1.5 or 90m";
    else if (minutes < 1) next.minutes = "Enter at least 1 minute";
    else if (minutes > MAX_ENTRY_MINUTES) next.minutes = `Enter at most ${MAX_ENTRY_MINUTES / 60} hours`;
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0 || minutes === null) return;

    setPending(true);
    try {
      let result: ActionResult<TimeEntry>;
      if (entry) {
        const patch: UpdateTimeEntryInput = {};
        if (projectId !== entry.project_id) patch.project_id = projectId;
        if ((task?.id ?? null) !== entry.task_id) patch.task_id = task?.id ?? null;
        if (date !== entry.entry_date) patch.entry_date = date;
        if (minutes !== entry.minutes) patch.minutes = minutes;
        if (billable !== entry.billable) patch.billable = billable;
        if (note.trim() !== entry.note) patch.note = note.trim();
        result = await updateTimeEntryAction(entry.id, patch);
      } else {
        result = await logTimeAction({
          project_id: projectId,
          task_id: task?.id ?? null,
          entry_date: date,
          minutes,
          billable: billableTouched ? billable : undefined,
          note: note.trim(),
        });
      }
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      const projectName = options.find((project) => project.id === projectId)?.name ?? "the project";
      toast.success(entry ? "Time entry updated." : `Logged ${formatMinutes(minutes)} on ${projectName}.`);
      onSaved?.(result.data);
      onOpenChange(false);
    } catch {
      toast.error(entry ? "Could not update the entry." : "Could not log the time.");
    } finally {
      setPending(false);
    }
  }

  const ids = {
    project: `${formId}-project`,
    task: `${formId}-task`,
    date: `${formId}-date`,
    minutes: `${formId}-minutes`,
    billable: `${formId}-billable`,
    note: `${formId}-note`,
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <FormField label="Project" htmlFor={ids.project} error={errors.project_id} required className="sm:col-span-2">
        <ProjectSelect
          id={ids.project}
          projects={options}
          value={projectId}
          onChange={(next) => {
            setProjectId(next);
            if (next !== projectId) setTask(null);
          }}
          invalid={Boolean(errors.project_id)}
          aria-describedby={errors.project_id ? `${ids.project}-error` : undefined}
          required
        />
      </FormField>
      <FormField label="Task" htmlFor={ids.task} hint="Optional. Time on a task also counts toward its phase." className="sm:col-span-2">
        <TaskPicker id={ids.task} projectId={projectId || null} value={task} onChange={setTask} aria-label="Task" />
      </FormField>
      <FormField label="Date" htmlFor={ids.date} error={errors.entry_date} required>
        <Input
          id={ids.date}
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          invalid={Boolean(errors.entry_date)}
          required
        />
      </FormField>
      <FormField
        label="Duration"
        htmlFor={ids.minutes}
        error={errors.minutes}
        hint={durationValid && minutes !== null ? `= ${formatMinutes(minutes)}` : "1h 30m, 1.5 or 90m"}
        required
      >
        <Input
          id={ids.minutes}
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          placeholder="1h 30m"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          autoFocus={!entry && Boolean(initialProject)}
          invalid={Boolean(errors.minutes)}
          aria-describedby={errors.minutes ? `${ids.minutes}-error` : `${ids.minutes}-hint`}
          className="font-mono tabular-nums"
          required
        />
      </FormField>
      <div className="flex items-start justify-between gap-4 rounded-[12px] border border-border bg-surface-2/50 px-3 py-2.5 sm:col-span-2">
        <div className="min-w-0">
          <label htmlFor={ids.billable} className="text-sm font-medium text-fg">
            Billable
          </label>
          <p className="text-xs text-fg-muted">
            {entry || billableTouched ? "Counts toward billable hours." : "Internal engagements default to non-billable."}
          </p>
        </div>
        <Switch
          id={ids.billable}
          checked={billable}
          onCheckedChange={(checked) => {
            setBillable(checked);
            setBillableTouched(true);
          }}
        />
      </div>
      <FormField label="Note" htmlFor={ids.note} className="sm:col-span-2">
        <Textarea
          id={ids.note}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What did you work on?"
          maxLength={2000}
        />
      </FormField>
      <DialogFooter className="sm:col-span-2">
        <DialogClose asChild>
          <Button variant="outline" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" loading={pending}>
          {entry ? "Save changes" : "Log time"}
        </Button>
      </DialogFooter>
    </form>
  );
}
