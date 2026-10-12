import { z } from "zod";
import { EVAL_CHANGE_TYPES } from "@/lib/types";
import { isHttpUrl } from "@/lib/utils";
import { isDateOnly } from "@/lib/workspace-time";

/**
 * zod v4 schemas for the experiment and evaluation log (W4 evals-batches).
 * Metric values are plain numbers; rates are fractions 0-1 like the scorecard
 * and METRIC_PRESETS (unit "%" is display-only, see formatMetricValue).
 */

export const EVAL_LABEL_MAX = 120;
export const EVAL_VERSION_MAX = 120;
export const EVAL_NOTES_MAX = 5000;
export const EVAL_URL_MAX = 2000;
export const EVAL_METRIC_NAME_MAX = 60;
export const EVAL_METRICS_MAX = 30;
/** Largest magnitude accepted for a metric value (keeps JSON and charts sane). */
export const EVAL_METRIC_VALUE_MAX = 1e12;

/** Verdicts a user can set directly ("champion" via promotion, "archived" via demotion). */
export const EDITABLE_EVAL_VERDICTS = ["baseline", "candidate", "rejected"] as const;
export type EditableEvalVerdict = (typeof EDITABLE_EVAL_VERDICTS)[number];

const emptyToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const evalRunIdSchema = z.string({ error: "Missing run" }).trim().min(1, "Missing run");

const idField = z.string({ error: "Missing id" }).trim().min(1, "Missing id");

const optionalIdField = z.preprocess(emptyToNull, z.string().trim().min(1).nullable());

const versionField = (label: string) =>
  z
    .string()
    .trim()
    .max(EVAL_VERSION_MAX, `${label} must be ${EVAL_VERSION_MAX} characters or fewer`);

const metricValue = z
  .number({ error: "Metric values must be numbers" })
  .refine(Number.isFinite, "Metric values must be numbers")
  .refine((value) => Math.abs(value) <= EVAL_METRIC_VALUE_MAX, "That metric value is too large");

/**
 * Metric name -> value. Names are trimmed, 1-60 characters and unique
 * case-insensitively (they are matched to scorecard names that way).
 */
export const evalMetricsSchema = z
  .record(z.string(), metricValue, { error: "Add metrics as name and value pairs" })
  .transform((value, ctx) => {
    const out: Record<string, number> = {};
    const seen = new Set<string>();
    for (const [rawName, metric] of Object.entries(value)) {
      const name = rawName.trim();
      if (!name) {
        ctx.addIssue({ code: "custom", message: "Every metric needs a name", path: [rawName] });
        continue;
      }
      if (name.length > EVAL_METRIC_NAME_MAX) {
        ctx.addIssue({
          code: "custom",
          message: `Metric names must be ${EVAL_METRIC_NAME_MAX} characters or fewer`,
          path: [rawName],
        });
        continue;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", message: `"${name}" is listed twice`, path: [rawName] });
        continue;
      }
      seen.add(key);
      out[name] = metric;
    }
    if (Object.keys(out).length > EVAL_METRICS_MAX) {
      ctx.addIssue({ code: "custom", message: `Log at most ${EVAL_METRICS_MAX} metrics per run` });
    }
    return out;
  });

const runFields = z.object({
  milestone_id: optionalIdField.optional(),
  label: z
    .string({ error: "Give the run a label" })
    .trim()
    .min(1, "Give the run a label")
    .max(EVAL_LABEL_MAX, `Labels must be ${EVAL_LABEL_MAX} characters or fewer`),
  change_type: z.enum(EVAL_CHANGE_TYPES, { error: "Choose a change type" }).optional(),
  model_name: versionField("Model").optional(),
  prompt_version: versionField("Prompt version").optional(),
  dataset_version: versionField("Dataset").optional(),
  metrics: evalMetricsSchema,
  verdict: z.enum(EDITABLE_EVAL_VERDICTS, { error: "Choose baseline, candidate or rejected" }).optional(),
  external_url: z
    .preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .max(EVAL_URL_MAX, "Link is too long")
        .refine(isHttpUrl, "Use a full http(s) link")
        .nullable(),
    )
    .optional(),
  notes: z.string().trim().max(EVAL_NOTES_MAX, `Notes must be ${EVAL_NOTES_MAX} characters or fewer`).optional(),
  /** Date the run was evaluated (workspace date); defaults to now. Stored as created_at. */
  run_date: z
    .preprocess(emptyToNull, z.string().refine(isDateOnly, "Use a valid date (YYYY-MM-DD)").nullable())
    .optional(),
});

export const createEvalRunSchema = runFields.extend({ project_id: idField });

export const updateEvalRunSchema = runFields.partial();

export const promoteChampionSchema = z.object({
  update_scorecard: z.boolean({ error: "Choose whether to update the scorecard" }),
});

export const metricNamesProjectSchema = idField;

export type CreateEvalRunSchemaOutput = z.output<typeof createEvalRunSchema>;
export type UpdateEvalRunSchemaOutput = z.output<typeof updateEvalRunSchema>;
