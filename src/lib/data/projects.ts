import { db, newId, nowISO, transaction, type Queryable, type SqlParam } from "@/lib/db";
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

/** Same columns for RETURNING clauses (no table alias available there). */
const RETURNING_COLUMNS = `id, parent_id, name, description, status, priority, owner_id,
  start_date, due_date, progress, color, position, created_by, created_at, updated_at,
  completed_at`;

const META_SELECT = `
  SELECT ${PROJECT_COLUMNS},
         o.name AS owner_name, o.email AS owner_email, o.color AS owner_color,
         o.job_title AS owner_job_title,
         par.name AS parent_name,
         (SELECT COUNT(*)::int FROM projects c WHERE c.parent_id = p.id) AS subproject_count,
         (SELECT COUNT(*)::int FROM projects c WHERE c.parent_id = p.id AND c.status = 'completed')
           AS subproject_completed,
         (SELECT COUNT(*)::int FROM comments cm WHERE cm.project_id = p.id) AS comment_count
    FROM projects p
    LEFT JOIN users o ON o.id = p.owner_id
    LEFT JOIN projects par ON par.id = p.parent_id`;

/** urgent -> 0 ... low -> 3, from the PRIORITY_ORDER constant (not user input). */
const PRIORITY_RANK = `CASE p.priority ${PRIORITY_ORDER.map((value, index) => `WHEN '${value}' THEN ${index}`).join(" ")} ELSE ${PRIORITY_ORDER.length} END`;

type SortKey = NonNullable<ProjectFilters["sort"]>;

const ORDER_BY: Record<SortKey, string> = {
  updated: "p.updated_at DESC, p.created_at DESC",
  created: "p.created_at DESC",
  due_date: "p.due_date ASC NULLS LAST, p.updated_at DESC",
  priority: `${PRIORITY_RANK} ASC, p.updated_at DESC`,
  name: "lower(p.name) ASC, p.created_at ASC",
  position: "p.position ASC, p.created_at ASC",
};

/** Collects bound values and hands out their `$n` placeholders. */
class Params {
  readonly values: SqlParam[] = [];

  add(value: SqlParam): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** Escape LIKE wildcards so a search for "100%" matches literally. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

function emptyToNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value.trim() === "" ? null : value;
}

/** `parent_id` match that also handles top-level projects (NULL parent). */
function parentMatch(parentId: string | null, params: Params): string {
  return parentId === null ? "parent_id IS NULL" : `parent_id = ${params.add(parentId)}`;
}

/* ------------------------------ Hydration ------------------------------- */

async function fetchMembersByProject(
  projectIds: string[],
  q: Queryable = db,
): Promise<Map<string, UserSummary[]>> {
  const result = new Map<string, UserSummary[]>();
  if (projectIds.length === 0) return result;
  const rows = await q.query<MemberRow>(
    `SELECT pm.project_id, u.id, u.name, u.email, u.color, u.job_title
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ANY($1::text[])
      ORDER BY lower(u.name) ASC`,
    [projectIds],
  );
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
 * Runs the hydrated SELECT with a WHERE clause (whose `$n` placeholders refer
 * to `params`) and ORDER BY, then attaches members for all returned rows with
 * a single grouped query.
 */
async function queryWithMeta(
  where: string,
  params: Params,
  orderBy: string,
  limit?: number,
  q: Queryable = db,
): Promise<ProjectWithMeta[]> {
  let sql = `${META_SELECT} WHERE ${where} ORDER BY ${orderBy}`;
  if (limit !== undefined && Number.isFinite(limit) && limit > 0) {
    sql += ` LIMIT ${params.add(Math.floor(limit))}`;
  }
  const rows = await q.query<ProjectMetaRow>(sql, params.values);
  if (rows.length === 0) return [];
  const members = await fetchMembersByProject(
    rows.map((row) => row.id),
    q,
  );
  return rows.map((row) => toProjectWithMeta(row, members.get(row.id) ?? []));
}

async function getProjectRow(id: string, q: Queryable = db, forUpdate = false): Promise<Project | null> {
  return q.queryOne<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [id],
  );
}

/* ------------------------------- Queries -------------------------------- */

export async function listProjects(filters: ProjectFilters = {}): Promise<ProjectWithMeta[]> {
  const where: string[] = [];
  const params = new Params();

  if (filters.parentId === null) {
    where.push("p.parent_id IS NULL");
  } else if (typeof filters.parentId === "string") {
    where.push(`p.parent_id = ${params.add(filters.parentId)}`);
  }

  // An empty status array (nothing ticked in the filter UI) means "no status constraint".
  const statuses =
    filters.status === undefined
      ? []
      : Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
  if (statuses.length > 0) {
    where.push(`p.status = ANY(${params.add(statuses)}::text[])`);
  }

  if (filters.priority) {
    where.push(`p.priority = ${params.add(filters.priority)}`);
  }

  if (filters.ownerId) {
    where.push(`p.owner_id = ${params.add(filters.ownerId)}`);
  }

  if (filters.memberId) {
    const member = params.add(filters.memberId);
    where.push(
      `(p.owner_id = ${member} OR p.created_by = ${member} OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${member}
       ))`,
    );
  }

  const search = filters.search?.trim();
  if (search) {
    const pattern = params.add(likePattern(search));
    where.push(`(p.name ILIKE ${pattern} ESCAPE '\\' OR p.description ILIKE ${pattern} ESCAPE '\\')`);
  }

  const sort: SortKey = filters.sort && filters.sort in ORDER_BY ? filters.sort : "updated";
  return queryWithMeta(
    where.length > 0 ? where.join(" AND ") : "TRUE",
    params,
    ORDER_BY[sort],
    filters.limit,
  );
}

export async function getProject(id: string): Promise<ProjectWithMeta | null> {
  const params = new Params();
  const rows = await queryWithMeta(`p.id = ${params.add(id)}`, params, "p.created_at ASC", 1);
  return rows[0] ?? null;
}

/** Ancestors from the root down to the direct parent (the project itself excluded). */
export async function getProjectAncestors(id: string): Promise<ProjectAncestor[]> {
  return db.query<ProjectAncestor>(
    `WITH RECURSIVE ancestors(id, name, parent_id, depth) AS (
       SELECT p.id, p.name, p.parent_id, 0
         FROM projects p
        WHERE p.id = (SELECT parent_id FROM projects WHERE id = $1)
       UNION ALL
       SELECT p.id, p.name, p.parent_id, a.depth + 1
         FROM projects p
         JOIN ancestors a ON p.id = a.parent_id
     )
     SELECT id, name FROM ancestors ORDER BY depth DESC`,
    [id],
  );
}

/** The project id followed by every descendant id (breadth-first). */
export async function getSubtreeIds(id: string): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `WITH RECURSIVE subtree(id, depth) AS (
       SELECT id, 0 FROM projects WHERE id = $1
       UNION ALL
       SELECT p.id, s.depth + 1 FROM projects p JOIN subtree s ON p.parent_id = s.id
     )
     SELECT id FROM subtree ORDER BY depth ASC`,
    [id],
  );
  return rows.map((row) => row.id);
}

/** Counts every descendant at any depth, excluding the project itself. */
export async function countSubtree(id: string): Promise<{ total: number; completed: number }> {
  const row = await db.queryOne<{ total: number; completed: number }>(
    `WITH RECURSIVE subtree(id, status) AS (
       SELECT c.id, c.status FROM projects c WHERE c.parent_id = $1
       UNION ALL
       SELECT c.id, c.status FROM projects c JOIN subtree s ON c.parent_id = s.id
     )
     SELECT COUNT(*)::int AS total,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)::int AS completed
       FROM subtree`,
    [id],
  );
  return { total: row?.total ?? 0, completed: row?.completed ?? 0 };
}

/** Direct children with nested `children`, built in memory from one subtree query. */
export async function getSubprojectTree(id: string): Promise<ProjectTreeNode[]> {
  const params = new Params();
  const root = params.add(id);
  // Rows arrive ordered by position/created, so each children list stays sorted.
  const rows = await queryWithMeta(
    `p.id IN (
       WITH RECURSIVE subtree(id) AS (
         SELECT c.id FROM projects c WHERE c.parent_id = ${root}
         UNION ALL
         SELECT c.id FROM projects c JOIN subtree s ON c.parent_id = s.id
       )
       SELECT id FROM subtree
     )`,
    params,
    ORDER_BY.position,
  );
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
async function replaceMembers(
  projectId: string,
  userIds: string[],
  now: string,
  q: Queryable = db,
): Promise<void> {
  const currentRows = await q.query<{ user_id: string }>(
    "SELECT user_id FROM project_members WHERE project_id = $1",
    [projectId],
  );
  const current = new Set(currentRows.map((row) => row.user_id));
  const wanted = new Set(userIds.filter((userId) => userId.trim() !== ""));
  const remove = [...current].filter((userId) => !wanted.has(userId));
  const add = [...wanted].filter((userId) => !current.has(userId));
  if (remove.length > 0) {
    await q.execute(
      "DELETE FROM project_members WHERE project_id = $1 AND user_id = ANY($2::text[])",
      [projectId, remove],
    );
  }
  if (add.length > 0) {
    await q.execute(
      `INSERT INTO project_members (project_id, user_id, added_at)
       SELECT $1, member.user_id, $3 FROM unnest($2::text[]) AS member(user_id)`,
      [projectId, add, now],
    );
  }
}

export async function createProject(input: CreateProjectInput, createdBy: string): Promise<Project> {
  const id = newId();
  const now = nowISO();
  const status: ProjectStatus = input.status ?? "to_start";
  const priority: Priority = input.priority ?? "medium";
  const parentId = emptyToNull(input.parent_id);

  return transaction(async (tx) => {
    const siblingParams = new Params();
    const positionRow = await tx.queryOne<{ next: number }>(
      `SELECT (COALESCE(MAX(position), -1) + 1)::int AS next FROM projects
        WHERE ${parentMatch(parentId, siblingParams)}`,
      siblingParams.values,
    );
    const nextPosition = positionRow?.next ?? 0;

    const created = await tx.queryOne<ProjectRow>(
      `INSERT INTO projects (id, parent_id, name, description, status, priority, owner_id,
         start_date, due_date, progress, color, position, created_by, created_at, updated_at,
         completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING ${RETURNING_COLUMNS}`,
      [
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
      ],
    );
    if (!created) throw new Error("Failed to create project");

    if (input.member_ids && input.member_ids.length > 0) {
      await replaceMembers(id, input.member_ids, now, tx);
    }
    return created;
  });
}

export async function updateProject(id: string, patch: UpdateProjectInput): Promise<Project> {
  const now = nowISO();

  return transaction(async (tx) => {
    // Lock the row so the completed_at decision below cannot race another update.
    const existing = await getProjectRow(id, tx, true);
    if (!existing) throw new Error(`Project ${id} not found`);

    const sets: string[] = [];
    const params = new Params();

    if (patch.name !== undefined) {
      sets.push(`name = ${params.add(patch.name.trim())}`);
    }
    if (patch.description !== undefined) {
      sets.push(`description = ${params.add(patch.description.trim())}`);
    }
    if (patch.status !== undefined) {
      sets.push(`status = ${params.add(patch.status)}`);
      // completed_at mirrors the status: stamped on entry, cleared on exit.
      if (patch.status === "completed" && !existing.completed_at) {
        sets.push(`completed_at = ${params.add(now)}`);
      } else if (patch.status !== "completed" && existing.completed_at) {
        sets.push("completed_at = NULL");
      }
    }
    if (patch.priority !== undefined) {
      sets.push(`priority = ${params.add(patch.priority)}`);
    }
    if (patch.owner_id !== undefined) {
      sets.push(`owner_id = ${params.add(emptyToNull(patch.owner_id))}`);
    }
    if (patch.start_date !== undefined) {
      sets.push(`start_date = ${params.add(emptyToNull(patch.start_date))}`);
    }
    if (patch.due_date !== undefined) {
      sets.push(`due_date = ${params.add(emptyToNull(patch.due_date))}`);
    }
    if (patch.progress !== undefined) {
      sets.push(`progress = ${params.add(clampProgress(patch.progress))}`);
    }
    if (patch.color !== undefined) {
      sets.push(`color = ${params.add(emptyToNull(patch.color))}`);
    }
    sets.push(`updated_at = ${params.add(now)}`);

    const updated = await tx.queryOne<ProjectRow>(
      `UPDATE projects SET ${sets.join(", ")} WHERE id = ${params.add(id)}
       RETURNING ${RETURNING_COLUMNS}`,
      params.values,
    );
    if (!updated) throw new Error(`Project ${id} not found`);

    if (patch.member_ids !== undefined) {
      await replaceMembers(id, patch.member_ids, now, tx);
    }
    return updated;
  });
}

/** Sub-projects, members, comments and activity go with it via ON DELETE CASCADE. */
export async function deleteProject(id: string): Promise<void> {
  await db.execute("DELETE FROM projects WHERE id = $1", [id]);
}

async function selectProjectMembers(id: string, q: Queryable = db): Promise<UserSummary[]> {
  return q.query<UserSummary>(
    `SELECT u.id, u.name, u.email, u.color, u.job_title
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = $1
      ORDER BY lower(u.name) ASC`,
    [id],
  );
}

export async function getProjectMembers(id: string): Promise<UserSummary[]> {
  return selectProjectMembers(id);
}

export async function setProjectMembers(id: string, userIds: string[]): Promise<UserSummary[]> {
  const now = nowISO();
  return transaction(async (tx) => {
    await replaceMembers(id, userIds, now, tx);
    await tx.execute("UPDATE projects SET updated_at = $1 WHERE id = $2", [now, id]);
    return selectProjectMembers(id, tx);
  });
}

/** Rewrites `position` 0..n for the given siblings; ids outside the parent are ignored. */
export async function reorderProjects(parentId: string | null, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  await transaction(async (tx) => {
    for (const [index, projectId] of orderedIds.entries()) {
      const params = new Params();
      const position = params.add(index);
      const target = params.add(projectId);
      await tx.execute(
        `UPDATE projects SET position = ${position}
          WHERE id = ${target} AND ${parentMatch(parentId, params)}`,
        params.values,
      );
    }
  });
}

/* -------------------------------- Stats --------------------------------- */

export async function getProjectStats(
  scope: "top_level" | "all" = "top_level",
): Promise<ProjectStats> {
  const scopeWhere = scope === "all" ? "TRUE" : "p.parent_id IS NULL";
  const today = todayISODate();
  const weekEnd = addDays(today, 7);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [statusRows, aggregate] = await Promise.all([
    db.query<{ status: ProjectStatus; n: number }>(
      `SELECT p.status, COUNT(*)::int AS n FROM projects p WHERE ${scopeWhere} GROUP BY p.status`,
    ),
    db.queryOne<{
      total: number;
      overdue: number;
      due_this_week: number;
      completed_last_30_days: number;
    }>(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(CASE WHEN p.status = ANY($1::text[]) AND p.due_date IS NOT NULL
                                 AND p.due_date < $2
                           THEN 1 ELSE 0 END), 0)::int AS overdue,
              COALESCE(SUM(CASE WHEN p.status = ANY($1::text[]) AND p.due_date IS NOT NULL
                                 AND p.due_date >= $2 AND p.due_date <= $3
                           THEN 1 ELSE 0 END), 0)::int AS due_this_week,
              COALESCE(SUM(CASE WHEN p.status = 'completed' AND p.completed_at IS NOT NULL
                                 AND p.completed_at >= $4
                           THEN 1 ELSE 0 END), 0)::int AS completed_last_30_days
         FROM projects p
        WHERE ${scopeWhere}`,
      [OPEN_STATUSES, today, weekEnd, thirtyDaysAgo],
    ),
  ]);

  const byStatus: Record<ProjectStatus, number> = {
    to_start: 0,
    ongoing: 0,
    on_hold: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const row of statusRows) {
    if (PROJECT_STATUSES.includes(row.status)) byStatus[row.status] = row.n;
  }

  return {
    total: aggregate?.total ?? 0,
    by_status: byStatus,
    overdue: aggregate?.overdue ?? 0,
    due_this_week: aggregate?.due_this_week ?? 0,
    completed_last_30_days: aggregate?.completed_last_30_days ?? 0,
  };
}

/** Open projects (any depth) with a due date, soonest first; overdue ones lead. */
export async function listUpcomingDeadlines(limit = 8): Promise<ProjectWithMeta[]> {
  const params = new Params();
  return queryWithMeta(
    `p.status = ANY(${params.add(OPEN_STATUSES)}::text[]) AND p.due_date IS NOT NULL`,
    params,
    `p.due_date ASC, ${PRIORITY_RANK} ASC, p.updated_at DESC`,
    limit,
  );
}

/** Open projects where the user is owner, creator or member, most recently updated first. */
export async function listMyProjects(userId: string, limit = 8): Promise<ProjectWithMeta[]> {
  return listProjects({ memberId: userId, status: OPEN_STATUSES, sort: "updated", limit });
}
