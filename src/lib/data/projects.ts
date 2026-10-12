import { db, newId, nowISO, transaction, type Queryable, type SqlParam } from "@/lib/db";
import { MAX_BULK_IDS, OPEN_STATUSES, PRIORITY_ORDER } from "@/lib/constants";
import { clampProgress } from "@/lib/utils";
import { addDaysISO } from "@/lib/workspace-time";
import {
  PROJECT_STATUSES,
  type BulkProjectPatch,
  type BulkResult,
  type ClientSummary,
  type CreateProjectFullInput,
  type Currency,
  type LabelSummary,
  type MilestoneSummary,
  type Priority,
  type ProgressMode,
  type Project,
  type ProjectAncestor,
  type ProjectFilters,
  type ProjectQueryOptions,
  type ProjectStats,
  type ProjectStatus,
  type ProjectSummary,
  type ProjectTreeNode,
  type ProjectWithMeta,
  type UpdateProjectFullInput,
  type UserSummary,
} from "@/lib/types";
import { getAppSettings, getWorkspaceToday } from "./app-settings";
import { LABEL_ORDER_SQL, setProjectLabels } from "./labels";
import { recomputeProjectProgress } from "./tasks";

/* ------------------------------ Row shapes ------------------------------ */

/** A raw `projects` row maps 1:1 onto `Project`. */
type ProjectRow = Project;

/** `projects` joined with owner, parent and client, plus count subqueries. */
interface ProjectMetaRow extends ProjectRow {
  owner_name: string | null;
  owner_email: string | null;
  owner_color: string | null;
  owner_job_title: string | null;
  parent_name: string | null;
  subproject_count: number;
  subproject_completed: number;
  comment_count: number;
  client_name: string | null;
  client_code: string | null;
  client_color: string | null;
  client_currency: Currency | null;
  client_confidential: boolean | null;
  /** json_build_object(...) — parsed by node-postgres. */
  current_phase: MilestoneSummary | null;
  task_count: number | null;
  task_done_count: number | null;
}

interface MemberRow extends UserSummary {
  project_id: string;
}

interface LabelRow extends LabelSummary {
  project_id: string;
}

/* ------------------------------ SQL pieces ------------------------------ */

const PROJECT_COLUMNS = `p.id, p.parent_id, p.name, p.description, p.status, p.priority, p.owner_id,
  p.start_date, p.due_date, p.progress, p.color, p.position, p.created_by, p.created_at,
  p.updated_at, p.completed_at,
  p.client_id, p.service_line, p.engagement_type, p.currency, p.contract_value, p.hourly_rate,
  p.delivery_state, p.progress_mode, p.budget_hours, p.budget_period, p.health,
  p.health_updated_at, p.go_live_date, p.tuning_days, p.tuning_closed_at, p.template_key,
  p.source_project_id`;

/** Same columns for RETURNING clauses (no table alias available there). */
const RETURNING_COLUMNS = `id, parent_id, name, description, status, priority, owner_id,
  start_date, due_date, progress, color, position, created_by, created_at, updated_at,
  completed_at,
  client_id, service_line, engagement_type, currency, contract_value, hourly_rate,
  delivery_state, progress_mode, budget_hours, budget_period, health,
  health_updated_at, go_live_date, tuning_days, tuning_closed_at, template_key,
  source_project_id`;

const META_SELECT = `
  SELECT ${PROJECT_COLUMNS},
         o.name AS owner_name, o.email AS owner_email, o.color AS owner_color,
         o.job_title AS owner_job_title,
         par.name AS parent_name,
         cl.name AS client_name, cl.code AS client_code, cl.color AS client_color,
         cl.currency AS client_currency, cl.confidential AS client_confidential,
         (SELECT COUNT(*)::int FROM projects c WHERE c.parent_id = p.id) AS subproject_count,
         (SELECT COUNT(*)::int FROM projects c WHERE c.parent_id = p.id AND c.status = 'completed')
           AS subproject_completed,
         (SELECT COUNT(*)::int FROM comments cm WHERE cm.project_id = p.id AND cm.task_id IS NULL)
           AS comment_count,
         tc.task_count, tc.task_done_count,
         (SELECT json_build_object('id', m.id, 'project_id', m.project_id, 'name', m.name,
                                   'kind', m.kind, 'status', m.status, 'phase_key', m.phase_key,
                                   'start_date', m.start_date, 'due_date', m.due_date)
            FROM milestones m
           WHERE m.project_id = p.id AND m.kind = 'phase' AND m.status IN ('active', 'gate_review')
           ORDER BY m.position ASC, m.created_at ASC
           LIMIT 1) AS current_phase
    FROM projects p
    LEFT JOIN users o ON o.id = p.owner_id
    LEFT JOIN projects par ON par.id = p.parent_id
    LEFT JOIN clients cl ON cl.id = p.client_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE t.status <> 'cancelled')::int AS task_count,
             COUNT(*) FILTER (WHERE t.status = 'done')::int AS task_done_count
        FROM tasks t
       WHERE t.project_id = p.id
    ) tc ON TRUE`;

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

/** A single value or a list as a list (undefined -> empty). */
function asList<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
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

async function fetchLabelsByProject(
  projectIds: string[],
  q: Queryable = db,
): Promise<Map<string, LabelSummary[]>> {
  const result = new Map<string, LabelSummary[]>();
  if (projectIds.length === 0) return result;
  const rows = await q.query<LabelRow>(
    `SELECT pl.project_id, l.id, l.name, l.color, l.label_group
       FROM project_labels pl
       JOIN labels l ON l.id = pl.label_id
      WHERE pl.project_id = ANY($1::text[])
      ORDER BY ${LABEL_ORDER_SQL}`,
    [projectIds],
  );
  for (const row of rows) {
    const list = result.get(row.project_id) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color, label_group: row.label_group });
    result.set(row.project_id, list);
  }
  return result;
}

/**
 * Exactly the `Project` fields of a row (extra joined columns dropped).
 * Admin-only fields (PROJECT_COMMERCIAL_FIELDS) are null unless
 * `includeCommercial` is true, so a non-admin page or action result can never
 * carry them to the client.
 */
function toProject(row: ProjectRow, includeCommercial: boolean): Project {
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
    client_id: row.client_id,
    service_line: row.service_line,
    engagement_type: row.engagement_type,
    currency: row.currency,
    contract_value: includeCommercial ? row.contract_value : null,
    hourly_rate: includeCommercial ? row.hourly_rate : null,
    delivery_state: row.delivery_state,
    progress_mode: row.progress_mode,
    budget_hours: row.budget_hours,
    budget_period: row.budget_period,
    health: row.health,
    health_updated_at: row.health_updated_at,
    go_live_date: row.go_live_date,
    tuning_days: row.tuning_days,
    tuning_closed_at: row.tuning_closed_at,
    template_key: row.template_key,
    source_project_id: row.source_project_id,
  };
}

function toProjectWithMeta(
  row: ProjectMetaRow,
  members: UserSummary[],
  labels: LabelSummary[],
  includeCommercial: boolean,
): ProjectWithMeta {
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
  const client: ClientSummary | null =
    row.client_id && row.client_name !== null
      ? {
          id: row.client_id,
          name: row.client_name,
          code: row.client_code ?? "",
          color: row.client_color ?? "#64748b",
          currency: row.client_currency ?? "INR",
          confidential: row.client_confidential === true,
        }
      : null;
  return {
    ...toProject(row, includeCommercial),
    owner,
    members,
    subproject_count: row.subproject_count,
    subproject_completed: row.subproject_completed,
    comment_count: row.comment_count,
    parent_name: row.parent_name,
    client,
    labels,
    current_phase: row.current_phase ?? null,
    task_count: row.task_count ?? 0,
    task_done_count: row.task_done_count ?? 0,
  };
}

interface MetaQueryOptions extends ProjectQueryOptions {
  limit?: number;
  q?: Queryable;
}

/**
 * Runs the hydrated SELECT with a WHERE clause (whose `$n` placeholders refer
 * to `params`) and ORDER BY, then attaches members and labels for all
 * returned rows with one grouped query each.
 */
async function queryWithMeta(
  where: string,
  params: Params,
  orderBy: string,
  options: MetaQueryOptions = {},
): Promise<ProjectWithMeta[]> {
  const q = options.q ?? db;
  let sql = `${META_SELECT} WHERE ${where} ORDER BY ${orderBy}`;
  const limit = options.limit;
  if (limit !== undefined && Number.isFinite(limit) && limit > 0) {
    sql += ` LIMIT ${params.add(Math.floor(limit))}`;
  }
  const rows = await q.query<ProjectMetaRow>(sql, params.values);
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const members = await fetchMembersByProject(ids, q);
  const labels = await fetchLabelsByProject(ids, q);
  const includeCommercial = options.includeCommercial === true;
  return rows.map((row) =>
    toProjectWithMeta(row, members.get(row.id) ?? [], labels.get(row.id) ?? [], includeCommercial),
  );
}

async function getProjectRow(id: string, q: Queryable = db, forUpdate = false): Promise<Project | null> {
  return q.queryOne<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [id],
  );
}

/* ------------------------------- Queries -------------------------------- */

export async function listProjects(
  filters: ProjectFilters = {},
  options: ProjectQueryOptions = {},
): Promise<ProjectWithMeta[]> {
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

  if (filters.clientId) {
    where.push(`p.client_id = ${params.add(filters.clientId)}`);
  }

  const serviceLines = asList(filters.serviceLine);
  if (serviceLines.length > 0) {
    where.push(`p.service_line = ANY(${params.add(serviceLines)}::text[])`);
  }

  const engagementTypes = asList(filters.engagementType);
  if (engagementTypes.length > 0) {
    where.push(`p.engagement_type = ANY(${params.add(engagementTypes)}::text[])`);
  }

  const deliveryStates = asList(filters.deliveryState);
  if (deliveryStates.length > 0) {
    where.push(`p.delivery_state = ANY(${params.add(deliveryStates)}::text[])`);
  }

  const healths = asList(filters.health);
  if (healths.length > 0) {
    where.push(`p.health = ANY(${params.add(healths)}::text[])`);
  }

  if (filters.labelIds && filters.labelIds.length > 0) {
    where.push(
      `EXISTS (SELECT 1 FROM project_labels pl
                WHERE pl.project_id = p.id AND pl.label_id = ANY(${params.add(filters.labelIds)}::text[]))`,
    );
  }

  // An explicit id list restricts the result (an empty list matches nothing).
  if (filters.ids !== undefined) {
    where.push(`p.id = ANY(${params.add(filters.ids)}::text[])`);
  }

  const sort: SortKey = filters.sort && filters.sort in ORDER_BY ? filters.sort : "updated";
  return queryWithMeta(where.length > 0 ? where.join(" AND ") : "TRUE", params, ORDER_BY[sort], {
    limit: filters.limit,
    includeCommercial: options.includeCommercial,
  });
}

export async function getProject(
  id: string,
  options: ProjectQueryOptions = {},
): Promise<ProjectWithMeta | null> {
  const params = new Params();
  const rows = await queryWithMeta(`p.id = ${params.add(id)}`, params, "p.created_at ASC", {
    limit: 1,
    includeCommercial: options.includeCommercial,
  });
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
export async function getSubprojectTree(
  id: string,
  options: ProjectQueryOptions = {},
): Promise<ProjectTreeNode[]> {
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
    { includeCommercial: options.includeCommercial },
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

/** Options for createProject: reads strip like any other, plus a hook inside the create transaction. */
export interface CreateProjectOptions extends ProjectQueryOptions {
  /**
   * Runs inside the create transaction after the row, members and labels are
   * written (templates apply phases, tasks, metrics and risks here). It may
   * only use the `tx` it receives (SPEC.md section 17, transactions).
   */
  afterInsert?: (tx: Queryable, project: Project) => Promise<void>;
}

const AMOUNTS_NEED_CURRENCY = "Pick a currency before entering amounts.";
const CURRENCY_LOCKED = "Clear the contract value, hourly rate and phase prices before changing the currency.";

/** The client's default currency; undefined when the client does not exist. */
async function clientCurrency(clientId: string, q: Queryable): Promise<Currency | undefined> {
  const row = await q.queryOne<{ currency: Currency }>("SELECT currency FROM clients WHERE id = $1", [clientId]);
  return row ? row.currency : undefined;
}

/**
 * Creates a project with every v2 field. A sub-project inherits `client_id`,
 * `currency` and `service_line` from its parent when they are not given;
 * `currency` otherwise defaults to the client's. Amounts (`contract_value`,
 * `hourly_rate`) need a resulting currency (user-facing Error otherwise).
 * `progress_mode` defaults to the column default ("manual"; the action passes
 * "tasks" for new projects) and derived modes are recomputed in the
 * transaction. `tuning_days` defaults to app_settings.default_tuning_days.
 * The returned row has commercial fields stripped unless includeCommercial.
 */
export async function createProject(
  input: CreateProjectFullInput,
  createdBy: string,
  options: CreateProjectOptions = {},
): Promise<Project> {
  const id = newId();
  const now = nowISO();
  const status: ProjectStatus = input.status ?? "to_start";
  const priority: Priority = input.priority ?? "medium";
  const parentId = emptyToNull(input.parent_id);

  // Everything is read before the transaction opens (never nest db.* inside it).
  const parent = parentId ? await getProjectRow(parentId) : null;
  if (parentId && !parent) throw new Error("The parent project no longer exists.");

  const clientId = input.client_id !== undefined ? emptyToNull(input.client_id) : (parent?.client_id ?? null);
  const clientDefault = clientId ? await clientCurrency(clientId, db) : null;
  if (clientId && clientDefault === undefined) throw new Error("The selected client no longer exists.");

  const inheritedCurrency = parent && parent.client_id === clientId ? parent.currency : null;
  const currency: Currency | null =
    input.currency !== undefined ? input.currency : (inheritedCurrency ?? clientDefault ?? null);
  const serviceLine = input.service_line !== undefined ? input.service_line : (parent?.service_line ?? null);
  const contractValue = input.contract_value ?? null;
  const hourlyRate = input.hourly_rate ?? null;
  if ((contractValue !== null || hourlyRate !== null) && currency === null) throw new Error(AMOUNTS_NEED_CURRENCY);

  const progressMode: ProgressMode = input.progress_mode ?? "manual";
  const tuningDays = input.tuning_days ?? (await getAppSettings()).default_tuning_days;
  const includeCommercial = options.includeCommercial === true;

  return transaction(async (tx) => {
    const siblingParams = new Params();
    const positionRow = await tx.queryOne<{ next: number }>(
      `SELECT (COALESCE(MAX(position), -1) + 1)::int AS next FROM projects
        WHERE ${parentMatch(parentId, siblingParams)}`,
      siblingParams.values,
    );
    const nextPosition = positionRow?.next ?? 0;

    const columns: [string, SqlParam][] = [
      ["id", id],
      ["parent_id", parentId],
      ["name", input.name.trim()],
      ["description", (input.description ?? "").trim()],
      ["status", status],
      ["priority", priority],
      ["owner_id", emptyToNull(input.owner_id)],
      ["start_date", emptyToNull(input.start_date)],
      ["due_date", emptyToNull(input.due_date)],
      ["progress", clampProgress(input.progress ?? 0)],
      ["color", emptyToNull(input.color)],
      ["position", nextPosition],
      ["created_by", createdBy],
      ["created_at", now],
      ["updated_at", now],
      ["completed_at", status === "completed" ? now : null],
      ["client_id", clientId],
      ["service_line", serviceLine],
      ["engagement_type", input.engagement_type ?? null],
      ["currency", currency],
      ["contract_value", contractValue],
      ["hourly_rate", hourlyRate],
      ["delivery_state", input.delivery_state ?? "not_started"],
      ["progress_mode", progressMode],
      ["budget_hours", input.budget_hours ?? null],
      ["budget_period", input.budget_period ?? "total"],
      ["tuning_days", tuningDays],
      ["template_key", emptyToNull(input.template_key)],
      ["source_project_id", emptyToNull(input.source_project_id)],
    ];
    const created = await tx.queryOne<ProjectRow>(
      `INSERT INTO projects (${columns.map(([column]) => column).join(", ")})
       VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})
       RETURNING ${RETURNING_COLUMNS}`,
      columns.map(([, value]) => value),
    );
    if (!created) throw new Error("Could not create the project.");

    if (input.member_ids && input.member_ids.length > 0) {
      await replaceMembers(id, input.member_ids, now, tx);
    }
    if (input.label_ids && input.label_ids.length > 0) {
      await setProjectLabels(id, input.label_ids, tx);
    }
    if (options.afterInsert) {
      await options.afterInsert(tx, toProject(created, includeCommercial));
    }
    if (progressMode !== "manual") {
      await recomputeProjectProgress(id, tx);
      const refreshed = await getProjectRow(id, tx);
      if (refreshed) return toProject(refreshed, includeCommercial);
    }
    return toProject(created, includeCommercial);
  });
}

/**
 * Updates only the provided keys (v1 and v2 fields). Maintains `completed_at`;
 * replaces members / labels when `member_ids` / `label_ids` are given;
 * switching `progress_mode` to a derived mode recomputes progress (`progress`
 * in the patch is applied only while the mode is manual). A `currency` change
 * or clear is refused while a phase price is set, or while a project amount is
 * set that the same patch does not restate (or clear). Amounts need a
 * resulting currency. The returned row is stripped unless includeCommercial.
 */
export async function updateProject(
  id: string,
  patch: UpdateProjectFullInput,
  options: ProjectQueryOptions = {},
): Promise<Project> {
  const now = nowISO();
  const includeCommercial = options.includeCommercial === true;

  return transaction(async (tx) => {
    // Lock the row so the completed_at and currency decisions below cannot race another update.
    const existing = await getProjectRow(id, tx, true);
    if (!existing) throw new Error("This project no longer exists.");

    const sets: string[] = [];
    const params = new Params();
    const set = (column: string, value: SqlParam) => sets.push(`${column} = ${params.add(value)}`);

    if (patch.name !== undefined) set("name", patch.name.trim());
    if (patch.description !== undefined) set("description", patch.description.trim());
    if (patch.status !== undefined) {
      set("status", patch.status);
      // completed_at mirrors the status: stamped on entry, cleared on exit.
      if (patch.status === "completed" && !existing.completed_at) {
        set("completed_at", now);
      } else if (patch.status !== "completed" && existing.completed_at) {
        sets.push("completed_at = NULL");
      }
    }
    if (patch.priority !== undefined) set("priority", patch.priority);
    if (patch.owner_id !== undefined) set("owner_id", emptyToNull(patch.owner_id));
    if (patch.start_date !== undefined) set("start_date", emptyToNull(patch.start_date));
    if (patch.due_date !== undefined) set("due_date", emptyToNull(patch.due_date));
    if (patch.color !== undefined) set("color", emptyToNull(patch.color));

    if (patch.client_id !== undefined) {
      const clientId = emptyToNull(patch.client_id);
      if (clientId && clientId !== existing.client_id && (await clientCurrency(clientId, tx)) === undefined) {
        throw new Error("The selected client no longer exists.");
      }
      set("client_id", clientId);
    }
    if (patch.service_line !== undefined) set("service_line", patch.service_line);
    if (patch.engagement_type !== undefined) set("engagement_type", patch.engagement_type);
    if (patch.delivery_state !== undefined) set("delivery_state", patch.delivery_state);
    if (patch.budget_hours !== undefined) set("budget_hours", patch.budget_hours);
    if (patch.budget_period !== undefined) set("budget_period", patch.budget_period);

    // Currency travels with every amount of the project (contract value, hourly rate, phase prices).
    const nextCurrency = patch.currency !== undefined ? patch.currency : existing.currency;
    if (patch.currency !== undefined && patch.currency !== existing.currency) {
      const priced = await tx.queryOne<{ priced: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM milestones WHERE project_id = $1 AND price IS NOT NULL) AS priced",
        [id],
      );
      const unrestated =
        (existing.contract_value !== null && patch.contract_value === undefined) ||
        (existing.hourly_rate !== null && patch.hourly_rate === undefined);
      if (priced?.priced || unrestated) throw new Error(CURRENCY_LOCKED);
    }
    const nextContract = patch.contract_value !== undefined ? patch.contract_value : existing.contract_value;
    const nextHourly = patch.hourly_rate !== undefined ? patch.hourly_rate : existing.hourly_rate;
    if ((nextContract !== null || nextHourly !== null) && nextCurrency === null) throw new Error(AMOUNTS_NEED_CURRENCY);
    if (patch.currency !== undefined) set("currency", patch.currency);
    if (patch.contract_value !== undefined) set("contract_value", patch.contract_value);
    if (patch.hourly_rate !== undefined) set("hourly_rate", patch.hourly_rate);

    const nextMode: ProgressMode = patch.progress_mode ?? existing.progress_mode;
    if (patch.progress_mode !== undefined) set("progress_mode", patch.progress_mode);
    if (patch.progress !== undefined && nextMode === "manual") set("progress", clampProgress(patch.progress));

    set("updated_at", now);
    const updated = await tx.queryOne<ProjectRow>(
      `UPDATE projects SET ${sets.join(", ")} WHERE id = ${params.add(id)}
       RETURNING ${RETURNING_COLUMNS}`,
      params.values,
    );
    if (!updated) throw new Error("This project no longer exists.");

    if (patch.member_ids !== undefined) {
      await replaceMembers(id, patch.member_ids, now, tx);
    }
    if (patch.label_ids !== undefined) {
      await setProjectLabels(id, patch.label_ids, tx);
    }
    if (patch.progress_mode !== undefined && nextMode !== "manual") {
      await recomputeProjectProgress(id, tx);
      const refreshed = await getProjectRow(id, tx);
      if (refreshed) return toProject(refreshed, includeCommercial);
    }
    return toProject(updated, includeCommercial);
  });
}

/**
 * Deletes the project; sub-projects, members, comments, tasks, phases,
 * attachments and the rest go with it via ON DELETE CASCADE. Returns the
 * Vercel Blob URLs of every file attachment in the subtree (collected in the
 * same transaction) so the action can delete the blobs after the commit.
 */
export async function deleteProject(id: string): Promise<{ blob_urls: string[] }> {
  return transaction(async (tx) => {
    const rows = await tx.query<{ url: string }>(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id FROM projects WHERE id = $1
         UNION ALL
         SELECT p.id FROM projects p JOIN subtree s ON p.parent_id = s.id
       )
       SELECT a.url FROM attachments a
        WHERE a.kind = 'file' AND a.project_id IN (SELECT id FROM subtree)`,
      [id],
    );
    await tx.execute("DELETE FROM projects WHERE id = $1", [id]);
    return { blob_urls: rows.map((row) => row.url) };
  });
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

/* ----------------------------- Bulk updates ----------------------------- */

/**
 * Applies one patch to many projects in a single transaction (at most
 * MAX_BULK_IDS). Status changes maintain `completed_at`; labels are added /
 * removed without touching the rest of each set. Only projects that actually
 * changed are reported (`per_project` is 1 for each); the task arrays are empty.
 */
export async function bulkUpdateProjects(ids: string[], patch: BulkProjectPatch): Promise<BulkResult> {
  const unique = Array.from(new Set(ids.filter((id) => id.trim() !== "")));
  if (unique.length > MAX_BULK_IDS) throw new Error(`Select at most ${MAX_BULK_IDS} projects at a time.`);
  const result: BulkResult = {
    updated: 0,
    project_ids: [],
    per_project: {},
    task_ids: [],
    newly_assigned_ids: [],
    completed_ids: [],
  };
  if (unique.length === 0) return result;
  const now = nowISO();

  const changed = await transaction(async (tx) => {
    const touched = new Set<string>();
    const params = new Params();
    const idsParam = params.add(unique);
    const sets: string[] = [];
    const differs: string[] = [];

    if (patch.status !== undefined) {
      const status = params.add(patch.status);
      sets.push(
        `status = ${status}`,
        `completed_at = CASE WHEN ${status} = 'completed' THEN COALESCE(completed_at, ${params.add(now)}) ELSE NULL END`,
      );
      differs.push(`status IS DISTINCT FROM ${status}`);
    }
    if (patch.owner_id !== undefined) {
      const owner = params.add(emptyToNull(patch.owner_id));
      sets.push(`owner_id = ${owner}::text`);
      differs.push(`owner_id IS DISTINCT FROM ${owner}::text`);
    }
    if (patch.priority !== undefined) {
      const priority = params.add(patch.priority);
      sets.push(`priority = ${priority}`);
      differs.push(`priority IS DISTINCT FROM ${priority}`);
    }
    if (sets.length > 0) {
      const rows = await tx.query<{ id: string }>(
        `UPDATE projects SET ${sets.join(", ")}, updated_at = ${params.add(now)}
          WHERE id = ANY(${idsParam}::text[]) AND (${differs.join(" OR ")})
          RETURNING id`,
        params.values,
      );
      for (const row of rows) touched.add(row.id);
    }

    const labelTouched = new Set<string>();
    const addIds = Array.from(new Set(patch.add_label_ids ?? []));
    if (addIds.length > 0) {
      const rows = await tx.query<{ project_id: string }>(
        `INSERT INTO project_labels (project_id, label_id, created_at)
         SELECT p.id, l.id, $3 FROM projects p CROSS JOIN labels l
          WHERE p.id = ANY($1::text[]) AND l.id = ANY($2::text[])
         ON CONFLICT (project_id, label_id) DO NOTHING
         RETURNING project_id`,
        [unique, addIds, now],
      );
      for (const row of rows) labelTouched.add(row.project_id);
    }
    const removeIds = Array.from(new Set(patch.remove_label_ids ?? []));
    if (removeIds.length > 0) {
      const rows = await tx.query<{ project_id: string }>(
        `DELETE FROM project_labels
          WHERE project_id = ANY($1::text[]) AND label_id = ANY($2::text[])
          RETURNING project_id`,
        [unique, removeIds],
      );
      for (const row of rows) labelTouched.add(row.project_id);
    }
    const bumpOnly = [...labelTouched].filter((id) => !touched.has(id));
    if (bumpOnly.length > 0) {
      await tx.execute("UPDATE projects SET updated_at = $2 WHERE id = ANY($1::text[])", [bumpOnly, now]);
    }
    for (const id of labelTouched) touched.add(id);
    return unique.filter((id) => touched.has(id));
  });

  result.updated = changed.length;
  result.project_ids = changed;
  for (const id of changed) result.per_project[id] = 1;
  return result;
}

/* ------------------------------- Summaries ------------------------------ */

const SUMMARY_SELECT = `
  SELECT p.id, p.name, p.color, p.status, cl.code AS client_code
    FROM projects p
    LEFT JOIN clients cl ON cl.id = p.client_id`;

/** Minimal reference (pickers, links). */
export async function getProjectSummary(id: string): Promise<ProjectSummary | null> {
  return db.queryOne<ProjectSummary>(`${SUMMARY_SELECT} WHERE p.id = $1`, [id]);
}

/** Projects at every depth by name, for pickers (timer, log time, calendar quick create). */
export async function listProjectSummaries(
  filters: { openOnly?: boolean; memberId?: string; clientId?: string } = {},
): Promise<ProjectSummary[]> {
  const params = new Params();
  const where: string[] = [];
  if (filters.openOnly) where.push(`p.status = ANY(${params.add(OPEN_STATUSES)}::text[])`);
  if (filters.memberId) {
    const member = params.add(filters.memberId);
    where.push(
      `(p.owner_id = ${member} OR p.created_by = ${member} OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${member}
       ))`,
    );
  }
  if (filters.clientId) where.push(`p.client_id = ${params.add(filters.clientId)}`);
  return db.query<ProjectSummary>(
    `${SUMMARY_SELECT} ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY lower(p.name) ASC, p.created_at ASC`,
    params.values,
  );
}

/* -------------------------------- Stats --------------------------------- */

/**
 * Counts for the dashboard. `today` is the workspace date (callers usually
 * pass the one they already computed); it defaults to getWorkspaceToday().
 */
export async function getProjectStats(
  scope: "top_level" | "all" = "top_level",
  today?: string,
): Promise<ProjectStats> {
  const scopeWhere = scope === "all" ? "TRUE" : "p.parent_id IS NULL";
  const day = today ?? (await getWorkspaceToday());
  const weekEnd = addDaysISO(day, 7);
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
      [OPEN_STATUSES, day, weekEnd, thirtyDaysAgo],
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
export async function listUpcomingDeadlines(
  limit = 8,
  options: ProjectQueryOptions = {},
): Promise<ProjectWithMeta[]> {
  const params = new Params();
  return queryWithMeta(
    `p.status = ANY(${params.add(OPEN_STATUSES)}::text[]) AND p.due_date IS NOT NULL`,
    params,
    `p.due_date ASC, ${PRIORITY_RANK} ASC, p.updated_at DESC`,
    { limit, includeCommercial: options.includeCommercial },
  );
}

/** Open projects where the user is owner, creator or member, most recently updated first. */
export async function listMyProjects(
  userId: string,
  limit = 8,
  options: ProjectQueryOptions = {},
): Promise<ProjectWithMeta[]> {
  return listProjects({ memberId: userId, status: OPEN_STATUSES, sort: "updated", limit }, options);
}
