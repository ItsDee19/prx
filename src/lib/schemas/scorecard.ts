import { z } from "zod";
import { GATE_DECISIONS, METRIC_DIRECTIONS } from "@/lib/types";
import { isHttpUrl } from "@/lib/utils";
import { isDateOnly } from "@/lib/workspace-time";

/**
 * zod v4 schemas for the success scorecard and gate decisions (W4 scorecard).
 * Metric values are plain numbers; rates are fractions 0-1 (unit "%" is
 * display-only, so a "%" metric's baseline/target/current must be 0-1).
 */

export const METRIC_NAME_MAX = 80;
export const METRIC_UNIT_MAX = 16;
export const METRIC_NOTES_MAX = 2000;
export const METRIC_REASON_MAX = 500;
/** Largest magnitude accepted for a metric value (latencies in ms, hours, counts...). */
export const METRIC_VALUE_MAX = 1_000_000_000;
export const GATE_TEXT_MAX = 5000;
export const GATE_SIGNOFF_NAME_MAX = 120;
export const EVIDENCE_URL_MAX = 2000;

/** The rule shared by the schemas, the data layer and the dialog. */
export const RATE_RANGE_MESSAGE = "Percent values must be between 0% and 100%.";

const emptyToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

const idField = z.string({ error: "Missing id" }).trim().min(1, "Missing id");

const valueField = z
  .number({ error: "Enter a number" })
  .refine(Number.isFinite, "Enter a number")
  .min(-METRIC_VALUE_MAX, "That value is too small")
  .max(METRIC_VALUE_MAX, "That value is too large");

const nameField = z
  .string({ error: "Name the metric" })
  .trim()
  .min(1, "Name the metric")
  .max(METRIC_NAME_MAX, `Names must be ${METRIC_NAME_MAX} characters or fewer`);

const unitField = z.string().trim().max(METRIC_UNIT_MAX, `Units must be ${METRIC_UNIT_MAX} characters or fewer`);

const metricFields = z.object({
  name: nameField,
  unit: unitField.optional(),
  direction: z.enum(METRIC_DIRECTIONS, { error: "Choose higher or lower is better" }).optional(),
  baseline: valueField.nullable().optional(),
  target: valueField,
  current: valueField.nullable().optional(),
  notes: z.string().trim().max(METRIC_NOTES_MAX, `Notes must be ${METRIC_NOTES_MAX} characters or fewer`).optional(),
});

/** True when a "%" metric value lies outside the 0-1 fraction range. */
export function isRateOutOfRange(unit: string | undefined | null, value: number | null | undefined): boolean {
  return unit === "%" && typeof value === "number" && (value < 0 || value > 1);
}

function checkRates(
  value: { unit?: string; baseline?: number | null; target?: number; current?: number | null },
  ctx: z.RefinementCtx,
): void {
  if (value.unit === undefined) return;
  for (const key of ["baseline", "target", "current"] as const) {
    if (isRateOutOfRange(value.unit, value[key])) {
      ctx.addIssue({ code: "custom", message: RATE_RANGE_MESSAGE, path: [key] });
    }
  }
}

export const createMetricSchema = metricFields.extend({ project_id: idField }).superRefine(checkRates);

/** zod v4 refuses `.partial()` on a refined schema: derive it from the plain field set. */
export const updateMetricSchema = metricFields
  .partial()
  .extend({
    reason: z
      .string()
      .trim()
      .max(METRIC_REASON_MAX, `Keep the reason under ${METRIC_REASON_MAX} characters`)
      .optional(),
  })
  .superRefine(checkRates);

export const reorderMetricsSchema = z.object({
  projectId: idField,
  orderedIds: z.array(idField).max(100, "Too many metrics"),
});

export const metricIdSchema = idField;
export const scorecardProjectIdSchema = idField;

const dateOnlyField = z.preprocess(
  emptyToNull,
  z.string().refine(isDateOnly, "Use a valid date (YYYY-MM-DD)").nullable(),
);

const optionalText = (max: number, message: string) => z.string().trim().max(max, message).optional();

export const gateDecisionSchema = z
  .object({
    decision: z.enum(GATE_DECISIONS, { error: "Choose Go, Extend once or Stop" }),
    notes: z.string().trim().max(GATE_TEXT_MAX, "Notes are too long").default(""),
    /** Conditions attached to a Go ("Go with conditions"); stored with the gate notes. */
    conditions: optionalText(GATE_TEXT_MAX, "Conditions are too long"),
    fix_list: optionalText(GATE_TEXT_MAX, "The fix list is too long"),
    new_due_date: dateOnlyField.optional(),
    client_signoff_name: z
      .preprocess(emptyToNull, z.string().trim().max(GATE_SIGNOFF_NAME_MAX, "Name is too long").nullable())
      .optional(),
    client_signoff_date: dateOnlyField.optional(),
    evidence_url: z
      .preprocess(
        emptyToNull,
        z
          .string()
          .trim()
          .max(EVIDENCE_URL_MAX, "Link is too long")
          .refine(isHttpUrl, "Use a full http:// or https:// link")
          .nullable(),
      )
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== "extend") return;
    if (!value.fix_list || value.fix_list.trim() === "") {
      ctx.addIssue({ code: "custom", message: "List what must be fixed before the next review", path: ["fix_list"] });
    }
    if (!value.new_due_date) {
      ctx.addIssue({ code: "custom", message: "Pick the new due date", path: ["new_due_date"] });
    }
  });

export type CreateMetricSchemaInput = z.output<typeof createMetricSchema>;
export type UpdateMetricSchemaInput = z.output<typeof updateMetricSchema>;
export type GateDecisionSchemaInput = z.output<typeof gateDecisionSchema>;
