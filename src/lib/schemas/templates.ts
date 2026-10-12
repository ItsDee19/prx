import { z } from "zod";
import { MAX_DB_INT, MAX_SUCCESS_METRICS, MAX_TUNING_DAYS } from "@/lib/constants";
import { parseTemplateKey } from "@/lib/templates";
import {
  BUDGET_PERIODS,
  DELIVERY_STATES,
  ENGAGEMENT_TYPES,
  METRIC_DIRECTIONS,
  MILESTONE_KINDS,
  PROGRESS_MODES,
  RISK_CATEGORIES,
  RISK_KINDS,
  SERVICE_LINES,
} from "@/lib/types";
import { isDateOnly } from "@/lib/workspace-time";

/**
 * zod v4 schemas for engagement templates (SPEC.md sections 17.6 and 18.3).
 * `templatePayloadSchema` mirrors `TemplatePayload` and is also used by the
 * data layer to normalise custom payloads read back from JSONB.
 */

export const TEMPLATE_NAME_MAX = 80;
export const TEMPLATE_DESCRIPTION_MAX = 500;
/** Generous caps so a captured project always fits, while a payload stays bounded. */
export const TEMPLATE_MAX_MILESTONES = 40;
export const TEMPLATE_MAX_TASKS_PER_MILESTONE = 200;
export const TEMPLATE_MAX_CHECKLIST_ITEMS = 50;
export const TEMPLATE_MAX_RISKS = 50;
export const TEMPLATE_MAX_LABELS = 30;
/** Offsets and durations stay within ten years of the start date. */
export const TEMPLATE_MAX_DAYS = 3650;

const emptyToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

const idField = z.string({ error: "Missing id" }).trim().min(1, "Missing id");

const days = z.number().int().min(0).max(TEMPLATE_MAX_DAYS);
const score = z.number().int().min(1).max(5).nullable().optional();

export const templateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  is_deliverable: z.boolean(),
  offset_days: days,
  duration_days: days,
  estimate_minutes: z.number().int().min(0).max(MAX_DB_INT).nullable(),
  checklist: z.array(z.string().trim().min(1).max(200)).max(TEMPLATE_MAX_CHECKLIST_ITEMS),
});

export const templateMilestoneSchema = z.object({
  key: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(MILESTONE_KINDS),
  offset_days: days,
  duration_days: days,
  requires_gate: z.boolean(),
  description: z.string().max(5000),
  is_tuning: z.boolean().optional(),
  tasks: z.array(templateTaskSchema).max(TEMPLATE_MAX_TASKS_PER_MILESTONE),
});

export const templateMetricSchema = z.object({
  name: z.string().trim().min(1).max(80),
  unit: z.string().max(20),
  direction: z.enum(METRIC_DIRECTIONS),
  baseline: z.number().nullable().optional(),
  target: z.number(),
});

export const templateRiskSchema = z.object({
  kind: z.enum(RISK_KINDS),
  category: z.enum(RISK_CATEGORIES),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  likelihood: score,
  impact: score,
  mitigation: z.string().max(5000).optional(),
});

export const templatePayloadSchema = z.object({
  progress_mode: z.enum(PROGRESS_MODES),
  engagement_type: z.enum(ENGAGEMENT_TYPES).nullable(),
  service_line: z.enum(SERVICE_LINES).nullable(),
  delivery_state: z.enum(DELIVERY_STATES),
  budget_period: z.enum(BUDGET_PERIODS),
  tuning_days: z.number().int().min(0).max(MAX_TUNING_DAYS),
  milestones: z.array(templateMilestoneSchema).max(TEMPLATE_MAX_MILESTONES),
  metrics: z.array(templateMetricSchema).max(MAX_SUCCESS_METRICS),
  risks: z.array(templateRiskSchema).max(TEMPLATE_MAX_RISKS),
  label_names: z.array(z.string().trim().min(1).max(60)).max(TEMPLATE_MAX_LABELS),
});

/** "builtin:<key>" (a known built-in) or "custom:<id>". */
export const templateKeySchema = z
  .string({ error: "Choose a template" })
  .trim()
  .min(1, "Choose a template")
  .max(80, "Choose a template")
  .refine((value) => parseTemplateKey(value) !== null, "Choose a template");

export const projectIdSchema = idField;
export const templateIdSchema = idField;

const nameField = z
  .string({ error: "Name the template" })
  .trim()
  .min(1, "Name the template")
  .max(TEMPLATE_NAME_MAX, `Use at most ${TEMPLATE_NAME_MAX} characters`);

const descriptionField = z
  .string()
  .trim()
  .max(TEMPLATE_DESCRIPTION_MAX, `Use at most ${TEMPLATE_DESCRIPTION_MAX} characters`);

const serviceLineField = z.preprocess(
  emptyToNull,
  z.enum(SERVICE_LINES, { error: "Choose a valid service line" }).nullable(),
);

/** saveProjectAsTemplateAction input. */
export const saveAsTemplateSchema = z.object({
  name: nameField,
  description: descriptionField.optional(),
  service_line: serviceLineField.optional(),
});
export type SaveAsTemplateInput = z.input<typeof saveAsTemplateSchema>;

/** UpdateProjectTemplateInput (name, description, service line). */
export const updateCustomTemplateSchema = z
  .object({
    name: nameField.optional(),
    description: descriptionField.optional(),
    service_line: serviceLineField.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), "Nothing to change");

const projectNameField = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(120, "Name must be 120 characters or fewer");

const dateField = z.string().refine(isDateOnly, "Use a valid date (YYYY-MM-DD)");

/** Optional second argument of convertToPilotAction (the dialog's choices). */
export const convertToPilotOptionsSchema = z.object({
  name: projectNameField.optional(),
  start_date: dateField.optional(),
  service_line: z.enum(SERVICE_LINES, { error: "Choose a valid service line" }).optional(),
});
export type ConvertToPilotOptions = z.input<typeof convertToPilotOptionsSchema>;

/** Optional second argument of proposeRetainerAction (the dialog's choices). */
export const proposeRetainerOptionsSchema = z.object({
  name: projectNameField.optional(),
  start_date: dateField.optional(),
  budget_hours: z
    .number({ error: "Enter whole hours" })
    .int("Use whole hours")
    .min(0, "Hours cannot be negative")
    .max(MAX_DB_INT, "That budget is too large")
    .nullable()
    .optional(),
});
export type ProposeRetainerOptions = z.input<typeof proposeRetainerOptionsSchema>;
