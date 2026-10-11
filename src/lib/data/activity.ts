import { getDb, newId, nowISO } from "@/lib/db";
import type { Activity, ActivityType } from "@/lib/types";

interface ActivityRow {
  id: string;
  project_id: string | null;
  actor_id: string | null;
  type: ActivityType;
  message: string;
  /** JSON string; parsed into `Activity.meta`. */
  meta: string;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_color: string | null;
  actor_job_title: string | null;
  project_name: string | null;
}

const ACTIVITY_SELECT = `
  SELECT a.id, a.project_id, a.actor_id, a.type, a.message, a.meta, a.created_at,
         u.name AS actor_name, u.email AS actor_email, u.color AS actor_color,
         u.job_title AS actor_job_title,
         p.name AS project_name
    FROM activity a
    LEFT JOIN users u ON u.id = a.actor_id
    LEFT JOIN projects p ON p.id = a.project_id`;

function parseMeta(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through: a corrupt meta column should not break the activity feed.
  }
  return {};
}

function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    project_id: row.project_id,
    actor_id: row.actor_id,
    type: row.type,
    message: row.message,
    meta: parseMeta(row.meta),
    created_at: row.created_at,
    actor:
      row.actor_id && row.actor_name !== null
        ? {
            id: row.actor_id,
            name: row.actor_name,
            email: row.actor_email ?? "",
            color: row.actor_color ?? "#64748b",
            job_title: row.actor_job_title,
          }
        : null,
    project_name: row.project_name,
  };
}

export function logActivity(input: {
  project_id: string | null;
  actor_id: string | null;
  type: ActivityType;
  message: string;
  meta?: Record<string, unknown>;
}): void {
  getDb()
    .prepare(
      `INSERT INTO activity (id, project_id, actor_id, type, message, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      input.project_id,
      input.actor_id,
      input.type,
      input.message,
      JSON.stringify(input.meta ?? {}),
      nowISO(),
    );
}

/** Activity logged directly on a project (not its descendants), newest first. */
export function listProjectActivity(projectId: string, limit = 30): Activity[] {
  return getDb()
    .prepare<[string, number], ActivityRow>(
      `${ACTIVITY_SELECT} WHERE a.project_id = ? ORDER BY a.created_at DESC, a.rowid DESC LIMIT ?`,
    )
    .all(projectId, Math.max(1, Math.floor(limit)))
    .map(toActivity);
}

/** Newest activity across every project (and project-less entries such as deletions). */
export function listRecentActivity(limit = 12): Activity[] {
  return getDb()
    .prepare<[number], ActivityRow>(
      `${ACTIVITY_SELECT} ORDER BY a.created_at DESC, a.rowid DESC LIMIT ?`,
    )
    .all(Math.max(1, Math.floor(limit)))
    .map(toActivity);
}
