"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { updateAppSettings } from "@/lib/data/app-settings";
import { updateAppSettingsSchema } from "@/lib/schemas/app-settings";
import type { ActionResult, AppSettings, UpdateAppSettingsInput } from "@/lib/types";
import { fieldErrorsFromIssues } from "@/lib/validation";

/** Admin: workspace timezone, USD to INR rate, default tuning days, update cadence. No activity (configuration). */
export async function updateAppSettingsAction(input: UpdateAppSettingsInput): Promise<ActionResult<AppSettings>> {
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false, error: "Only admins can change workspace settings." };
  const parsed = updateAppSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFromIssues(parsed.error.issues);
    const messages = Object.values(fieldErrors);
    return { ok: false, error: messages.length === 1 ? messages[0] : "Please fix the highlighted fields.", fieldErrors };
  }
  try {
    const settings = await updateAppSettings(parsed.data, user.id, { includeCommercial: true });
    revalidatePath("/", "layout");
    return { ok: true, data: settings };
  } catch (error) {
    const userFacing =
      error instanceof Error && error.constructor === Error && !("code" in error) && /[.!?]$/.test(error.message);
    if (!userFacing) console.error("updateAppSettingsAction", error);
    return {
      ok: false,
      error: userFacing ? (error as Error).message : "Could not save the workspace settings. Please try again.",
    };
  }
}
