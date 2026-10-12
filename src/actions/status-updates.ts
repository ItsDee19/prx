"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { RAG_CONFIG } from "@/lib/constants";
import { logActivity } from "@/lib/data/activity";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { notifySafely, notifyWatchers, projectNotificationUrl } from "@/lib/data/notifications";
import { getProjectSummary } from "@/lib/data/projects";
import {
  STATUS_UPDATE_ERRORS,
  createStatusUpdate,
  deleteStatusUpdate,
  getStatusUpdate,
  getStatusUpdateDraft,
  updateStatusUpdate,
} from "@/lib/data/status-updates";
import {
  createStatusUpdateSchema,
  statusUpdateIdSchema,
  updateStatusUpdateSchema,
  type UpdateStatusUpdateSchemaInput,
} from "@/lib/schemas/status-updates";
import type {
  ActionResult,
  CreateStatusUpdateInput,
  StatusUpdate,
  StatusUpdateDraft,
  UpdateStatusUpdateInput,
  User,
} from "@/lib/types";
import { formatDate, truncate } from "@/lib/utils";
import { fieldErrorsFromIssues } from "@/lib/validation";

const FIX_FIELDS = "Please fix the highlighted fields.";
const NOT_ALLOWED = "Only the author or an admin can change this update.";
const USER_FACING_ERRORS: ReadonlySet<string> = new Set(Object.values(STATUS_UPDATE_ERRORS));

function revalidate(): void {
  revalidatePath("/", "layout");
}

function validationFailure(fieldErrors: Record<string, string>): ActionResult<never> {
  const messages = Object.values(fieldErrors);
  return { ok: false, error: messages.length === 1 ? messages[0] : FIX_FIELDS, fieldErrors };
}

function failure(error: unknown, message: string): ActionResult<never> {
  if (error instanceof Error && USER_FACING_ERRORS.has(error.message)) return { ok: false, error: error.message };
  console.error(message, error);
  return { ok: false, error: message };
}

function canChange(user: User, update: StatusUpdate): boolean {
  return user.role === "admin" || update.author_id === user.id;
}

function toPatch(data: UpdateStatusUpdateSchemaInput): UpdateStatusUpdateInput {
  const patch: UpdateStatusUpdateInput = {};
  if (data.health !== undefined) patch.health = data.health;
  if (data.schedule_rag !== undefined) patch.schedule_rag = data.schedule_rag;
  if (data.budget_rag !== undefined) patch.budget_rag = data.budget_rag;
  if (data.scope_rag !== undefined) patch.scope_rag = data.scope_rag;
  if (data.quality_rag !== undefined) patch.quality_rag = data.quality_rag;
  if (data.headline !== undefined) patch.headline = data.headline;
  if (data.done !== undefined) patch.done = data.done;
  if (data.next !== undefined) patch.next = data.next;
  if (data.blockers !== undefined) patch.blockers = data.blockers;
  if (data.client_asks !== undefined) patch.client_asks = data.client_asks;
  if (data.internal_notes !== undefined) patch.internal_notes = data.internal_notes;
  return patch;
}

function weekLabel(update: StatusUpdate): string {
  return `the week of ${formatDate(update.week_of)}`;
}

/** Composer preview: changes since the last update and the suggested budget RAG. Member. */
export async function getStatusUpdateDraftAction(projectId: string): Promise<ActionResult<StatusUpdateDraft>> {
  await requireUser();
  const parsed = statusUpdateIdSchema.safeParse(projectId);
  if (!parsed.success) return { ok: false, error: STATUS_UPDATE_ERRORS.projectNotFound };
  try {
    const today = await getWorkspaceToday();
    return { ok: true, data: await getStatusUpdateDraft(parsed.data, today) };
  } catch (error) {
    return failure(error, "Could not load what changed since the last update.");
  }
}

/** Posts a weekly update. Member; logs status_update_posted; notifies project watchers. */
export async function createStatusUpdateAction(input: CreateStatusUpdateInput): Promise<ActionResult<StatusUpdate>> {
  const user = await requireUser();
  const parsed = createStatusUpdateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));
  const data = parsed.data;

  try {
    const project = await getProjectSummary(data.project_id);
    if (!project) return { ok: false, error: STATUS_UPDATE_ERRORS.projectNotFound };
    const today = await getWorkspaceToday();
    const update = await createStatusUpdate(
      {
        project_id: data.project_id,
        health: data.health,
        schedule_rag: data.schedule_rag ?? null,
        budget_rag: data.budget_rag ?? null,
        scope_rag: data.scope_rag ?? null,
        quality_rag: data.quality_rag ?? null,
        headline: data.headline,
        done: data.done,
        next: data.next,
        blockers: data.blockers,
        client_asks: data.client_asks,
        internal_notes: data.internal_notes,
      },
      user.id,
      today,
    );
    const healthLabel = RAG_CONFIG[update.health].label;
    await logActivity({
      project_id: update.project_id,
      actor_id: user.id,
      type: "status_update_posted",
      message: `posted a status update: ${healthLabel}`,
      meta: { status_update_id: update.id, health: update.health, week_of: update.week_of },
    });
    await notifySafely("createStatusUpdateAction", () =>
      notifyWatchers({
        entity: { type: "project", id: update.project_id },
        type: "status_update",
        actor_id: user.id,
        project_id: update.project_id,
        title: `${user.name} posted an update on ${project.name}`,
        body: `${healthLabel}: ${truncate(update.headline, 200)}`,
        url: projectNotificationUrl(update.project_id, { tab: "updates" }),
      }),
    );
    revalidate();
    return { ok: true, data: update };
  } catch (error) {
    return failure(error, "Could not post the update. Please try again.");
  }
}

/** Edits an update. Author or admin; logs status_update_edited. */
export async function updateStatusUpdateAction(id: string, input: UpdateStatusUpdateInput): Promise<ActionResult<StatusUpdate>> {
  const user = await requireUser();
  const idParsed = statusUpdateIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: STATUS_UPDATE_ERRORS.notFound };
  const parsed = updateStatusUpdateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));

  try {
    const existing = await getStatusUpdate(idParsed.data);
    if (!existing) return { ok: false, error: STATUS_UPDATE_ERRORS.notFound };
    if (!canChange(user, existing)) return { ok: false, error: NOT_ALLOWED };
    const updated = await updateStatusUpdate(existing.id, toPatch(parsed.data));
    const healthChanged = updated.health !== existing.health;
    await logActivity({
      project_id: updated.project_id,
      actor_id: user.id,
      type: "status_update_edited",
      message: healthChanged
        ? `edited the status update for ${weekLabel(updated)}: ${RAG_CONFIG[existing.health].label} to ${RAG_CONFIG[updated.health].label}`
        : `edited the status update for ${weekLabel(updated)}`,
      meta: { status_update_id: updated.id, health: updated.health, week_of: updated.week_of },
    });
    revalidate();
    return { ok: true, data: updated };
  } catch (error) {
    return failure(error, "Could not save the update. Please try again.");
  }
}

/** Deletes an update. Author or admin; logs status_update_deleted. */
export async function deleteStatusUpdateAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = statusUpdateIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: STATUS_UPDATE_ERRORS.notFound };

  try {
    const existing = await getStatusUpdate(idParsed.data);
    if (!existing) return { ok: false, error: STATUS_UPDATE_ERRORS.notFound };
    if (!canChange(user, existing)) return { ok: false, error: NOT_ALLOWED };
    const { project_id } = await deleteStatusUpdate(existing.id);
    await logActivity({
      project_id,
      actor_id: user.id,
      type: "status_update_deleted",
      message: `deleted the status update for ${weekLabel(existing)}`,
      meta: { status_update_id: existing.id, week_of: existing.week_of },
    });
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not delete the update. Please try again.");
  }
}
