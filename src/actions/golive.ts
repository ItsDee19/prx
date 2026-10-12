"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data/activity";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { GOLIVE_ERRORS, closeTuning, getGoLiveSummary, setGoLiveDate } from "@/lib/data/golive";
import { getProject } from "@/lib/data/projects";
import { closeTuningSchema, setGoLiveSchema } from "@/lib/schemas/golive";
import type { ActionResult, GoLiveSummary, Project, User } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { fieldErrorsFromIssues } from "@/lib/validation";

const FIX_FIELDS = "Please fix the highlighted fields.";
const PROJECT_NOT_FOUND = "This project no longer exists.";
const CLOSE_FORBIDDEN = "Only an admin or the project owner can close tuning.";
const HANDOVER_OPEN = "Finish the handover checklist first, or confirm that you are closing tuning early.";

const USER_FACING_ERRORS: ReadonlySet<string> = new Set<string>(Object.values(GOLIVE_ERRORS));

function revalidate(): void {
  revalidatePath("/", "layout");
}

function isAdmin(user: User): boolean {
  return user.role === "admin";
}

function failure(error: unknown, message: string): ActionResult<never> {
  if (error instanceof Error && USER_FACING_ERRORS.has(error.message)) {
    return { ok: false, error: error.message };
  }
  console.error(message, error);
  return { ok: false, error: message };
}

function validationFailure(fieldErrors: Record<string, string>): ActionResult<never> {
  const messages = Object.values(fieldErrors);
  return { ok: false, error: messages.length === 1 ? messages[0] : FIX_FIELDS, fieldErrors };
}

/** Member. Sets (or, with null, clears) the go-live date; logs go_live_set / go_live_cleared. */
export async function setGoLiveDateAction(
  projectId: string,
  date: string | null,
  tuningDays?: number,
): Promise<ActionResult<Project>> {
  const user = await requireUser();
  const parsed = setGoLiveSchema.safeParse({ projectId, date, tuningDays });
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));
  const data = parsed.data;
  const options = { includeCommercial: isAdmin(user) };

  try {
    const existing = await getProject(data.projectId, options);
    if (!existing) return { ok: false, error: PROJECT_NOT_FOUND };
    const tuningChanged = data.tuningDays !== undefined && data.tuningDays !== existing.tuning_days;
    if (existing.go_live_date === data.date && !tuningChanged) return { ok: true, data: existing };
    if (data.date === null && existing.go_live_date === null) return { ok: true, data: existing };

    const project = await setGoLiveDate(existing.id, data.date, data.tuningDays, options);
    if (data.date === null) {
      await logActivity({
        project_id: project.id,
        actor_id: user.id,
        type: "go_live_cleared",
        message: "cleared the go-live date",
        meta: { from: existing.go_live_date },
      });
    } else {
      const window = `${project.tuning_days}-day tuning window`;
      await logActivity({
        project_id: project.id,
        actor_id: user.id,
        type: "go_live_set",
        message:
          existing.go_live_date === null
            ? `set the go-live date to ${formatDate(data.date)} and started the ${window}`
            : existing.go_live_date === data.date
              ? `changed the tuning window to ${project.tuning_days} days`
              : `moved the go-live date to ${formatDate(data.date)}`,
        meta: {
          from: existing.go_live_date,
          to: data.date,
          tuning_days: project.tuning_days,
          delivery_state: project.delivery_state,
        },
      });
    }
    revalidate();
    return { ok: true, data: project };
  } catch (error) {
    return failure(error, "Could not save the go-live date. Please try again.");
  }
}

/**
 * Admin or project owner. Refuses while the handover checklist (scale-phase
 * deliverables) is incomplete unless `early` is true; logs tuning_closed.
 */
export async function closeTuningAction(projectId: string, input: { early: boolean }): Promise<ActionResult<Project>> {
  const user = await requireUser();
  const parsed = closeTuningSchema.safeParse({ projectId, early: input?.early });
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));
  const options = { includeCommercial: isAdmin(user) };

  try {
    const existing = await getProject(parsed.data.projectId, options);
    if (!existing) return { ok: false, error: PROJECT_NOT_FOUND };
    if (!isAdmin(user) && existing.owner_id !== user.id) return { ok: false, error: CLOSE_FORBIDDEN };

    const summary = await getGoLiveSummary(existing.id, await getWorkspaceToday());
    const handoverOpen = summary.handover_done < summary.handover_total;
    if (handoverOpen && !parsed.data.early) return { ok: false, error: HANDOVER_OPEN };

    const project = await closeTuning(existing.id, options);
    const early = parsed.data.early && (handoverOpen || (summary.days_left !== null && summary.days_left > 0));
    await logActivity({
      project_id: project.id,
      actor_id: user.id,
      type: "tuning_closed",
      message: early ? "closed tuning early and handed the project over" : "closed tuning and handed the project over",
      meta: {
        early,
        handover_done: summary.handover_done,
        handover_total: summary.handover_total,
        days_left: summary.days_left,
      },
    });
    revalidate();
    return { ok: true, data: project };
  } catch (error) {
    return failure(error, "Could not close tuning. Please try again.");
  }
}

/** Member. The go-live countdown and handover progress (for client components that load it lazily). */
export async function getGoLiveSummaryAction(projectId: string): Promise<ActionResult<GoLiveSummary>> {
  await requireUser();
  const parsed = closeTuningSchema.shape.projectId.safeParse(projectId);
  if (!parsed.success) return { ok: false, error: PROJECT_NOT_FOUND };
  try {
    const project = await getProject(parsed.data);
    if (!project) return { ok: false, error: PROJECT_NOT_FOUND };
    return { ok: true, data: await getGoLiveSummary(project.id, await getWorkspaceToday()) };
  } catch (error) {
    return failure(error, "Could not load the tuning window. Please try again.");
  }
}
