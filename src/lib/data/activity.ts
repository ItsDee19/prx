import { db, newId } from "@/lib/db";
import type { Activity, ActivityType } from "@/lib/types";

interface ActivityRow {
  id: string;
  project_id: string | null;
  actor_id: string | null;
  type: ActivityType;
  message: string;
  /** JSONB column: node-postgres returns it already parsed. */
  meta: unknown;
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

/**
 * Postgres has no implicit insertion order (SQLite's rowid used to break
 * same-millisecond ties). Entries logged by this server instance get strictly
 * increasing timestamps instead, so several entries written by one action
 * (e.g. a status change followed by a progress update) keep their order.
 */
let lastLoggedAtMs = 0;

function nextActivityTimestamp(): string {
  const now = Date.now();
  lastLoggedAtMs = now > lastLoggedAtMs ? now : lastLoggedAtMs + 1;
  return new Date(lastLoggedAtMs).toISOString();
}

function parseMeta(raw: unknown): Record<string, unknown> {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      // Fall through: a corrupt meta value should not break the activity feed.
      return {};
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
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

export async function logActivity(input: {
  project_id: string | null;
  actor_id: string | null;
  type: ActivityType;
  message: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await db.execute(
    `INSERT INTO activity (id, project_id, actor_id, type, message, meta, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      newId(),
      input.project_id,
      input.actor_id,
      input.type,
      input.message,
      JSON.stringify(input.meta ?? {}),
      nextActivityTimestamp(),
    ],
  );
}

/** Activity logged directly on a project (not its descendants), newest first. */
export async function listProjectActivity(projectId: string, limit = 30): Promise<Activity[]> {
  const rows = await db.query<ActivityRow>(
    `${ACTIVITY_SELECT} WHERE a.project_id = $1 ORDER BY a.created_at DESC, a.id DESC LIMIT $2`,
    [projectId, Math.max(1, Math.floor(limit))],
  );
  return rows.map(toActivity);
}

/** Newest activity across every project (and project-less entries such as deletions). */
export async function listRecentActivity(limit = 12): Promise<Activity[]> {
  const rows = await db.query<ActivityRow>(
    `${ACTIVITY_SELECT} ORDER BY a.created_at DESC, a.id DESC LIMIT $1`,
    [Math.max(1, Math.floor(limit))],
  );
  return rows.map(toActivity);
}
