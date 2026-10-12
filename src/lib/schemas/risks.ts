import { z } from "zod";
import { RISK_CATEGORIES, RISK_KINDS, RISK_STATUSES } from "@/lib/types";
import { isDateOnly } from "@/lib/workspace-time";

/**
 * zod v4 schemas for the RAID log (SPEC.md sections 16 and 18.3). Likelihood
 * and impact are whole numbers 1-5 (or null when unknown); dates are
 * "YYYY-MM-DD" with "" coerced to null.
 */

export const RISK_TITLE_MAX = 200;
export const RISK_TEXT_MAX = 5000;

const emptyToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const riskIdSchema = z.string({ error: "Missing id" }).trim().min(1, "Missing id");

const dateOnlyField = z
  .preprocess(emptyToNull, z.string().refine(isDateOnly, "Use a valid date (YYYY-MM-DD)").nullable())
  .optional();

const scaleField = (label: string) =>
  z
    .preprocess(
      emptyToNull,
      z
        .number({ error: `${label} must be 1 to 5` })
        .int(`${label} must be 1 to 5`)
        .min(1, `${label} must be 1 to 5`)
        .max(5, `${label} must be 1 to 5`)
        .nullable(),
    )
    .optional();

const textField = (label: string) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(RISK_TEXT_MAX, `${label} must be ${RISK_TEXT_MAX} characters or fewer`)
    .optional();

const riskFields = z.object({
  kind: z.enum(RISK_KINDS, { error: "Choose a valid type" }).optional(),
  category: z.enum(RISK_CATEGORIES, { error: "Choose a valid category" }).optional(),
  title: z
    .string({ error: "Title is required" })
    .trim()
    .min(1, "Title is required")
    .max(RISK_TITLE_MAX, `Title must be ${RISK_TITLE_MAX} characters or fewer`),
  description: textField("Description"),
  likelihood: scaleField("Likelihood"),
  impact: scaleField("Impact"),
  owner_id: z.preprocess(emptyToNull, z.string().trim().min(1).nullable()).optional(),
  mitigation: textField("Mitigation"),
  status: z.enum(RISK_STATUSES, { error: "Choose a valid status" }).optional(),
  review_date: dateOnlyField,
  due_date: dateOnlyField,
});

export const createRiskSchema = riskFields.extend({
  project_id: z.string({ error: "Missing project" }).trim().min(1, "Missing project"),
});

export const updateRiskSchema = riskFields.partial();

export type CreateRiskSchemaInput = z.infer<typeof createRiskSchema>;
export type UpdateRiskSchemaInput = z.infer<typeof updateRiskSchema>;
