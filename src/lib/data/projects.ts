import { getDb, newId, nowISO } from "@/lib/db";
import { OPEN_STATUSES, PRIORITY_ORDER } from "@/lib/constants";
import { addDays, clampProgress, todayISODate } from "@/lib/utils";
import {
  PROJECT_STATUSES,
  type CreateProjectInput,
  type Priority,
  type Project,
  type ProjectAncestor,
  type ProjectFilters,
  type ProjectStats,
  type ProjectStatus,
  type ProjectTreeNode,
  type ProjectWithMeta,
  type UpdateProjectInput,
  type UserSummary,
} from "@/lib/types";

/* ------------------------------ Row shapes ------------------------------ */

/** A raw `projects` row maps 1:1 onto `Project`. */
type ProjectRow = Project;

/** `projects` joined with owner + parent, plus correlated count subqueries. */
interface ProjectMetaRow extends ProjectRow {
  owner_name: string | null;
  owner_email: string | null;
  owner_color: string | null;
  owner_job_title: string | null;
  parent_name: string | null;
  subproject_count: number;
  subproject_completed: number;
  comment_count: number;
}

interface MemberRow extends UserSummary {
  project_id: string;
}

/* ------------------------------ SQL pieces ------------------------------ */

const PROJECT_COLUMNS = `p.id, p.parent_id, p.name, p.description, p.status, p.priority, p.owner_id,
  p.start_date, p.due_date, p.progress, p.color, p.position, p.created_by, p.created_at,
  p.updated_at, p.completed_at`;

const META_SELECT = `
  SELECT ${PROJECT_COLUMNS},
         o.name AS owner_name, o.email AS owner_email, o.color AS owner_color,
         o.job_title AS owner_job_title,
         par.name AS parent_name,
         (SELECT COUNT(*) FROM projects c WHERE c.parent_id = p.id) AS subproject_count,
         (SELECT COUNT(*) FROM projects c WHERE c.parent_id = p.id AND c.status = 'completed')
           AS subproject_completed,
         (SELECT COUNT(*) FROM comments cm WHERE cm.project_id = p.id) AS comment_count
    FROM projects p
    LEFT JOIN users o ON o.id = p.owner_id
    LEFT JOIN projects par ON par.id = p.parent_id`;

/** Placeholder list for `IN (...)` clauses. */
const placeholders = (count: number): string => Array.from({ length: count }, () => "?").join(", ");

const OPEN_IN = `p.status IN (${placeholders(OPEN_STATUSES.length)})`;

/** urgent -> 0 ... low -> 3, from the PRIORITY_ORDER constant (not user input). */
const PRIORITY_RANK = `CASE p.priority ${PRIORITY_ORDER.map((value, index) => `WHEN '${value}' THEN ${index}`).join(" ")} ELSE ${PRIORITY_ORDER.length} END`;

type SortKey = NonNullable<ProjectFilters["sort"]>;

const ORDER_BY: Record<SortKey, string> = {
  updated: "p.updated_at DESC, p.created_at DESC",
  created: "p.created_at DESC",
  due_date: "p.due_date IS NULL, p.due_date ASC, p.updated_at DESC",
  priority: `${PRIORITY_RANK} ASC, p.updated_at DESC`,
  name: "p.name COLLATE NOCASE ASC, p.created_at ASC",
  position: "p.position ASC, p.created_at ASC",
};

/** Recursive CTE returning every descendant id of `?` (not the project itself). */
const DESCENDANT_IDS_SQL = `
  WITH RECURSIVE subtree(id) AS (
    SELECT c.id FROM projects c WHERE c.parent_id = ?
    UNION ALL
    SELECT c.id FROM projects c JOIN subtree s ON c.parent_id = s.id
  )
  SELECT id FROM subtree`;

/** SQLite's default variable limit is generous, but keep IN lists bounded. */
const IN_CHUNK = 500;

/** Escape LIKE wildcards so a search for "100%" matches literally. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

function emptyToNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value.trim() === "" ? null : value;
}

/* ------------------------------ Hydration ------------------------------- */

function fetchMembersByProject(projectIds: string[]): Map<string, UserSummary[]> {
  const db = getDb();
  const result = new Map<string, UserSummary[]>();
  for (let i = 0; i < projectIds.length; i += IN_CHUNK) {
    const chunk = projectIds.slice(i, i + IN_CHUNK);
    const rows = db
      .prepare<string[], MemberRow>(
        `SELECT pm.project_id, u.id, u.name, u.email, u.color, u.job_title
           FROM project_members pm
           JOIN users u ON u.id = pm.user_id
          WHERE pm.project_id IN (${placeholders(chunk.length)})
          ORDER BY u.name COLLATE NOCASE ASC`,
      )
      .all(...chunk);
    for (const row of rows) {
      const list = result.get(row.project_id) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        email: row.email,
        color: row.color,
        job_title: row.job_title,
      });
      result.set(row.project_id, list);
    }
  }
  return result;
}

function toProjectWithMeta(row: ProjectMetaRow, members: UserSummary[]): ProjectWithMeta {
  const owner: UserSummary | null =
    row.owner_id && row.owner_name !== null
      ? {
          id: row.owner_id,
          name: row.owner_name,
          email: row.owner_email ?? "",
          color: row.owner_color ?? "#64748b",
          job_title: row.owner_job_title,
        }
      : null;
  return {
    id: row.id,
    parent_id: row.parent_id,
    name: row.name,
    description: row.description,
    status: row.status,
    priority: row.priority,
    owner_id: row.owner_id,
    start_date: row.start_date,
    due_date: row.due_date,
    progress: row.progress,
    color: row.color,
    position: row.position,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    owner,
    members,
    subproject_count: row.subproject_count,
    subproject_completed: row.subproject_completed,
    comment_count: row.comment_count,
    parent_name: row.parent_name,
  };
}

/**
 * Runs the hydrated SELECT with a WHERE clause and ORDER BY, then attaches
 * members for all returned rows with a single grouped query.
 */
function queryWithMeta(
  where: string,
  params: unknown[],
  orderBy: string,
  limit?: number,
): ProjectWithMeta[] {
  let sql = `${META_SELECT} WHERE ${where} ORDER BY ${orderBy}`;
  const bound = [...params];
  if (limit !== undefined && Number.isFinite(limit) && limit > 0) {
    sql += " LIMIT ?";
    bound.push(Math.floor(limit));
  }
  const rows = getDb().prepare<unknown[], ProjectMetaRow>(sql).all(...bound);
  if (rows.length === 0) return [];
  const members = fetchMembersByProject(rows.map((row) => row.id));
  return rows.map((row) => toProjectWithMeta(row, members.get(row.id) ?? []));
}

function getProjectRow(id: string): Project | null {
  const row = getDb()
    .prepare<[string], ProjectRow>(`SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = ?`)
    .get(id);
  return row ?? null;
}

/* ------------------------------- Queries -------------------------------- */

export function listProjects(filters: ProjectFilters = {}): ProjectWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.parentId === null) {
    where.push("p.parent_id IS NULL");
  } else if (typeof filters.parentId === "string") {
    where.push("p.parent_id = ?");
    params.push(filters.parentId);
  }

  // An empty status array (nothing ticked in the filter UI) means "no status constraint".
  const statuses =
    filters.status === undefined
      ? []
      : Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
  if (statuses.length > 0) {
    where.push(`p.status IN (${placeholders(statuses.length)})`);
    params.push(...statuses);
  }

  if (filters.priority) {
    where.push("p.priority = ?");
    params.push(filters.priority);
  }

  if (filters.ownerId) {
    where.push("p.owner_id = ?");
    params.push(filters.ownerId);
  }

  if (filters.memberId) {
    where.push(
      `(p.owner_id = ? OR p.created_by = ? OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?
       ))`,
    );
    params.push(filters.memberId, filters.memberId, filters.memberId);
  }

  const search = filters.search?.trim();
  if (search) {
    where.push("(p.name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')");
    const pattern = likePattern(search);
    params.push(pattern, pattern);
  }

  const sort: SortKey = filters.sort && filters.sort in ORDER_BY ? filters.sort : "updated";
  return queryWithMeta(where.length > 0 ? where.join(" AND ") : "1 = 1", params, ORDER_BY[sort], filters.limit);
}

export function getProject(id: string): ProjectWithMeta | null {
  return queryWithMeta("p.id = ?", [id], "p.created_at ASC", 1)[0] ?? null;
}

/** Ancestors from the root down to the direct parent (the project itself excluded). */
export function getProjectAncestors(id: string): ProjectAncestor[] {
  return getDb()
    .prepare<[string], ProjectAncestor>(
      `WITH RECURSIVE ancestors(id, name, parent_id, depth) AS (
         SELECT p.id, p.name, p.parent_id, 0
           FROM projects p
          WHERE p.id = (SELECT parent_id FROM projects WHERE id = ?)
         UNION ALL
         SELECT p.id, p.name, p.parent_id, a.depth + 1
           FROM projects p
           JOIN ancestors a ON p.id = a.parent_id
       )
       SELECT id, name FROM ancestors ORDER BY depth DESC`,
    )
    .all(id);
}

/** The project id followed by every descendant id (breadth-first). */
export function getSubtreeIds(id: string): string[] {
  return getDb()
    .prepare<[string], string>(
      `WITH RECURSIVE subtree(id, depth) AS (
         SELECT id, 0 FROM projects WHERE id = ?
         UNION ALL
         SELECT p.id, s.depth + 1 FROM projects p JOIN subtree s ON p.parent_id = s.id
       )
       SELECT id FROM subtree ORDER BY depth ASC`,
    )
    .pluck()
    .all(id);
}

/** Counts every descendant at any depth, excluding the project itself. */
export function countSubtree(id: string): { total: number; completed: number } {
  const row = getDb()
    .prepare<[string], { total: number; completed: number }>(
      `WITH RECURSIVE subtree(id, status) AS (
         SELECT c.id, c.status FROM projects c WHERE c.parent_id = ?
         UNION ALL
         SELECT c.id, c.status FROM projects c JOIN subtree s ON c.parent_id = s.id
       )
       SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed
         FROM subtree`,
    )
    .get(id);
  return { total: row?.total ?? 0, completed: row?.completed ?? 0 };
}

/** Direct children with nested `children`, built in memory from one subtree query. */
export function getSubprojectTree(id: string): ProjectTreeNode[] {
  // Rows arrive ordered by position/created, so each children list stays sorted.
  const rows = queryWithMeta(`p.id IN (${DESCENDANT_IDS_SQL})`, [id], ORDER_BY.position);
  const byParent = new Map<string, ProjectWithMeta[]>();
  for (const row of rows) {
    const key = row.parent_id ?? "";
    const siblings = byParent.get(key) ?? [];
    siblings.push(row);
    byParent.set(key, siblings);
  }
  const build = (parentId: string): ProjectTreeNode[] =>
    (byParent.get(parentId) ?? []).map((project) => ({ ...project, children: build(project.id) }));
  return build(id);
}

/* ------------------------------- Mutations ------------------------------ */

/** Diff-based member replacement so existing rows keep their `added_at`. */
function replaceMembers(projectId: string, userIds: string[], now: string): void {
  const db = getDb();
  const current = new Set(
    db
      .prepare<[string], string>("SELECT user_id FROM project_members WHERE project_id = ?")
      .pluck()
      .all(projectId),
  );
  const wanted = new Set(userIds.filter((userId) => userId.trim() !== ""));
  const remove = db.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?");
  const insert = db.prepare(
    "INSERT INTO project_members (project_id, user_id, added_at) VALUES (?, ?, ?)",
  );
  for (const userId of current) {
    if (!wanted.has(userId)) remove.run(projectId, userId);
  }
  for (const userId of wanted) {
    if (!current.has(userId)) insert.run(projectId, userId, now);
  }
}

export function createProject(input: CreateProjectInput, createdBy: string): Project {
  const db = getDb();
  const id = newId();
  const now = nowISO();
  const status: ProjectStatus = input.status ?? "to_start";
  const priority: Priority = input.priority ?? "medium";
  const parentId = emptyToNull(input.parent_id);

  const run = db.transaction((): Project => {
    const nextPosition =
      db
        .prepare<[string | null], number>(
          "SELECT COALESCE(MAX(position), -1) + 1 FROM projects WHERE parent_id IS ?",
        )
        .pluck()
        .get(parentId) ?? 0;

    db.prepare(
      `INSERT INTO projects (id, parent_id, name, description, status, priority, owner_id,
         start_date, due_date, progress, color, position, created_by, created_at, updated_at,
         completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      parentId,
      input.name.trim(),
      (input.description ?? "").trim(),
      status,
      priority,
      emptyToNull(input.owner_id),
      emptyToNull(input.start_date),
      emptyToNull(input.due_date),
      clampProgress(input.progress ?? 0),
      emptyToNull(input.color),
      nextPosition,
      createdBy,
      now,
      now,
      status === "completed" ? now : null,
    );

    if (input.member_ids && input.member_ids.length > 0) {
      replaceMembers(id, input.member_ids, now);
    }

    const created = getProjectRow(id);
    if (!created) throw new Error("Failed to create project");
    return created;
  });

  return run();
}

export function updateProject(id: string, patch: UpdateProjectInput): Project {
  const db = getDb();
  const now = nowISO();

  const run = db.transaction((): Project => {
    const existing = getProjectRow(id);
    if (!existing) throw new Error(`Project ${id} not found`);

    const sets: string[] = [];
    const params: unknown[] = [];

    if (patch.name !== undefined) {
      sets.push("name = ?");
      params.push(patch.name.trim());
    }
    if (patch.description !== undefined) {
      sets.push("description = ?");
      params.push(patch.description.trim());
    }
    if (patch.status !== undefined) {
      sets.push("status = ?");
      params.push(patch.status);
      // completed_at mirrors the status: stamped on entry, cleared on exit.
      if (patch.status === "completed" && !existing.completed_at) {
        sets.push("completed_at = ?");
        params.push(now);
      } else if (patch.status !== "completed" && existing.completed_at) {
        sets.push("completed_at = NULL");
      }
    }
    if (patch.priority !== undefined) {
      sets.push("priority = ?");
      params.push(patch.priority);
    }
    if (patch.owner_id !== undefined) {
      sets.push("owner_id = ?");
      params.push(emptyToNull(patch.owner_id));
    }
    if (patch.start_date !== undefined) {
      sets.push("start_date = ?");
      params.push(emptyToNull(patch.start_date));
    }
    if (patch.due_date !== undefined) {
      sets.push("due_date = ?");
      params.push(emptyToNull(patch.due_date));
    }
    if (patch.progress !== undefined) {
      sets.push("progress = ?");
      params.push(clampProgress(patch.progress));
    }
    if (patch.color !== undefined) {
      sets.push("color = ?");
      params.push(emptyToNull(patch.color));
    }
    sets.push("updated_at = ?");
    params.push(now);

    db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...params, id);

    if (patch.member_ids !== undefined) {
      replaceMembers(id, patch.member_ids, now);
    }

    const updated = getProjectRow(id);
    if (!updated) throw new Error(`Project ${id} not found`);
    return updated;
  });

  return run();
}

/** Sub-projects, members, comments and activity go with it via ON DELETE CASCADE. */
export function deleteProject(id: string): void {
  getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
}

export function getProjectMembers(id: string): UserSummary[] {
  return getDb()
    .prepare<[string], UserSummary>(
      `SELECT u.id, u.name, u.email, u.color, u.job_title
         FROM project_members pm
         JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = ?
        ORDER BY u.name COLLATE NOCASE ASC`,
    )
    .all(id);
}

export function setProjectMembers(id: string, userIds: string[]): UserSummary[] {
  const db = getDb();
  const now = nowISO();
  const run = db.transaction((): UserSummary[] => {
    replaceMembers(id, userIds, now);
    db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now, id);
    return getProjectMembers(id);
  });
  return run();
}

/** Rewrites `position` 0..n for the given siblings; ids outside the parent are ignored. */
export function reorderProjects(parentId: string | null, orderedIds: string[]): void {
  const db = getDb();
  const run = db.transaction(() => {
    const update = db.prepare("UPDATE projects SET position = ? WHERE id = ? AND parent_id IS ?");
    orderedIds.forEach((projectId, index) => {
      update.run(index, projectId, parentId);
    });
  });
  run();
}

/* -------------------------------- Stats --------------------------------- */

export function getProjectStats(scope: "top_level" | "all" = "top_level"): ProjectStats {
  const db = getDb();
  const scopeWhere = scope === "all" ? "1 = 1" : "p.parent_id IS NULL";
  const today = todayISODate();
  const weekEnd = addDays(today, 7);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const byStatus: Record<ProjectStatus, number> = {
    to_start: 0,
    ongoing: 0,
    on_hold: 0,
    completed: 0,
    cancelled: 0,
  };
  const statusRows = db
    .prepare<[], { status: ProjectStatus; n: number }>(
      `SELECT p.status, COUNT(*) AS n FROM projects p WHERE ${scopeWhere} GROUP BY p.status`,
    )
    .all();
  for (const row of statusRows) {
    if (PROJECT_STATUSES.includes(row.status)) byStatus[row.status] = row.n;
  }

  const aggregate = db
    .prepare<unknown[], {
      total: number;
      overdue: number;
      due_this_week: number;
      completed_last_30_days: number;
    }>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN ${OPEN_IN} AND p.due_date IS NOT NULL AND p.due_date < ?
                           THEN 1 ELSE 0 END), 0) AS overdue,
              COALESCE(SUM(CASE WHEN ${OPEN_IN} AND p.due_date IS NOT NULL
                                 AND p.due_date >= ? AND p.due_date <= ?
                           THEN 1 ELSE 0 END), 0) AS due_this_week,
              COALESCE(SUM(CASE WHEN p.status = 'completed' AND p.completed_at IS NOT NULL
                                 AND p.completed_at >= ?
                           THEN 1 ELSE 0 END), 0) AS completed_last_30_days
         FROM projects p
        WHERE ${scopeWhere}`,
    )
    .get(...OPEN_STATUSES, today, ...OPEN_STATUSES, today, weekEnd, thirtyDaysAgo);

  return {
    total: aggregate?.total ?? 0,
    by_status: byStatus,
    overdue: aggregate?.overdue ?? 0,
    due_this_week: aggregate?.due_this_week ?? 0,
    completed_last_30_days: aggregate?.completed_last_30_days ?? 0,
  };
}

/** Open projects (any depth) with a due date, soonest first; overdue ones lead. */
export function listUpcomingDeadlines(limit = 8): ProjectWithMeta[] {
  return queryWithMeta(
    `${OPEN_IN} AND p.due_date IS NOT NULL`,
    [...OPEN_STATUSES],
    `p.due_date ASC, ${PRIORITY_RANK} ASC, p.updated_at DESC`,
    limit,
  );
}

/** Open projects where the user is owner, creator or member, most recently updated first. */
export function listMyProjects(userId: string, limit = 8): ProjectWithMeta[] {
  return listProjects({ memberId: userId, status: OPEN_STATUSES, sort: "updated", limit });
}
