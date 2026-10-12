import { z } from "zod";
import { MAX_DB_INT } from "@/lib/constants";
import { AGREEMENT_METRICS, BATCH_STATUSES, BATCH_UNIT_TYPES } from "@/lib/types";
import { isDateOnly } from "@/lib/workspace-time";

/**
 * zod v4 schemas for Avlys Data batches (W4 evals-batches). Gold accuracy and
 * the quality threshold are fractions 0-1 (DB CHECK); the agreement score and
 * threshold use the metric's own scale (kappa and alpha -1..1, percent
 * agreement as a fraction 0-1).
 */

export const BATCH_NAME_MAX = 120;
export const BATCH_GUIDELINE_MAX = 60;
export const BATCH_NOTES_MAX = 5000;

const emptyToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const batchIdSchema = z.string({ error: "Missing batch" }).trim().min(1, "Missing batch");

const idField = z.string({ error: "Missing id" }).trim().min(1, "Missing id");

const optionalIdField = z.preprocess(emptyToNull, z.string().trim().min(1).nullable());

const count = (label: string, min: number) =>
  z
    .number({ error: `${label} must be a whole number` })
    .int(`${label} must be a whole number`)
    .min(min, min > 0 ? `${label} must be at least ${min}` : `${label} cannot be negative`)
    .max(MAX_DB_INT, `${label} is too large`);

const fraction = (label: string) =>
  z.preprocess(
    (value) => (value === "" ? null : value),
    z
      .number({ error: `${label} must be a number` })
      .min(0, `${label} must be between 0% and 100%`)
      .max(1, `${label} must be between 0% and 100%`)
      .nullable(),
  );

const agreementValue = (label: string) =>
  z.preprocess(
    (value) => (value === "" ? null : value),
    z
      .number({ error: `${label} must be a number` })
      .min(-1, `${label} must be between -1 and 1`)
      .max(1, `${label} must be between -1 and 1`)
      .nullable(),
  );

const batchFields = z.object({
  milestone_id: optionalIdField.optional(),
  number: count("Batch number", 0).optional(),
  name: z.string().trim().max(BATCH_NAME_MAX, `Names must be ${BATCH_NAME_MAX} characters or fewer`).optional(),
  is_calibration: z.boolean({ error: "Calibration must be on or off" }).optional(),
  unit_type: z.enum(BATCH_UNIT_TYPES, { error: "Choose a unit type" }).optional(),
  units_target: count("Planned units", 1),
  units_delivered: count("Delivered units", 0).optional(),
  units_accepted: count("Accepted units", 0).optional(),
  guideline_version: z
    .string()
    .trim()
    .max(BATCH_GUIDELINE_MAX, `Guideline versions must be ${BATCH_GUIDELINE_MAX} characters or fewer`)
    .optional(),
  gold_accuracy: fraction("Gold-set accuracy").optional(),
  agreement_metric: z
    .preprocess(emptyToNull, z.enum(AGREEMENT_METRICS, { error: "Choose an agreement metric" }).nullable())
    .optional(),
  agreement_score: agreementValue("Agreement score").optional(),
  quality_threshold: fraction("Quality threshold").optional(),
  agreement_threshold: agreementValue("Agreement threshold").optional(),
  status: z.enum(BATCH_STATUSES, { error: "Choose a valid status" }).optional(),
  due_date: z
    .preprocess(emptyToNull, z.string().refine(isDateOnly, "Use a valid date (YYYY-MM-DD)").nullable())
    .optional(),
  notes: z.string().trim().max(BATCH_NOTES_MAX, `Notes must be ${BATCH_NOTES_MAX} characters or fewer`).optional(),
});

function checkCounts(
  value: { units_delivered?: number; units_accepted?: number },
  ctx: z.RefinementCtx,
): void {
  if (
    value.units_delivered !== undefined &&
    value.units_accepted !== undefined &&
    value.units_accepted > value.units_delivered
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Accepted units cannot exceed delivered units",
      path: ["units_accepted"],
    });
  }
}

export const createBatchSchema = batchFields.extend({ project_id: idField }).superRefine(checkCounts);

/** zod v4 refuses `.partial()` on a refined schema: derive it from the plain field set. */
export const updateBatchSchema = batchFields.partial().superRefine(checkCounts);

export type CreateBatchSchemaOutput = z.output<typeof createBatchSchema>;
export type UpdateBatchSchemaOutput = z.output<typeof updateBatchSchema>;
