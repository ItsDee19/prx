import { z } from "zod";
import { MAX_MONEY } from "@/lib/constants";
import { INVOICE_STATUSES, MILESTONE_KINDS, MILESTONE_STATUSES } from "@/lib/types";
import { isHttpUrl } from "@/lib/utils";
import { isDateOnly } from "@/lib/workspace-time";

/**
 * zod v4 schemas for milestone (phase) actions. Text-like optional fields
 * coerce "" to null so native form controls can be submitted untouched.
 */

export const MILESTONE_NAME_MAX = 120;
export const MILESTONE_DESCRIPTION_MAX = 5000;
export const GATE_NOTES_MAX = 10_000;
export const SIGNOFF_NAME_MAX = 120;
export const PHASE_KEY_MAX = 40;

const emptyToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

const idField = z.string({ error: "Missing id" }).trim().min(1, "Missing id");

const dateOnlyField = z.preprocess(
  emptyToNull,
  z.string().refine(isDateOnly, "Use a valid date (YYYY-MM-DD)").nullable(),
);

const nameField = z
  .string({ error: "Name is required" })
  .trim()
  .min(1, "Name is required")
  .max(MILESTONE_NAME_MAX, `Name must be ${MILESTONE_NAME_MAX} characters or fewer`);

const milestoneFields = z.object({
  name: nameField,
  description: z
    .string()
    .trim()
    .max(MILESTONE_DESCRIPTION_MAX, `Description must be ${MILESTONE_DESCRIPTION_MAX} characters or fewer`)
    .optional(),
  kind: z.enum(MILESTONE_KINDS, { error: "Choose phase or milestone" }).optional(),
  phase_key: z
    .preprocess(emptyToNull, z.string().trim().max(PHASE_KEY_MAX, "Phase key is too long").nullable())
    .optional(),
  start_date: dateOnlyField.optional(),
  due_date: dateOnlyField.optional(),
  status: z.enum(MILESTONE_STATUSES, { error: "Choose a valid status" }).optional(),
  requires_gate: z.boolean({ error: "Gate must be on or off" }).optional(),
  /** Admin-only (the action enforces the commercial rule before parsing). */
  price: z
    .number({ error: "Price must be a whole number" })
    .int("Price must be a whole number")
    .min(0, "Price cannot be negative")
    .max(MAX_MONEY, "Price is too large")
    .nullable()
    .optional(),
  /** Admin-only. */
  invoice_status: z.enum(INVOICE_STATUSES, { error: "Choose a valid invoice status" }).optional(),
});

const gateFields = z.object({
  gate_notes: z.string().trim().max(GATE_NOTES_MAX, "Gate notes are too long").optional(),
  client_signoff_name: z
    .preprocess(emptyToNull, z.string().trim().max(SIGNOFF_NAME_MAX, "Name is too long").nullable())
    .optional(),
  client_signoff_date: dateOnlyField.optional(),
  evidence_url: z
    .preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .max(2000, "Link is too long")
        .refine(isHttpUrl, "Use a full http(s) link")
        .nullable(),
    )
    .optional(),
});

function checkDateOrder(
  value: { start_date?: string | null; due_date?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.start_date && value.due_date && value.due_date < value.start_date) {
    ctx.addIssue({
      code: "custom",
      message: "Due date must be on or after the start date",
      path: ["due_date"],
    });
  }
}

export const createMilestoneSchema = milestoneFields
  .extend({ project_id: idField })
  .superRefine(checkDateOrder);

/** zod v4 refuses `.partial()` on a refined schema: derive it from the plain field set. */
export const updateMilestoneSchema = milestoneFields
  .partial()
  .extend(gateFields.shape)
  .superRefine(checkDateOrder);

export const milestoneStatusSchema = z.enum(MILESTONE_STATUSES, { error: "Choose a valid status" });

export const reorderMilestonesSchema = z.object({
  projectId: idField,
  orderedIds: z.array(idField).max(500, "Too many milestones"),
});

export const milestoneIdSchema = idField;

export type CreateMilestoneSchemaInput = z.output<typeof createMilestoneSchema>;
export type UpdateMilestoneSchemaInput = z.output<typeof updateMilestoneSchema>;
