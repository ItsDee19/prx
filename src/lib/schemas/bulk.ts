import { z } from "zod";
import { MAX_BULK_IDS } from "@/lib/constants";
import { PRIORITIES, PROJECT_STATUSES, TASK_STATUSES } from "@/lib/types";
import { isDateOnly } from "@/lib/workspace-time";

/** zod schemas for bulk task and project edits (W5 productivity). */

/** Most labels one bulk call may add or remove. */
export const BULK_LABELS_MAX = 30;

const emptyToNull = (value: unknown): unknown => (typeof value === "string" && value.trim() === "" ? null : value);

export const bulkIdsSchema = z
  .array(z.string({ error: "Select at least one item" }).trim().min(1).max(64), { error: "Select at least one item" })
  .min(1, "Select at least one item")
  .max(MAX_BULK_IDS, `Select at most ${MAX_BULK_IDS} items at a time`)
  .transform((ids) => [...new Set(ids)]);

const nullableId = z.preprocess(emptyToNull, z.string().trim().min(1).max(64).nullable());

const labelIds = z
  .array(z.string().trim().min(1).max(64))
  .max(BULK_LABELS_MAX, `Pick at most ${BULK_LABELS_MAX} labels`)
  .transform((ids) => [...new Set(ids)]);

const dueDate = z.preprocess(
  emptyToNull,
  z.string().refine((value) => isDateOnly(value), "Use a valid date (YYYY-MM-DD)").nullable(),
);

function hasChange(value: Record<string, unknown>): boolean {
  return Object.entries(value).some(([, entry]) => (Array.isArray(entry) ? entry.length > 0 : entry !== undefined));
}

function labelsDisjoint(value: { add_label_ids?: string[]; remove_label_ids?: string[] }): boolean {
  const added = new Set(value.add_label_ids ?? []);
  return !(value.remove_label_ids ?? []).some((id) => added.has(id));
}

export const bulkTaskPatchSchema = z
  .object({
    status: z.enum(TASK_STATUSES, { error: "Choose a valid status" }).optional(),
    assignee_id: nullableId.optional(),
    priority: z.enum(PRIORITIES, { error: "Choose a valid priority" }).optional(),
    milestone_id: nullableId.optional(),
    due_date: dueDate.optional(),
    add_label_ids: labelIds.optional(),
    remove_label_ids: labelIds.optional(),
  })
  .strict()
  .refine(hasChange, { message: "Choose a change to apply." })
  .refine(labelsDisjoint, { message: "A label can't be added and removed at the same time.", path: ["remove_label_ids"] });

export const bulkProjectPatchSchema = z
  .object({
    status: z.enum(PROJECT_STATUSES, { error: "Choose a valid status" }).optional(),
    owner_id: nullableId.optional(),
    priority: z.enum(PRIORITIES, { error: "Choose a valid priority" }).optional(),
    add_label_ids: labelIds.optional(),
    remove_label_ids: labelIds.optional(),
  })
  .strict()
  .refine(hasChange, { message: "Choose a change to apply." })
  .refine(labelsDisjoint, { message: "A label can't be added and removed at the same time.", path: ["remove_label_ids"] });

export type BulkTaskPatchSchemaOutput = z.infer<typeof bulkTaskPatchSchema>;
export type BulkProjectPatchSchemaOutput = z.infer<typeof bulkProjectPatchSchema>;
