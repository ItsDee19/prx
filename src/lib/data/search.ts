import { db } from "@/lib/db";
import { LABEL_GROUP_CONFIG, OPEN_STATUSES, OPEN_TASK_STATUSES, SEARCH_QUERY_MAX, SEARCH_RESULTS_PER_GROUP } from "@/lib/constants";
import { emptySearchResults, type GlobalSearchResults, type LabelSearchHit } from "@/lib/schemas/search";
import type { LabelGroup, ProjectStatus, SearchHit, TaskStatus } from "@/lib/types";
import { likeContains, likePrefix, mentionsToPlainText, parseTaskKey, pluralize, taskKey } from "@/lib/utils";

/**
 * Global search for the command palette (SPEC.md section 17.5).
 *
 * - Every pattern goes through `likePrefix` / `likeContains`, so `%`, `_` and
 *   `\` in the query are literal (ESCAPE '\', the Postgres default for LIKE).
 * - Ranking inside each group: an exact task key first, then prefix matches
 *   (`lower(col) LIKE 'q%'`, served by the text_pattern_ops indexes), then
 *   word-start matches, then substring matches, then matches through a
 *   related name (client, label). Ties prefer open work, the searcher's own
 *   work, then the most recently updated.
 * - Never selects commercial columns (contract value, hourly rate, phase
 *   prices, invoice status, cost rates), so results are safe for members.
 */

interface ProjectHitRow {
  id: string;
  name: string;
  color: string | null;
  parent_name: string | null;
  client_name: string | null;
  client_code: string | null;
  client_color: string | null;
}

interface TaskHitRow {
  id: string;
  number: number;
  title: string;
  project_name: string;
  project_color: string | null;
  client_code: string | null;
  client_color: string | null;
}

interface ClientHitRow {
  id: string;
  name: string;
  code: string;
  industry: string;
  color: string;
  archived_at: string | null;
}

interface PersonHitRow {
  id: string;
  name: string;
  email: string;
  color: string;
}

interface LabelHitRow {
  id: string;
  name: string;
  color: string;
  label_group: LabelGroup;
  project_count: number;
  task_count: number;
}

interface CommentHitRow {
  id: string;
  body: string;
  project_id: string;
  project_name: string;
  task_id: string | null;
  task_number: number | null;
  task_title: string | null;
  author_name: string | null;
  author_color: string | null;
  client_code: string | null;
}

/** Comment rows fetched per hit slot: mention tokens can match the SQL pattern but not the visible text. */
const COMMENT_OVERFETCH = 4;
const SNIPPET_BEFORE = 40;
const SNIPPET_LENGTH = 120;

/** Normalises the raw query: trimmed, inner whitespace collapsed, capped at SEARCH_QUERY_MAX. */
export function normalizeSearchQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, SEARCH_QUERY_MAX).trim();
}

/** Task number for "PRX-12", "prx 12", "#12" or a bare "12"; null otherwise. */
function exactTaskNumber(query: string): number | null {
  const fromKey = parseTaskKey(query);
  if (fromKey !== null) return fromKey;
  if (!/^\d{1,9}$/.test(query)) return null;
  const value = Number(query);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Visible comment text around the first case-insensitive match, or null when only hidden markup matched. */
export function commentSnippet(body: string, query: string): string | null {
  const text = mentionsToPlainText(body).replace(/\s+/g, " ").trim();
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return null;
  const start = Math.max(0, index - SNIPPET_BEFORE);
  const end = Math.min(text.length, start + SNIPPET_LENGTH);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

async function searchProjects(prefix: string, contains: string, userId: string, limit: number): Promise<SearchHit[]> {
  const rows = await db.query<ProjectHitRow>(
    `SELECT p.id, p.name, p.color, parent.name AS parent_name,
            c.name AS client_name, c.code AS client_code, c.color AS client_color
       FROM projects p
       LEFT JOIN projects parent ON parent.id = p.parent_id
       LEFT JOIN clients c ON c.id = p.client_id
      WHERE lower(p.name) LIKE $1
         OR p.name ILIKE $2 ESCAPE '\\'
         OR lower(c.code) LIKE $1
         OR c.name ILIKE $2 ESCAPE '\\'
         OR EXISTS (
              SELECT 1 FROM project_labels pl JOIN labels l ON l.id = pl.label_id
               WHERE pl.project_id = p.id AND l.name ILIKE $2 ESCAPE '\\')
      ORDER BY
        CASE
          WHEN lower(p.name) LIKE $1 THEN 0
          WHEN lower(p.name) LIKE '% ' || $1 THEN 1
          WHEN p.name ILIKE $2 ESCAPE '\\' THEN 2
          WHEN lower(c.code) LIKE $1 OR lower(c.name) LIKE $1 THEN 3
          WHEN c.name ILIKE $2 ESCAPE '\\' THEN 4
          ELSE 5
        END,
        (p.status = ANY($4::text[])) DESC,
        (p.owner_id = $3 OR p.created_by = $3
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $3)) IS TRUE DESC,
        p.updated_at DESC
      LIMIT $5`,
    [prefix, contains, userId, OPEN_STATUSES satisfies ProjectStatus[], limit],
  );
  return rows.map((row) => ({
    kind: "project",
    id: row.id,
    title: row.name,
    subtitle: [row.client_name, row.parent_name ? `Sub-project of ${row.parent_name}` : null].filter(Boolean).join(" · ") || null,
    href: `/projects/${row.id}`,
    badge: row.client_code,
    color: row.color ?? row.client_color,
  }));
}

async function searchTasks(
  prefix: string,
  contains: string,
  exactNumber: number | null,
  userId: string,
  limit: number,
): Promise<SearchHit[]> {
  const rows = await db.query<TaskHitRow>(
    `SELECT t.id, t.number, t.title, p.name AS project_name, p.color AS project_color,
            c.code AS client_code, c.color AS client_color
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN clients c ON c.id = p.client_id
      WHERE t.number = $4::int
         OR lower(t.title) LIKE $1
         OR t.title ILIKE $2 ESCAPE '\\'
         OR EXISTS (
              SELECT 1 FROM task_labels tl JOIN labels l ON l.id = tl.label_id
               WHERE tl.task_id = t.id AND l.name ILIKE $2 ESCAPE '\\')
      ORDER BY
        CASE
          WHEN t.number = $4::int THEN 0
          WHEN lower(t.title) LIKE $1 THEN 1
          WHEN lower(t.title) LIKE '% ' || $1 THEN 2
          WHEN t.title ILIKE $2 ESCAPE '\\' THEN 3
          ELSE 4
        END,
        (t.status = ANY($5::text[])) DESC,
        (t.assignee_id = $3) IS TRUE DESC,
        t.updated_at DESC
      LIMIT $6`,
    [prefix, contains, userId, exactNumber, OPEN_TASK_STATUSES satisfies TaskStatus[], limit],
  );
  return rows.map((row) => {
    const key = taskKey(row.number);
    return {
      kind: "task",
      id: row.id,
      title: row.title,
      subtitle: row.project_name,
      href: `/tasks/${key}`,
      badge: key,
      color: row.project_color ?? row.client_color,
    };
  });
}

async function searchClients(prefix: string, contains: string, limit: number): Promise<SearchHit[]> {
  const rows = await db.query<ClientHitRow>(
    `SELECT id, name, code, industry, color, archived_at
       FROM clients
      WHERE lower(name) LIKE $1
         OR lower(code) LIKE $1
         OR name ILIKE $2 ESCAPE '\\'
         OR industry ILIKE $2 ESCAPE '\\'
      ORDER BY
        CASE
          WHEN lower(name) LIKE $1 THEN 0
          WHEN lower(code) LIKE $1 THEN 1
          WHEN lower(name) LIKE '% ' || $1 THEN 2
          WHEN name ILIKE $2 ESCAPE '\\' THEN 3
          ELSE 4
        END,
        (archived_at IS NULL) DESC,
        lower(name)
      LIMIT $3`,
    [prefix, contains, limit],
  );
  return rows.map((row) => ({
    kind: "client",
    id: row.id,
    title: row.name,
    subtitle: [row.industry || null, row.archived_at ? "Archived" : null].filter(Boolean).join(" · ") || null,
    href: `/clients/${row.id}`,
    badge: row.code,
    color: row.color,
  }));
}

async function searchPeople(prefix: string, contains: string, limit: number): Promise<SearchHit[]> {
  const rows = await db.query<PersonHitRow>(
    `SELECT id, name, email, color
       FROM users
      WHERE is_active
        AND (name ILIKE $2 ESCAPE '\\' OR email ILIKE $2 ESCAPE '\\')
      ORDER BY
        CASE
          WHEN lower(name) LIKE $1 THEN 0
          WHEN lower(name) LIKE '% ' || $1 THEN 1
          WHEN lower(email) LIKE $1 THEN 2
          WHEN name ILIKE $2 ESCAPE '\\' THEN 3
          ELSE 4
        END,
        lower(name)
      LIMIT $3`,
    [prefix, contains, limit],
  );
  return rows.map((row) => ({
    kind: "person",
    id: row.id,
    title: row.name,
    subtitle: row.email,
    // People have no profile page; their open tasks are the useful destination.
    href: `/tasks?assignee=${encodeURIComponent(row.id)}`,
    badge: null,
    color: row.color,
  }));
}

async function searchLabels(prefix: string, contains: string, limit: number): Promise<LabelSearchHit[]> {
  const rows = await db.query<LabelHitRow>(
    `SELECT l.id, l.name, l.color, l.label_group,
            (SELECT COUNT(*)::int FROM project_labels pl WHERE pl.label_id = l.id) AS project_count,
            (SELECT COUNT(*)::int FROM task_labels tl WHERE tl.label_id = l.id) AS task_count
       FROM labels l
      WHERE l.name ILIKE $2 ESCAPE '\\'
      ORDER BY
        CASE
          WHEN lower(l.name) LIKE $1 THEN 0
          WHEN lower(l.name) LIKE '% ' || $1 THEN 1
          ELSE 2
        END,
        project_count DESC,
        lower(l.name)
      LIMIT $3`,
    [prefix, contains, limit],
  );
  return rows.map((row) => {
    const usage = [
      row.project_count > 0 ? pluralize(row.project_count, "project") : null,
      row.task_count > 0 ? pluralize(row.task_count, "task") : null,
    ].filter(Boolean);
    return {
      kind: "label",
      id: row.id,
      title: row.name,
      subtitle: [LABEL_GROUP_CONFIG[row.label_group]?.label ?? null, usage.length > 0 ? usage.join(", ") : "Not used yet"]
        .filter(Boolean)
        .join(" · "),
      href: `/projects?label=${encodeURIComponent(row.id)}`,
      badge: null,
      color: row.color,
    };
  });
}

async function searchComments(query: string, contains: string, limit: number): Promise<SearchHit[]> {
  const rows = await db.query<CommentHitRow>(
    `SELECT cm.id, cm.body, cm.project_id, p.name AS project_name, cm.task_id,
            t.number AS task_number, t.title AS task_title,
            u.name AS author_name, u.color AS author_color, c.code AS client_code
       FROM comments cm
       JOIN projects p ON p.id = cm.project_id
       LEFT JOIN tasks t ON t.id = cm.task_id
       LEFT JOIN users u ON u.id = cm.user_id
       LEFT JOIN clients c ON c.id = p.client_id
      WHERE cm.body ILIKE $1 ESCAPE '\\'
      ORDER BY cm.created_at DESC, cm.id
      LIMIT $2`,
    [contains, limit * COMMENT_OVERFETCH],
  );
  const hits: SearchHit[] = [];
  for (const row of rows) {
    if (hits.length >= limit) break;
    const snippet = commentSnippet(row.body, query);
    if (snippet === null) continue;
    const key = row.task_number !== null ? taskKey(row.task_number) : null;
    const target = key && row.task_title ? `${key} ${row.task_title}` : row.project_name;
    hits.push({
      kind: "comment",
      id: row.id,
      title: `${row.author_name ?? "Someone"} on ${target}`,
      subtitle: snippet,
      href: key ? `/tasks/${key}#comment-${row.id}` : `/projects/${row.project_id}#comment-${row.id}`,
      badge: key ?? row.client_code,
      color: row.author_color,
    });
  }
  return hits;
}

/**
 * Searches projects, tasks (title or exact key), clients, people (active
 * users by name or email), labels and comments. `userId` is the searcher;
 * their own projects and tasks rank first among equal matches. An empty
 * query (after trimming) returns empty groups without touching the database.
 */
export async function searchAll(query: string, userId: string): Promise<GlobalSearchResults> {
  const q = normalizeSearchQuery(query);
  if (q.length === 0) return emptySearchResults(q);
  const prefix = likePrefix(q);
  const contains = likeContains(q);
  const limit = SEARCH_RESULTS_PER_GROUP;
  const [projects, tasks, clients, people, labels, comments] = await Promise.all([
    searchProjects(prefix, contains, userId, limit),
    searchTasks(prefix, contains, exactTaskNumber(q), userId, limit),
    searchClients(prefix, contains, limit),
    searchPeople(prefix, contains, limit),
    searchLabels(prefix, contains, limit),
    searchComments(q, contains, limit),
  ]);
  return { query: q, projects, tasks, clients, people, comments, labels };
}
