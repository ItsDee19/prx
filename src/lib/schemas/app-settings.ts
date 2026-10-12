import { z } from "zod";
import { MAX_TUNING_DAYS, MAX_UPDATE_CADENCE_DAYS, MIN_UPDATE_CADENCE_DAYS } from "@/lib/constants";
import { isValidTimeZone } from "@/lib/workspace-time";

/** zod schema for Settings > Workspace (admin only; W2 commercial). */

/** Upper bound for the USD to INR rate (a sanity cap, far above any real rate). */
export const MAX_USD_INR_RATE = 10_000;

export const updateAppSettingsSchema = z.object({
  workspace_timezone: z
    .string({ error: "Choose a time zone" })
    .trim()
    .min(1, "Choose a time zone")
    .max(64, "Choose a valid time zone")
    .refine(isValidTimeZone, "Choose a valid time zone")
    .optional(),
  usd_inr_rate: z
    .number({ error: "Enter the rate as a number" })
    .positive("The rate must be greater than zero")
    .max(MAX_USD_INR_RATE, `The rate must be at most ${MAX_USD_INR_RATE}`)
    .optional(),
  default_tuning_days: z
    .number({ error: "Enter a number of days" })
    .int("Use whole days")
    .min(0, "Tuning days cannot be negative")
    .max(MAX_TUNING_DAYS, `Use at most ${MAX_TUNING_DAYS} days`)
    .optional(),
  update_cadence_days: z
    .number({ error: "Enter a number of days" })
    .int("Use whole days")
    .min(MIN_UPDATE_CADENCE_DAYS, `Use at least ${MIN_UPDATE_CADENCE_DAYS} day`)
    .max(MAX_UPDATE_CADENCE_DAYS, `Use at most ${MAX_UPDATE_CADENCE_DAYS} days`)
    .optional(),
});

export type UpdateAppSettingsSchemaInput = z.output<typeof updateAppSettingsSchema>;
