import { db, newId, nowISO, transaction } from "@/lib/db";
import type { Comment } from "@/lib/types";

interface CommentRow {
  id: string;
  project_id: string;
  task_id: string | null;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author_name: string;
  author_email: string;
  author_color: string;
  author_job_title: string | null;
}

const AUTHOR_COLUMNS = `u.name AS author_name, u.email AS author_email, u.color AS author_color,
         u.job_title AS author_job_title`;

const COMMENT_SELECT = `
  SELECT c.id, c.project_id, c.task_id, c.user_id, c.body, c.created_at, c.updated_at,
         ${AUTHOR_COLUMNS}
    FROM comments c
    JOIN users u ON u.id = c.user_id`;

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    project_id: row.project_id,
    task_id: row.task_id,
    user_id: row.user_id,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
    author: {
      id: row.user_id,
      name: row.author_name,
      email: row.author_email,
      color: row.author_color,
      job_title: row.author_job_title,
    },
  };
}

/**
 * Project-level comments (task comments excluded), oldest first (id breaks
 * same-millisecond ties deterministically).
 */
export async function listComments(projectId: string): Promise<Comment[]> {
  const rows = await db.query<CommentRow>(
    `${COMMENT_SELECT} WHERE c.project_id = $1 AND c.task_id IS NULL ORDER BY c.created_at ASC, c.id ASC`,
    [projectId],
  );
  return rows.map(toComment);
}

export async function getComment(id: string): Promise<Comment | null> {
  const row = await db.queryOne<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`, [id]);
  return row ? toComment(row) : null;
}

/** Comments on one task, oldest first. */
export async function listTaskComments(taskId: string): Promise<Comment[]> {
  const rows = await db.query<CommentRow>(
    `${COMMENT_SELECT} WHERE c.task_id = $1 ORDER BY c.created_at ASC, c.id ASC`,
    [taskId],
  );
  return rows.map(toComment);
}

/**
 * Creates a comment. The optional `taskId` makes it a task comment (then
 * `projectId` must be the task's project); v1 callers pass three arguments.
 */
export async function createComment(
  projectId: string,
  userId: string,
  body: string,
  taskId: string | null = null,
): Promise<Comment> {
  const now = nowISO();
  // Insert and read back with the author in a single round trip.
  const row = await db.queryOne<CommentRow>(
    `WITH c AS (
       INSERT INTO comments (id, project_id, user_id, body, created_at, updated_at, task_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, project_id, task_id, user_id, body, created_at, updated_at
     )
     SELECT c.id, c.project_id, c.task_id, c.user_id, c.body, c.created_at, c.updated_at,
            ${AUTHOR_COLUMNS}
       FROM c
       JOIN users u ON u.id = c.user_id`,
    [newId(), projectId, userId, body, now, now, taskId],
  );
  if (!row) throw new Error("Failed to create comment");
  return toComment(row);
}

/**
 * Deletes a comment (its attachments cascade). Returns the URLs of the file
 * attachments removed with it so the caller can delete the blobs after commit.
 */
export async function deleteComment(id: string): Promise<{ blob_urls: string[] }> {
  return transaction(async (tx) => {
    const files = await tx.query<{ url: string }>(
      "SELECT url FROM attachments WHERE kind = 'file' AND comment_id = $1",
      [id],
    );
    await tx.execute("DELETE FROM comments WHERE id = $1", [id]);
    return { blob_urls: files.map((file) => file.url) };
  });
}
