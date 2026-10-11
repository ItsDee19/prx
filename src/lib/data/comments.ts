import { getDb, newId, nowISO } from "@/lib/db";
import type { Comment } from "@/lib/types";

interface CommentRow {
  id: string;
  project_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author_name: string;
  author_email: string;
  author_color: string;
  author_job_title: string | null;
}

const COMMENT_SELECT = `
  SELECT c.id, c.project_id, c.user_id, c.body, c.created_at, c.updated_at,
         u.name AS author_name, u.email AS author_email, u.color AS author_color,
         u.job_title AS author_job_title
    FROM comments c
    JOIN users u ON u.id = c.user_id`;

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    project_id: row.project_id,
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

/** Comments on a project, oldest first. */
export function listComments(projectId: string): Comment[] {
  return getDb()
    .prepare<[string], CommentRow>(
      `${COMMENT_SELECT} WHERE c.project_id = ? ORDER BY c.created_at ASC, c.rowid ASC`,
    )
    .all(projectId)
    .map(toComment);
}

export function getComment(id: string): Comment | null {
  const row = getDb().prepare<[string], CommentRow>(`${COMMENT_SELECT} WHERE c.id = ?`).get(id);
  return row ? toComment(row) : null;
}

export function createComment(projectId: string, userId: string, body: string): Comment {
  const id = newId();
  const now = nowISO();
  getDb()
    .prepare(
      `INSERT INTO comments (id, project_id, user_id, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, projectId, userId, body, now, now);
  const created = getComment(id);
  if (!created) throw new Error("Failed to create comment");
  return created;
}

export function deleteComment(id: string): void {
  getDb().prepare("DELETE FROM comments WHERE id = ?").run(id);
}
