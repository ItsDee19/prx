import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { PRIORITIES, PROJECT_STATUSES } from "@/lib/types";

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

export const projectInputSchema = projectFields.superRefine(checkDateOrder);
/**
 * zod v4 refuses `.partial()` on a schema that already carries refinements,
 * so the partial schema is derived from the unrefined field set and the
 * cross-field date check is re-applied.
 */
export const updateProjectSchema = projectFields.partial().superRefine(checkDateOrder);

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
