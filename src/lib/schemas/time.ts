import { z } from "zod";
import { MAX_ENTRY_MINUTES, MAX_MONEY, MAX_WEEKLY_CAPACITY_HOURS } from "@/lib/constants";
import { isDateOnly } from "@/lib/workspace-time";

/**
 * zod v4 schemas for time tracking (SPEC.md sections 16 and 18.4). Minutes are
 * whole numbers (the UI parses "1h 30m" / "1.5" / "90m" with parseDuration
 * before sending); entry dates are "YYYY-MM-DD"; ids are non-empty strings.
 */

export const TIME_NOTE_MAX = 2000;

const emptyToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const timeIdSchema = z.string({ error: "Missing id" }).trim().min(1, "Missing id");

const projectIdField = z.string({ error: "Choose a project" }).trim().min(1, "Choose a project");

const taskIdField = z.preprocess(emptyToNull, z.string().trim().min(1).nullable()).optional();

const entryDateField = z
  .string({ error: "Choose a date" })
  .trim()
  .refine(isDateOnly, "Use a valid date (YYYY-MM-DD)");

const noteField = z
  .string({ error: "The note must be text" })
  .trim()
  .max(TIME_NOTE_MAX, `Keep the note under ${TIME_NOTE_MAX} characters`)
  .optional();

const entryMinutesField = z
  .number({ error: "Enter a duration such as 1h 30m" })
  .int("Enter whole minutes")
  .min(1, "Enter at least 1 minute")
  .max(MAX_ENTRY_MINUTES, `Enter at most ${MAX_ENTRY_MINUTES / 60} hours`);

export const startTimerSchema = z.object({
  project_id: projectIdField,
  task_id: taskIdField,
  note: noteField,
});

export const logTimeSchema = z.object({
  project_id: projectIdField,
  task_id: taskIdField,
  entry_date: entryDateField,
  minutes: entryMinutesField,
  billable: z.boolean({ error: "Billable must be on or off" }).optional(),
  note: noteField,
});

export const updateTimeEntrySchema = logTimeSchema.partial();

export const timesheetCellSchema = z.object({
  project_id: projectIdField,
  task_id: taskIdField,
  entry_date: entryDateField,
  minutes: z
    .number({ error: "Enter a duration such as 1h 30m" })
    .int("Enter whole minutes")
    .min(0, "Durations cannot be negative")
    .max(MAX_ENTRY_MINUTES, `A day holds at most ${MAX_ENTRY_MINUTES / 60} hours`),
});

export const capacitySchema = z
  .number({ error: "Enter the weekly hours" })
  .int("Use whole hours")
  .min(0, "Capacity cannot be negative")
  .max(MAX_WEEKLY_CAPACITY_HOURS, `A week has at most ${MAX_WEEKLY_CAPACITY_HOURS} hours`);

export const costRateSchema = z
  .number({ error: "Enter the cost rate in rupees per hour" })
  .int("Use whole rupees")
  .min(0, "The cost rate cannot be negative")
  .max(MAX_MONEY, "That cost rate is too large")
  .nullable();

/** GET /api/export/time query string (every key optional). */
export const timeExportQuerySchema = z.object({
  from: z.preprocess(emptyToNull, z.string().refine(isDateOnly, "from must be YYYY-MM-DD").nullable()).optional(),
  to: z.preprocess(emptyToNull, z.string().refine(isDateOnly, "to must be YYYY-MM-DD").nullable()).optional(),
  user: z.preprocess(emptyToNull, z.string().trim().min(1).max(64).nullable()).optional(),
  project: z.preprocess(emptyToNull, z.string().trim().min(1).max(64).nullable()).optional(),
  client: z.preprocess(emptyToNull, z.string().trim().min(1).max(64).nullable()).optional(),
});

export type StartTimerSchemaInput = z.infer<typeof startTimerSchema>;
export type LogTimeSchemaInput = z.infer<typeof logTimeSchema>;
export type UpdateTimeEntrySchemaInput = z.infer<typeof updateTimeEntrySchema>;
export type TimesheetCellSchemaInput = z.infer<typeof timesheetCellSchema>;
