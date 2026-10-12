import { db, newId, nowISO, type Queryable, type SqlParam } from "@/lib/db";
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  ATTACHMENT_PATH_PREFIX,
  BLOB_HOST_SUFFIX,
  LINK_TYPE_ORDER,
  MAX_UPLOAD_BYTES,
} from "@/lib/constants";
import {
  LINK_TYPES,
  type Attachment,
  type AttachmentFilters,
  type AttachmentKind,
  type CreateFileAttachmentInput,
  type CreateLinkAttachmentInput,
  type LinkType,
} from "@/lib/types";
import { detectLinkType, isHttpUrl, taskKey } from "@/lib/utils";


/**
 * Attachments (SPEC.md sections 16, 17.5 and 23.7): links always, files only
 * when Vercel Blob is configured (BLOB_READ_WRITE_TOKEN). Links accept http(s)
 * only; files must live in this workspace's Blob store under
 * `attachments/<project_id>/`. No `next/*` imports (plain Node scripts can import this).
 */

/** Longest stored attachment name (longer names are rejected; schemas mirror it). */
export const ATTACHMENT_NAME_MAX = 200;
/** Longest stored URL. */
export const ATTACHMENT_URL_MAX = 2048;

/** Vercel Blob uploads are configured. Server only: pass the value to the UI as a prop. */
export function isBlobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

interface AttachmentRow {
  id: string;
  project_id: string;
  task_id: string | null;
  comment_id: string | null;
  kind: AttachmentKind;
  name: string;
  url: string;
  link_type: LinkType | null;
  pinned: boolean;
  mime_type: string | null;
  size_bytes: number | null;
  blob_pathname: string | null;
  uploaded_by: string | null;
  created_at: string;
  uploader_name: string | null;
  uploader_email: string | null;
  uploader_color: string | null;
  uploader_job_title: string | null;
}

const ATTACHMENT_SELECT = `
  SELECT a.id, a.project_id, a.task_id, a.comment_id, a.kind, a.name, a.url, a.link_type, a.pinned,
         a.mime_type, a.size_bytes, a.blob_pathname, a.uploaded_by, a.created_at,
         u.name AS uploader_name, u.email AS uploader_email, u.color AS uploader_color,
         u.job_title AS uploader_job_title
    FROM attachments a
    LEFT JOIN users u ON u.id = a.uploaded_by`;

/** Link types in display order (LINK_TYPE_ORDER; constants, never user input). */
const LINK_TYPE_RANK_SQL = `CASE a.link_type ${LINK_TYPE_ORDER.map(
  (type, index) => `WHEN '${type}' THEN ${index}`,
).join(" ")} ELSE ${LINK_TYPE_ORDER.length} END`;

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    project_id: row.project_id,
    task_id: row.task_id,
    comment_id: row.comment_id,
    kind: row.kind,
    name: row.name,
    url: row.url,
    link_type: row.link_type,
    pinned: row.pinned,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    blob_pathname: row.blob_pathname,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at,
    uploader:
      row.uploaded_by && row.uploader_name !== null
        ? {
            id: row.uploaded_by,
            name: row.uploader_name,
            email: row.uploader_email ?? "",
            color: row.uploader_color ?? "#64748b",
            job_title: row.uploader_job_title,
          }
        : null,
  };
}

function isLinkType(value: unknown): value is LinkType {
  return typeof value === "string" && (LINK_TYPES as readonly string[]).includes(value);
}

function cleanName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function checkName(name: string): string {
  const cleaned = cleanName(name);
  if (!cleaned) throw new Error("Give the attachment a name.");
  if (cleaned.length > ATTACHMENT_NAME_MAX) {
    throw new Error(`Attachment names must be ${ATTACHMENT_NAME_MAX} characters or fewer.`);
  }
  return cleaned;
}

/** "github.com" for "https://www.github.com/org/repo" (the default link name). */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

/**
 * Checks that the project exists and that the optional task and comment belong
 * to it (and the comment to the task, when both are given). Throws a
 * user-facing Error otherwise.
 */
async function checkTarget(
  projectId: string,
  taskId: string | null,
  commentId: string | null,
  q: Queryable,
): Promise<void> {
  const row = await q.queryOne<{ project: boolean; task_project: string | null; comment_project: string | null; comment_task: string | null }>(
    `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1) AS project,
            (SELECT project_id FROM tasks WHERE id = $2) AS task_project,
            (SELECT project_id FROM comments WHERE id = $3) AS comment_project,
            (SELECT task_id FROM comments WHERE id = $3) AS comment_task`,
    [projectId, taskId ?? "", commentId ?? ""],
  );
  if (!row?.project) throw new Error("This project no longer exists.");
  if (taskId && row.task_project !== projectId) throw new Error("This task no longer exists.");
  if (commentId) {
    if (row.comment_project !== projectId) throw new Error("This comment no longer exists.");
    if (taskId && row.comment_task !== taskId) throw new Error("This comment belongs to another task.");
  }
}

/* ------------------------------- Reads ------------------------------- */

/**
 * Attachments of a project, newest first. `taskId: null` = project-level only
 * (including project comment attachments); a string = that task's; omitted =
 * everything in the project.
 */
export async function listAttachments(filters: AttachmentFilters, q: Queryable = db): Promise<Attachment[]> {
  const where: string[] = ["a.project_id = $1"];
  const params: SqlParam[] = [filters.projectId];
  if (filters.taskId === null) where.push("a.task_id IS NULL");
  else if (typeof filters.taskId === "string") {
    params.push(filters.taskId);
    where.push(`a.task_id = $${params.length}`);
  }
  if (filters.kind) {
    params.push(filters.kind);
    where.push(`a.kind = $${params.length}`);
  }
  if (typeof filters.pinned === "boolean") {
    params.push(filters.pinned);
    where.push(`a.pinned = $${params.length}`);
  }
  const rows = await q.query<AttachmentRow>(
    `${ATTACHMENT_SELECT} WHERE ${where.join(" AND ")} ORDER BY a.created_at DESC, a.id DESC`,
    params,
  );
  return rows.map(toAttachment);
}

/** Pinned project-level links (the overview "Key links"), by LINK_TYPE_ORDER then oldest first. */
export async function listKeyLinks(projectId: string): Promise<Attachment[]> {
  const rows = await db.query<AttachmentRow>(
    `${ATTACHMENT_SELECT}
      WHERE a.project_id = $1 AND a.task_id IS NULL AND a.kind = 'link' AND a.pinned
      ORDER BY ${LINK_TYPE_RANK_SQL} ASC, a.created_at ASC, a.id ASC`,
    [projectId],
  );
  return rows.map(toAttachment);
}

export async function getAttachment(id: string, q: Queryable = db): Promise<Attachment | null> {
  const row = await q.queryOne<AttachmentRow>(`${ATTACHMENT_SELECT} WHERE a.id = $1`, [id]);
  return row ? toAttachment(row) : null;
}

/** Task key and title per task id, for labelling task attachments in the Files tab. */
export async function listAttachmentTaskRefs(
  taskIds: string[],
): Promise<Record<string, { key: string; title: string }>> {
  const ids = Array.from(new Set(taskIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const rows = await db.query<{ id: string; number: number; title: string }>(
    "SELECT id, number, title FROM tasks WHERE id = ANY($1::text[])",
    [ids],
  );
  const refs: Record<string, { key: string; title: string }> = {};
  for (const row of rows) refs[row.id] = { key: taskKey(row.number), title: row.title };
  return refs;
}

/* ------------------------------- Writes ------------------------------ */

/**
 * Adds a link. http(s) only (isHttpUrl); `link_type` defaults to
 * detectLinkType(url) and `name` to the host. Only project-level links can be
 * pinned (Key links), so `pinned` is ignored for task attachments.
 */
export async function createLinkAttachment(input: CreateLinkAttachmentInput, userId: string): Promise<Attachment> {
  const url = input.url.trim();
  if (!isHttpUrl(url)) throw new Error("Links must start with http:// or https://.");
  if (url.length > ATTACHMENT_URL_MAX) throw new Error(`Links must be ${ATTACHMENT_URL_MAX} characters or fewer.`);
  const taskId = input.task_id || null;
  const commentId = input.comment_id || null;
  const name = checkName(input.name && cleanName(input.name) ? input.name : linkHost(url));
  const linkType: LinkType = isLinkType(input.link_type) ? input.link_type : detectLinkType(url);
  const pinned = Boolean(input.pinned) && taskId === null;

  await checkTarget(input.project_id, taskId, commentId, db);
  const id = newId();
  await db.execute(
    `INSERT INTO attachments (id, project_id, task_id, comment_id, kind, name, url, link_type, pinned,
                              mime_type, size_bytes, blob_pathname, uploaded_by, created_at)
     VALUES ($1, $2, $3, $4, 'link', $5, $6, $7, $8, NULL, NULL, NULL, $9, $10)`,
    [id, input.project_id, taskId, commentId, name, url, linkType, pinned, userId, nowISO()],
  );
  const created = await getAttachment(id);
  if (!created) throw new Error("Could not save the link.");
  return created;
}

/** true when `url` is an https URL on a Vercel Blob host (`*.blob.vercel-storage.com`). */
export function isBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.toLowerCase().endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/** The blob pathname a Blob URL points at ("attachments/<project>/file.pdf"). */
function blobPathnameOf(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

/**
 * Records an uploaded file. The URL must be on a Vercel Blob host and point at
 * `blob_pathname`, which must start with `attachments/<project_id>/`; the size
 * is capped at MAX_UPLOAD_BYTES and the type must be in
 * ALLOWED_UPLOAD_CONTENT_TYPES. Throws a user-facing Error otherwise.
 */
export async function createFileAttachment(input: CreateFileAttachmentInput, userId: string): Promise<Attachment> {
  const url = input.url.trim();
  const pathname = input.blob_pathname.trim();
  if (!isBlobUrl(url) || url.length > ATTACHMENT_URL_MAX) throw new Error("That file is not in this workspace's storage.");
  if (!pathname.startsWith(`${ATTACHMENT_PATH_PREFIX}${input.project_id}/`) || blobPathnameOf(url) !== pathname) {
    throw new Error("That file belongs to another project.");
  }
  if (!Number.isInteger(input.size_bytes) || input.size_bytes < 0) throw new Error("The file size is invalid.");
  if (input.size_bytes > MAX_UPLOAD_BYTES) {
    throw new Error(`Files can be at most ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`);
  }
  const mime = input.mime_type.trim().toLowerCase().split(";")[0]?.trim() ?? "";
  if (!(ALLOWED_UPLOAD_CONTENT_TYPES as readonly string[]).includes(mime)) {
    throw new Error("This file type is not allowed.");
  }
  const taskId = input.task_id || null;
  const commentId = input.comment_id || null;
  const name = checkName(input.name);

  await checkTarget(input.project_id, taskId, commentId, db);
  const id = newId();
  await db.execute(
    `INSERT INTO attachments (id, project_id, task_id, comment_id, kind, name, url, link_type, pinned,
                              mime_type, size_bytes, blob_pathname, uploaded_by, created_at)
     VALUES ($1, $2, $3, $4, 'file', $5, $6, NULL, FALSE, $7, $8, $9, $10, $11)`,
    [id, input.project_id, taskId, commentId, name, url, mime, input.size_bytes, pathname, userId, nowISO()],
  );
  const created = await getAttachment(id);
  if (!created) throw new Error("Could not save the file.");
  return created;
}

/**
 * Renames, retypes (links only) or pins/unpins (project-level links only) an
 * attachment. Only provided keys change. Throws a user-facing Error for a
 * missing row or a disallowed change.
 */
export async function updateAttachment(
  id: string,
  patch: { name?: string; link_type?: LinkType | null; pinned?: boolean },
): Promise<Attachment> {
  const current = await getAttachment(id);
  if (!current) throw new Error("This attachment no longer exists.");

  const sets: string[] = [];
  const params: SqlParam[] = [];
  const set = (column: string, value: SqlParam) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (patch.name !== undefined) set("name", checkName(patch.name));
  if (patch.link_type !== undefined) {
    if (current.kind !== "link") throw new Error("Only links have a type.");
    if (patch.link_type !== null && !isLinkType(patch.link_type)) throw new Error("Choose a valid link type.");
    set("link_type", patch.link_type ?? detectLinkType(current.url));
  }
  if (patch.pinned !== undefined) {
    if (patch.pinned && (current.kind !== "link" || current.task_id !== null)) {
      throw new Error("Only project links can be pinned as key links.");
    }
    set("pinned", patch.pinned);
  }
  if (sets.length === 0) return current;

  params.push(id);
  await db.execute(`UPDATE attachments SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
  const updated = await getAttachment(id);
  if (!updated) throw new Error("This attachment no longer exists.");
  return updated;
}

/** Deletes an attachment and returns the deleted row (null when it was already gone) so the caller can delete the blob. */
export async function deleteAttachment(id: string): Promise<Attachment | null> {
  const current = await getAttachment(id);
  if (!current) return null;
  const removed = await db.execute("DELETE FROM attachments WHERE id = $1", [id]);
  return removed > 0 ? current : null;
}

/**
 * Deletes Vercel Blob objects (after a delete or a cascade that returned
 * `blob_urls`). A no-op without BLOB_READ_WRITE_TOKEN or an empty list; URLs
 * that are not Blob URLs are skipped. Failures are logged, never thrown.
 */
export async function deleteBlobs(urls: string[]): Promise<void> {
  const list = Array.from(new Set(urls.filter((url) => typeof url === "string" && isBlobUrl(url))));
  if (list.length === 0 || !isBlobEnabled()) return;
  try {
    const { del } = await import("@vercel/blob");
    await del(list);
  } catch (error) {
    console.error("deleteBlobs failed", { count: list.length, error });
  }
}

/**
 * What the attachment UI and permission checks need about a project: its
 * owner (delete = uploader, admin or owner) and whether its client is
 * confidential (no third-party favicon requests). null when the project is gone.
 */
export async function getAttachmentProjectContext(
  projectId: string,
): Promise<{ owner_id: string | null; confidential: boolean } | null> {
  return db.queryOne<{ owner_id: string | null; confidential: boolean }>(
    `SELECT p.owner_id, COALESCE(cl.confidential, FALSE) AS confidential
       FROM projects p
       LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE p.id = $1`,
    [projectId],
  );
}
