import { z } from "zod";
import { MAX_DB_INT, MAX_MONEY, MAX_TUNING_DAYS, MIN_PASSWORD_LENGTH } from "@/lib/constants";
import {
  BUDGET_PERIODS,
  CURRENCIES,
  DELIVERY_STATES,
  ENGAGEMENT_TYPES,
  PRIORITIES,
  PROGRESS_MODES,
  PROJECT_STATUSES,
  SERVICE_LINES,
} from "@/lib/types";

/**
 * zod v4 schemas shared by server actions and (mirrored by) client forms.
 * Optional text-like fields coerce "" to null so native form controls can be
 * submitted untouched.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const emptyToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

const normalizeEmail = (value: unknown): unknown =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

/** "YYYY-MM-DD" that also round-trips through Date (rejects e.g. 2026-02-30). */
function isRealDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export const emailSchema = z.preprocess(
  normalizeEmail,
  z.email("Enter a valid email address").max(254, "Email must be 254 characters or fewer"),
);

const personNameField = z
  .string({ error: "Name is required" })
  .trim()
  .min(1, "Name is required")
  .max(80, "Name must be 80 characters or fewer");

const passwordField = z
  .string({ error: "Password is required" })
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(128, "Password must be 128 characters or fewer");

const jobTitleField = z.preprocess(
  emptyToNull,
  z.string().trim().max(80, "Job title must be 80 characters or fewer").nullable(),
);

const colorField = z.string().regex(HEX_COLOR, "Colour must be a hex value like #5b5bd6");

const roleField = z.enum(["admin", "member"], { error: "Choose a valid role" });

const dateOnlyField = z.preprocess(
  emptyToNull,
  z.string().refine(isRealDateOnly, "Use a valid date (YYYY-MM-DD)").nullable(),
);

const idOrNullField = z.preprocess(emptyToNull, z.string().min(1).nullable());

/* ------------------------------ Projects ------------------------------ */

/** A project can carry at most this many labels. */
export const MAX_PROJECT_LABELS = 30;

const projectFields = z.object({
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be 120 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(5000, "Description must be 5000 characters or fewer")
    .optional(),
  status: z.enum(PROJECT_STATUSES, { error: "Choose a valid status" }).optional(),
  priority: z.enum(PRIORITIES, { error: "Choose a valid priority" }).optional(),
  owner_id: idOrNullField.optional(),
  start_date: dateOnlyField.optional(),
  due_date: dateOnlyField.optional(),
  progress: z.coerce
    .number({ error: "Progress must be a number" })
    .int("Progress must be a whole number")
    .min(0, "Progress must be between 0 and 100")
    .max(100, "Progress must be between 0 and 100")
    .optional(),
  color: z.preprocess(emptyToNull, colorField.nullable()).optional(),
  parent_id: idOrNullField.optional(),
  member_ids: z.array(z.string().min(1)).optional(),
});

/** Whole currency units, 0..MAX_MONEY (the INTEGER column limit). Admin-only fields. */
const moneyField = z
  .number({ error: "Enter an amount" })
  .int("Use a whole amount (no paise or cents)")
  .min(0, "Amounts cannot be negative")
  .max(MAX_MONEY, "That amount is too large")
  .nullable();

/** v2 engagement fields (ProjectEngagementInput + ProjectCommercialInput), shared by create and update. */
const engagementFields = z.object({
  client_id: idOrNullField.optional(),
  service_line: z.preprocess(emptyToNull, z.enum(SERVICE_LINES, { error: "Choose a valid service line" }).nullable()).optional(),
  engagement_type: z
    .preprocess(emptyToNull, z.enum(ENGAGEMENT_TYPES, { error: "Choose a valid engagement type" }).nullable())
    .optional(),
  currency: z.preprocess(emptyToNull, z.enum(CURRENCIES, { error: "Choose a valid currency" }).nullable()).optional(),
  delivery_state: z.enum(DELIVERY_STATES, { error: "Choose a valid delivery state" }).optional(),
  progress_mode: z.enum(PROGRESS_MODES, { error: "Choose a valid progress mode" }).optional(),
  budget_hours: z
    .number({ error: "Enter the budget in hours" })
    .int("Use whole hours")
    .min(0, "Hours cannot be negative")
    .max(MAX_DB_INT, "That budget is too large")
    .nullable()
    .optional(),
  budget_period: z.enum(BUDGET_PERIODS, { error: "Choose a valid budget period" }).optional(),
  label_ids: z
    .array(z.string().min(1))
    .max(MAX_PROJECT_LABELS, `Pick at most ${MAX_PROJECT_LABELS} labels`)
    .optional(),
  contract_value: moneyField.optional(),
  hourly_rate: moneyField.optional(),
});

/** Set only by the templates / conversion flows (createProjectAction ignores them). */
const provenanceFields = z.object({
  template_key: z.preprocess(emptyToNull, z.string().max(80, "Invalid template").nullable()).optional(),
  source_project_id: idOrNullField.optional(),
  tuning_days: z
    .number({ error: "Enter a number of days" })
    .int("Use whole days")
    .min(0, "Tuning days cannot be negative")
    .max(MAX_TUNING_DAYS, `Use at most ${MAX_TUNING_DAYS} days`)
    .optional(),
});

const projectUpdateFields = projectFields.extend(engagementFields.shape);
const projectCreateFields = projectUpdateFields.extend(provenanceFields.shape);

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

/** CreateProjectFullInput (v1 fields, engagement and commercial fields, provenance). */
export const projectInputSchema = projectCreateFields.superRefine(checkDateOrder);
/**
 * UpdateProjectFullInput. zod v4 refuses `.partial()` on a schema that already
 * carries refinements, so the partial schema is derived from the unrefined
 * field set and the cross-field date check is re-applied. It has no
 * go_live_date / tuning_days / template keys (setGoLiveDate and the templates
 * own them).
 */
export const updateProjectSchema = projectUpdateFields.partial().superRefine(checkDateOrder);

export type ProjectInput = z.output<typeof projectInputSchema>;
export type UpdateProjectSchemaInput = z.output<typeof updateProjectSchema>;

/* -------------------------------- Auth -------------------------------- */

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "Password is required" }).min(1, "Password is required"),
  next: z.string().optional(),
});

export const registerSchema = z
  .object({
    name: personNameField,
    email: emailSchema,
    password: passwordField,
    confirm_password: z
      .string({ error: "Please confirm your password" })
      .min(1, "Please confirm your password"),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirm_password) {
      ctx.addIssue({ code: "custom", message: "Passwords do not match", path: ["confirm_password"] });
    }
  });

/* -------------------------------- Users ------------------------------- */

export const createUserSchema = z.object({
  name: personNameField,
  email: emailSchema,
  password: passwordField,
  role: roleField,
  job_title: jobTitleField.optional(),
});

export const profileSchema = z.object({
  name: personNameField,
  job_title: jobTitleField.optional(),
  color: colorField,
});

export const changePasswordSchema = z
  .object({
    current_password: z
      .string({ error: "Enter your current password" })
      .min(1, "Enter your current password"),
    new_password: passwordField,
  })
  .superRefine((value, ctx) => {
    if (value.new_password === value.current_password) {
      ctx.addIssue({
        code: "custom",
        message: "New password must be different from your current password",
        path: ["new_password"],
      });
    }
  });

/* ------------------------------ Comments ------------------------------ */

export const commentSchema = z.object({
  body: z
    .string({ error: "Comment cannot be empty" })
    .trim()
    .min(1, "Comment cannot be empty")
    .max(4000, "Comment must be 4000 characters or fewer"),
});

/* ------------------------------ Helpers ------------------------------- */

/**
 * Maps zod issues to `{ [field]: message }`, keeping the first issue per
 * top-level field so nested issues (e.g. `member_ids.2`) attach to the
 * control the form actually renders. Issues without a path use `_form`.
 */
export function fieldErrorsFromIssues(issues: z.core.$ZodIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}
