import { z } from "zod";
import { MAX_TUNING_DAYS } from "@/lib/constants";
import { isDateOnly } from "@/lib/workspace-time";

/** zod v4 schemas for go-live and the post-go-live tuning window (W4 scorecard). */

export const goLiveProjectIdSchema = z.string({ error: "Missing project" }).trim().min(1, "Missing project");

export const goLiveDateSchema = z.preprocess(
  (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().refine(isDateOnly, "Use a valid date (YYYY-MM-DD)").nullable(),
);

export const tuningDaysSchema = z
  .number({ error: "Tuning days must be a whole number" })
  .int("Tuning days must be a whole number")
  .min(0, "Tuning days cannot be negative")
  .max(MAX_TUNING_DAYS, `Tuning windows are at most ${MAX_TUNING_DAYS} days`);

export const setGoLiveSchema = z.object({
  projectId: goLiveProjectIdSchema,
  date: goLiveDateSchema,
  tuningDays: tuningDaysSchema.optional(),
});

export const closeTuningSchema = z.object({
  projectId: goLiveProjectIdSchema,
  early: z.boolean({ error: "Say whether tuning closes early" }),
});

export type SetGoLiveSchemaInput = z.output<typeof setGoLiveSchema>;
