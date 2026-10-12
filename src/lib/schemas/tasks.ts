import { z } from "zod";
import { MAX_DB_INT } from "@/lib/constants";
import { PRIORITIES, TASK_STATUSES } from "@/lib/types";
import { isDateOnly } from "@/lib/workspace-time";

/** zod schemas for tasks, checklists, dependencies and task comments (W2 tasks). */

export const TASK_TITLE_MAX = 200;
export const TASK_DESCRIPTION_MAX = 10_000;
export const CHECKLIST_TITLE_MAX = 200;
export const CHECKLIST_ITEMS_MAX = 50;
export const TASK_LABELS_MAX = 30;
export const TASK_BLOCKERS_MAX = 50;
export const APPROVER_NAME_MAX = 120;
export const TASK_REF_SEARCH_MAX = 100;

const emptyToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const taskIdSchema = z.string({ error: "Choose a task" }).trim().min(1, "Choose a task");

const optionalIdField = z.preprocess(emptyToNull, z.string().trim().min(1).nullable());

const dateField = z.preprocess(
  emptyToNull,
  z.string().refine((value) => isDateOnly(value), "Use a valid date (YYYY-MM-DD)").nullable(),
);

export const taskStatusSchema = z.enum(TASK_STATUSES, { error: "Choose a valid status" });

const titleField = z
  .string({ error: "Give the task a title" })
  .trim()
  .min(1, "Give the task a title")
  .max(TASK_TITLE_MAX, `Titles must be ${TASK_TITLE_MAX} characters or fewer`);

const descriptionField = z
  .string()
  .max(TASK_DESCRIPTION_MAX, `Descriptions must be ${TASK_DESCRIPTION_MAX.toLocaleString("en-US")} characters or fewer`);

const estimateField = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .number({ error: "The estimate must be a number of minutes" })
    .int("The estimate must be whole minutes")
    .min(0, "The estimate can't be negative")
    .max(MAX_DB_INT, "That estimate is too large")
    .nullable(),
);

const labelIdsField = z
  .array(z.string().trim().min(1))
  .max(TASK_LABELS_MAX, `Pick at most ${TASK_LABELS_MAX} labels`);

export const checklistTitleSchema = z
  .string({ error: "Write the checklist item" })
  .trim()
  .min(1, "Write the checklist item")
  .max(CHECKLIST_TITLE_MAX, `Checklist items must be ${CHECKLIST_TITLE_MAX} characters or fewer`);

function checkDateOrder(value: { start_date?: string | null; due_date?: string | null }, ctx: z.RefinementCtx): void {
  if (value.start_date && value.due_date && value.due_date < value.start_date) {
    ctx.addIssue({ code: "custom", message: "The due date can't be before the start date", path: ["due_date"] });
  }
}

export const createTaskSchema = z
  .object({
    project_id: z.string({ error: "Choose a project" }).trim().min(1, "Choose a project"),
    title: titleField,
    description: descriptionField.optional(),
    status: taskStatusSchema.optional(),
    priority: z.enum(PRIORITIES, { error: "Choose a valid priority" }).optional(),
    assignee_id: optionalIdField.optional(),
    milestone_id: optionalIdField.optional(),
    parent_task_id: optionalIdField.optional(),
    start_date: dateField.optional(),
    due_date: dateField.optional(),
    estimate_minutes: estimateField.optional(),
    is_deliverable: z.boolean().optional(),
    label_ids: labelIdsField.optional(),
    checklist: z
      .array(checklistTitleSchema)
      .max(CHECKLIST_ITEMS_MAX, `Add at most ${CHECKLIST_ITEMS_MAX} checklist items`)
      .optional(),
  })
  .superRefine(checkDateOrder);

const updateTaskFields = z.object({
  title: titleField.optional(),
  description: descriptionField.optional(),
  status: taskStatusSchema.optional(),
  priority: z.enum(PRIORITIES, { error: "Choose a valid priority" }).optional(),
  assignee_id: optionalIdField.optional(),
  milestone_id: optionalIdField.optional(),
  start_date: dateField.optional(),
  due_date: dateField.optional(),
  estimate_minutes: estimateField.optional(),
  is_deliverable: z.boolean().optional(),
  approved_by_name: z.preprocess(
    emptyToNull,
    z.string().trim().max(APPROVER_NAME_MAX, `Names must be ${APPROVER_NAME_MAX} characters or fewer`).nullable(),
  ).optional(),
  approved_on: dateField.optional(),
  label_ids: labelIdsField.optional(),
});

export const updateTaskSchema = updateTaskFields.superRefine(checkDateOrder);

export const moveTaskSchema = z.object({
  status: taskStatusSchema,
  before_id: optionalIdField.optional(),
  after_id: optionalIdField.optional(),
});

export const taskLabelIdsSchema = labelIdsField;

export const updateChecklistItemSchema = z
  .object({
    title: checklistTitleSchema.optional(),
    done: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.done !== undefined, "Nothing to update");

export const reorderChecklistSchema = z
  .array(z.string().trim().min(1))
  .max(500, "Too many checklist items");

export const blockedByIdsSchema = z
  .array(z.string().trim().min(1))
  .max(TASK_BLOCKERS_MAX, `A task can have at most ${TASK_BLOCKERS_MAX} blockers`);

export const searchTaskRefsSchema = z.object({
  query: z.string().trim().max(TASK_REF_SEARCH_MAX).optional(),
  projectId: z.string().trim().min(1).optional(),
  excludeId: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export const taskCommentSchema = z.object({
  body: z
    .string({ error: "Comment cannot be empty" })
    .trim()
    .min(1, "Comment cannot be empty")
    .max(4000, "Comment must be 4000 characters or fewer"),
});
