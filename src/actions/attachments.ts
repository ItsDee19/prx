"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { LINK_TYPE_CONFIG } from "@/lib/constants";
import { logActivity } from "@/lib/data/activity";
import {
  createFileAttachment,
  createLinkAttachment,
  deleteAttachment,
  deleteBlobs,
  getAttachment,
  getAttachmentProjectContext,
  isBlobEnabled,
  isBlobUrl,
  listAttachments,
  updateAttachment,
} from "@/lib/data/attachments";
import { getTaskAccess } from "@/lib/data/tasks";
import {
  attachmentFiltersSchema,
  attachmentIdSchema,
  createFileAttachmentSchema,
  createLinkAttachmentSchema,
  updateAttachmentSchema,
} from "@/lib/schemas/attachments";
import type {
  ActionResult,
  Attachment,
  AttachmentFilters,
  CreateFileAttachmentInput,
  CreateLinkAttachmentInput,
  LinkType,
} from "@/lib/types";
import { truncate } from "@/lib/utils";
import { fieldErrorsFromIssues } from "@/lib/validation";

/**
 * Attachment actions (SPEC.md section 18.2). Links are always available; file
 * attachments only when Vercel Blob is configured. The client uploads with
 * `upload()` from `@vercel/blob/client` (token from POST
 * /api/attachments/upload) and then records the file here, because
 * `onUploadCompleted` never fires on localhost.
 */

export interface TaskAttachmentsData {
  attachments: Attachment[];
  /** Admin or project owner: may delete any attachment of the task. */
  canManageAll: boolean;
  /** The project's client is confidential (the UI skips favicon requests). */
  confidential: boolean;
}

const UPLOADS_OFF = "File uploads are not configured for this workspace. Add a link instead.";

function revalidate(): void {
  revalidatePath("/", "layout");
}

function invalid(fieldErrors: Record<string, string>): ActionResult<never> {
  const messages = Object.values(fieldErrors);
  return { ok: false, error: messages.length === 1 ? `${messages[0]}.` : "Please fix the highlighted fields.", fieldErrors };
}

/**
 * Plain `Error`s from the data layer carry user-facing sentences and are passed
 * through; database errors (which have a `code`) and anything else get the
 * friendly fallback.
 */
function failure(error: unknown, fallback: string): ActionResult<never> {
  const userFacing =
    error instanceof Error && error.constructor === Error && !("code" in error) && /[.!?]$/.test(error.message);
  if (!userFacing) console.error(fallback, error);
  return { ok: false, error: userFacing ? (error as Error).message : fallback };
}

/** A short quoted name for activity messages. */
function quoted(name: string): string {
  return `"${truncate(name, 60)}"`;
}

/** Member: adds a link to a project, task or comment; logs `attachment_added`. */
export async function createLinkAttachmentAction(input: CreateLinkAttachmentInput): Promise<ActionResult<Attachment>> {
  const user = await requireUser();
  const parsed = createLinkAttachmentSchema.safeParse(input);
  if (!parsed.success) return invalid(fieldErrorsFromIssues(parsed.error.issues));
  try {
    const attachment = await createLinkAttachment(parsed.data, user.id);
    await logActivity({
      project_id: attachment.project_id,
      actor_id: user.id,
      type: "attachment_added",
      message: attachment.pinned ? `added the key link ${quoted(attachment.name)}` : `added the link ${quoted(attachment.name)}`,
      meta: { attachment_id: attachment.id, kind: "link", link_type: attachment.link_type },
      task_id: attachment.task_id,
    });
    revalidate();
    return { ok: true, data: attachment };
  } catch (error) {
    return failure(error, "Could not add the link. Please try again.");
  }
}

/**
 * Member, only when Blob is enabled: records a file the client uploaded. The
 * blob is looked up in this workspace's store, and its real size, type and
 * pathname are used (never the client's claims); logs `attachment_added`.
 */
export async function createFileAttachmentAction(input: CreateFileAttachmentInput): Promise<ActionResult<Attachment>> {
  const user = await requireUser();
  if (!isBlobEnabled()) return { ok: false, error: UPLOADS_OFF };
  const parsed = createFileAttachmentSchema.safeParse(input);
  if (!parsed.success) return invalid(fieldErrorsFromIssues(parsed.error.issues));

  if (!isBlobUrl(parsed.data.url)) return { ok: false, error: "That file is not in this workspace's storage." };

  let blob: { size: number; contentType: string; pathname: string; url: string };
  try {
    const { head } = await import("@vercel/blob");
    blob = await head(parsed.data.url);
  } catch {
    return { ok: false, error: "We could not find the uploaded file. Please upload it again." };
  }

  try {
    const attachment = await createFileAttachment(
      {
        ...parsed.data,
        url: blob.url,
        blob_pathname: blob.pathname,
        mime_type: blob.contentType,
        size_bytes: blob.size,
      },
      user.id,
    );
    await logActivity({
      project_id: attachment.project_id,
      actor_id: user.id,
      type: "attachment_added",
      message: `uploaded ${quoted(attachment.name)}`,
      meta: { attachment_id: attachment.id, kind: "file", mime_type: attachment.mime_type },
      task_id: attachment.task_id,
    });
    revalidate();
    return { ok: true, data: attachment };
  } catch (error) {
    return failure(error, "Could not save the file. Please try again.");
  }
}

/** Member: rename, change a link's type, or pin/unpin a key link; logs `attachment_updated` when something changed. */
export async function updateAttachmentAction(
  id: string,
  patch: { name?: string; link_type?: LinkType | null; pinned?: boolean },
): Promise<ActionResult<Attachment>> {
  const user = await requireUser();
  const parsedId = attachmentIdSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "This attachment no longer exists." };
  const parsed = updateAttachmentSchema.safeParse(patch);
  if (!parsed.success) return invalid(fieldErrorsFromIssues(parsed.error.issues));
  try {
    const before = await getAttachment(parsedId.data);
    if (!before) return { ok: false, error: "This attachment no longer exists." };
    const after = await updateAttachment(before.id, parsed.data);

    let message: string | null = null;
    if (after.pinned !== before.pinned) {
      message = after.pinned ? `pinned ${quoted(after.name)} as a key link` : `unpinned ${quoted(after.name)}`;
    } else if (after.name !== before.name) {
      message = `renamed ${quoted(before.name)} to ${quoted(after.name)}`;
    } else if (after.link_type !== before.link_type && after.link_type) {
      message = `marked ${quoted(after.name)} as ${LINK_TYPE_CONFIG[after.link_type].label}`;
    }
    if (message) {
      await logActivity({
        project_id: after.project_id,
        actor_id: user.id,
        type: "attachment_updated",
        message,
        meta: { attachment_id: after.id, kind: after.kind },
        task_id: after.task_id,
      });
    }
    revalidate();
    return { ok: true, data: after };
  } catch (error) {
    return failure(error, "Could not save the attachment. Please try again.");
  }
}

/**
 * Uploader, admin or project owner: deletes the attachment (and its blob for
 * files); logs `attachment_removed`.
 */
export async function deleteAttachmentAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = attachmentIdSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "This attachment no longer exists." };
  try {
    const attachment = await getAttachment(parsedId.data);
    if (!attachment) return { ok: false, error: "This attachment no longer exists." };
    if (user.role !== "admin" && attachment.uploaded_by !== user.id) {
      const context = await getAttachmentProjectContext(attachment.project_id);
      if (context?.owner_id !== user.id) {
        return { ok: false, error: "Only the person who added it, the project owner or an admin can delete it." };
      }
    }
    const removed = await deleteAttachment(attachment.id);
    if (!removed) return { ok: false, error: "This attachment no longer exists." };
    if (removed.kind === "file") await deleteBlobs([removed.url]);
    await logActivity({
      project_id: removed.project_id,
      actor_id: user.id,
      type: "attachment_removed",
      message: `removed ${quoted(removed.name)}`,
      meta: { attachment_id: removed.id, kind: removed.kind },
      task_id: removed.task_id,
    });
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not delete the attachment. Please try again.");
  }
}

/** Member: attachments for on-demand lists (task drawer, composers). */
export async function listAttachmentsAction(filters: AttachmentFilters): Promise<ActionResult<Attachment[]>> {
  await requireUser();
  const parsed = attachmentFiltersSchema.safeParse(filters);
  if (!parsed.success) return { ok: false, error: "Could not load the attachments." };
  try {
    return { ok: true, data: await listAttachments(parsed.data) };
  } catch (error) {
    return failure(error, "Could not load the attachments. Please try again.");
  }
}

/**
 * Member: a task's attachments plus whether the viewer may delete every one of
 * them (admin or project owner; otherwise only their own) and whether the
 * project's client is confidential (task drawer).
 */
export async function getTaskAttachmentsAction(
  taskId: string,
): Promise<ActionResult<TaskAttachmentsData>> {
  const user = await requireUser();
  const parsedId = attachmentIdSchema.safeParse(taskId);
  if (!parsedId.success) return { ok: false, error: "This task no longer exists." };
  try {
    const access = await getTaskAccess(parsedId.data);
    if (!access) return { ok: false, error: "This task no longer exists." };
    const [attachments, context] = await Promise.all([
      listAttachments({ projectId: access.project_id, taskId: access.task_id }),
      getAttachmentProjectContext(access.project_id),
    ]);
    return {
      ok: true,
      data: {
        attachments,
        canManageAll: user.role === "admin" || access.project_owner_id === user.id,
        confidential: context?.confidential ?? false,
      },
    };
  } catch (error) {
    return failure(error, "Could not load the attachments. Please try again.");
  }
}
