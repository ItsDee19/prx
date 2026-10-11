"use client";

import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { createProjectAction, updateProjectAction } from "@/actions/projects";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PRIORITY_CONFIG, PROJECT_COLORS, STATUS_CONFIG, STATUS_ORDER } from "@/lib/constants";
import {
  PRIORITIES,
  type CreateProjectInput,
  type Priority,
  type ProjectStatus,
  type ProjectWithMeta,
  type UpdateProjectInput,
  type UserSummary,
} from "@/lib/types";
import { clampProgress, cn } from "@/lib/utils";
import { fieldErrorsFromIssues, projectInputSchema } from "@/lib/validation";

export interface ProjectDialogProps {
  mode: "create" | "edit";
  /** Required in edit mode. */
  project?: ProjectWithMeta;
  /** Create mode: parent of the new sub-project. */
  parentId?: string | null;
  parentName?: string | null;
  users: UserSummary[];
  /** Single element that opens the dialog (rendered with `asChild`). */
  trigger: ReactNode;
  /** Create mode: initial status (e.g. the board column the "+ Add" came from). */
  defaultStatus?: ProjectStatus;
  onSuccess?: (id: string) => void;
}

interface FormValues {
  name: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  owner_id: string;
  member_ids: string[];
  start_date: string;
  due_date: string;
  progress: number;
  color: string | null;
}

type FieldErrors = Record<string, string>;

const COLOR_NAMES: Record<string, string> = {
  "#5b5bd6": "Indigo",
  "#0ea5e9": "Sky",
  "#10b981": "Emerald",
  "#f59e0b": "Amber",
  "#ef4444": "Red",
  "#ec4899": "Pink",
  "#8b5cf6": "Violet",
  "#14b8a6": "Teal",
};

function colorName(hex: string): string {
  return COLOR_NAMES[hex.toLowerCase()] ?? hex;
}

function initialValues(project: ProjectWithMeta | undefined, defaultStatus: ProjectStatus | undefined): FormValues {
  if (project) {
    return {
      name: project.name,
      description: project.description,
      status: project.status,
      priority: project.priority,
      owner_id: project.owner_id ?? "",
      member_ids: project.members.map((member) => member.id),
      start_date: project.start_date ?? "",
      due_date: project.due_date ?? "",
      progress: project.progress,
      color: project.color,
    };
  }
  return {
    name: "",
    description: "",
    status: defaultStatus ?? "to_start",
    priority: "medium",
    owner_id: "",
    member_ids: [],
    start_date: "",
    due_date: "",
    progress: 0,
    color: null,
  };
}

/** Everything the update action accepts, with the name always present. */
type ProjectPatch = UpdateProjectInput & { name: string };

/** Shape the actions expect: "" becomes null for optional fields. */
function toPatch(values: FormValues): ProjectPatch {
  return {
    name: values.name,
    description: values.description,
    status: values.status,
    priority: values.priority,
    owner_id: values.owner_id || null,
    start_date: values.start_date || null,
    due_date: values.due_date || null,
    progress: values.progress,
    color: values.color,
    member_ids: values.member_ids,
  };
}

/**
 * Create / edit form for a project or sub-project. Validation mirrors the
 * server schema so most mistakes are caught before the round trip.
 */
export function ProjectDialog({
  mode,
  project,
  parentId = null,
  parentName = null,
  users,
  trigger,
  defaultStatus,
  onSuccess,
}: ProjectDialogProps) {
  const router = useRouter();
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;

  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(() => initialValues(project, defaultStatus));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isEdit = mode === "edit";
  const title = isEdit ? "Edit project" : parentId ? `New sub-project in ${parentName ?? "project"}` : "New project";

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (next) {
      // Fresh form on every open: blank for create, re-synced to the project for edit.
      setValues(initialValues(project, defaultStatus));
      setErrors({});
      setFormError(null);
    }
    setOpen(next);
  }

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  function toggleMember(id: string, checked: boolean) {
    setValues((current) => ({
      ...current,
      member_ids: checked
        ? current.member_ids.includes(id)
          ? current.member_ids
          : [...current.member_ids, id]
        : current.member_ids.filter((memberId) => memberId !== id),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const patch = toPatch(values);
    const input: CreateProjectInput = { ...patch, parent_id: parentId };
    const parsed = projectInputSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors = fieldErrorsFromIssues(parsed.error.issues);
      setErrors(fieldErrors);
      if (fieldErrors._form) setFormError(fieldErrors._form);
      return;
    }

    startTransition(async () => {
      const failed = (error: string, fieldErrors?: FieldErrors) => {
        setErrors(fieldErrors ?? {});
        setFormError(fieldErrors?._form ?? error);
      };

      let id: string;
      if (isEdit && project) {
        const result = await updateProjectAction(project.id, patch);
        if (!result.ok) return failed(result.error, result.fieldErrors);
        id = project.id;
      } else {
        const result = await createProjectAction(input);
        if (!result.ok) return failed(result.error, result.fieldErrors);
        id = result.data.id;
      }

      toast.success(isEdit ? "Project updated" : parentId ? "Sub-project created" : "Project created");
      setOpen(false);
      router.refresh();
      onSuccess?.(id);
    });
  }

  const membersLabelId = fieldId("members-label");
  const colorLabelId = fieldId("color-label");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} size="lg">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {formError ? (
            <div
              role="alert"
              className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {formError}
            </div>
          ) : null}

          <FormField label="Name" htmlFor={fieldId("name")} error={errors.name} required>
            <Input
              id={fieldId("name")}
              name="name"
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="e.g. Inference latency reduction"
              maxLength={120}
              autoFocus
              autoComplete="off"
              invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? `${fieldId("name")}-error` : undefined}
            />
          </FormField>

          <FormField label="Description" htmlFor={fieldId("description")} error={errors.description}>
            <Textarea
              id={fieldId("description")}
              name="description"
              value={values.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="What is this project about? What does done look like?"
              rows={3}
              maxLength={5000}
              invalid={Boolean(errors.description)}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Status" htmlFor={fieldId("status")} error={errors.status}>
              <NativeSelect
                id={fieldId("status")}
                name="status"
                value={values.status}
                onChange={(event) => update("status", event.target.value as ProjectStatus)}
                invalid={Boolean(errors.status)}
              >
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_CONFIG[status].label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Priority" htmlFor={fieldId("priority")} error={errors.priority}>
              <NativeSelect
                id={fieldId("priority")}
                name="priority"
                value={values.priority}
                onChange={(event) => update("priority", event.target.value as Priority)}
                invalid={Boolean(errors.priority)}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_CONFIG[priority].label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Owner" htmlFor={fieldId("owner")} error={errors.owner_id}>
              <NativeSelect
                id={fieldId("owner")}
                name="owner_id"
                value={values.owner_id}
                onChange={(event) => update("owner_id", event.target.value)}
                invalid={Boolean(errors.owner_id)}
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>

            <div className="space-y-1.5">
              <p id={membersLabelId} className="select-none text-sm font-medium leading-5 text-fg">
                Members
                {values.member_ids.length > 0 ? (
                  <span className="ml-1.5 text-xs font-normal text-fg-muted">{values.member_ids.length} selected</span>
                ) : null}
              </p>
              <div
                role="group"
                aria-labelledby={membersLabelId}
                className="max-h-36 overflow-y-auto rounded-md border border-border bg-surface p-1"
              >
                {users.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-fg-muted">No active users yet.</p>
                ) : (
                  users.map((user) => {
                    const id = fieldId(`member-${user.id}`);
                    const checked = values.member_ids.includes(user.id);
                    return (
                      <label
                        key={user.id}
                        htmlFor={id}
                        className={cn(
                          "flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-surface-2",
                          checked && "text-fg",
                        )}
                      >
                        <Checkbox
                          id={id}
                          checked={checked}
                          onChange={(event) => toggleMember(user.id, event.target.checked)}
                        />
                        <UserAvatar user={user} size="xs" />
                        <span className="min-w-0 flex-1 truncate">{user.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {errors.member_ids ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {errors.member_ids}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Start date" htmlFor={fieldId("start")} error={errors.start_date}>
              <Input
                id={fieldId("start")}
                name="start_date"
                type="date"
                value={values.start_date}
                onChange={(event) => update("start_date", event.target.value)}
                invalid={Boolean(errors.start_date)}
              />
            </FormField>
            <FormField label="Due date" htmlFor={fieldId("due")} error={errors.due_date}>
              <Input
                id={fieldId("due")}
                name="due_date"
                type="date"
                min={values.start_date || undefined}
                value={values.due_date}
                onChange={(event) => update("due_date", event.target.value)}
                invalid={Boolean(errors.due_date)}
              />
            </FormField>
          </div>

          <FormField label="Progress" htmlFor={fieldId("progress")} error={errors.progress}>
            <div className="flex items-center gap-3">
              <input
                id={fieldId("progress")}
                name="progress"
                type="range"
                min={0}
                max={100}
                step={1}
                value={values.progress}
                onChange={(event) => update("progress", clampProgress(Number(event.target.value)))}
                className="h-2 flex-1 cursor-pointer accent-accent outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              />
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={1}
                  aria-label="Progress percentage"
                  value={values.progress}
                  onChange={(event) =>
                    update("progress", event.target.value === "" ? 0 : clampProgress(Number(event.target.value)))
                  }
                  invalid={Boolean(errors.progress)}
                  className="w-20 text-right tabular-nums"
                />
                <span className="text-sm text-fg-muted" aria-hidden>
                  %
                </span>
              </div>
            </div>
          </FormField>

          <div className="space-y-1.5">
            <p id={colorLabelId} className="select-none text-sm font-medium leading-5 text-fg">
              Colour
            </p>
            <div role="radiogroup" aria-labelledby={colorLabelId} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={values.color === null}
                aria-label="No colour"
                onClick={() => update("color", null)}
                className={cn(
                  "flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors duration-150 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                  values.color === null
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                None
              </button>
              {PROJECT_COLORS.map((hex) => {
                const selected = values.color?.toLowerCase() === hex.toLowerCase();
                return (
                  <button
                    key={hex}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={colorName(hex)}
                    title={colorName(hex)}
                    onClick={() => update("color", hex)}
                    style={{ backgroundColor: hex }}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full text-white outline-none transition-transform duration-150",
                      "hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                      selected && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
                    )}
                  >
                    {selected ? <Check className="size-4" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
            {errors.color ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {errors.color}
              </p>
            ) : null}
          </div>

          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              {isEdit ? "Save changes" : parentId ? "Create sub-project" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
