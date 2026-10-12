import { z } from "zod";
import { STATUS_HEADLINE_MAX } from "@/lib/constants";
import { RAG_HEALTHS } from "@/lib/types";

/**
 * zod v4 schemas for weekly status updates (SPEC.md sections 16 and 18.3).
 * Optional dimension RAGs coerce "" to null so native controls can submit
 * untouched; long-text sections are trimmed and capped.
 */

/** Longest text stored in one section (done, next, blockers, client asks, internal notes). */
export const STATUS_UPDATE_SECTION_MAX = 5000;

const emptyToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const statusUpdateIdSchema = z.string({ error: "Missing id" }).trim().min(1, "Missing id");

const healthField = z.enum(RAG_HEALTHS, { error: "Choose On track, At risk or Off track" });

const dimensionField = z
  .preprocess(emptyToNull, z.enum(RAG_HEALTHS, { error: "Choose a valid health" }).nullable())
  .optional();

const sectionField = (label: string) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(STATUS_UPDATE_SECTION_MAX, `${label} must be ${STATUS_UPDATE_SECTION_MAX} characters or fewer`)
    .optional();

const headlineField = z
  .string({ error: "Headline is required" })
  .trim()
  .min(1, "Headline is required")
  .max(STATUS_HEADLINE_MAX, `Headline must be ${STATUS_HEADLINE_MAX} characters or fewer`);

const updateFields = z.object({
  health: healthField,
  schedule_rag: dimensionField,
  budget_rag: dimensionField,
  scope_rag: dimensionField,
  quality_rag: dimensionField,
  headline: headlineField,
  done: sectionField("Done"),
  next: sectionField("Next"),
  blockers: sectionField("Blockers"),
  client_asks: sectionField("Client asks"),
  internal_notes: sectionField("Internal notes"),
});

export const createStatusUpdateSchema = updateFields.extend({
  project_id: z.string({ error: "Missing project" }).trim().min(1, "Missing project"),
});

export const updateStatusUpdateSchema = updateFields.partial();

export type CreateStatusUpdateSchemaInput = z.infer<typeof createStatusUpdateSchema>;
export type UpdateStatusUpdateSchemaInput = z.infer<typeof updateStatusUpdateSchema>;
