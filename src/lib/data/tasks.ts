import { db, newId, nowISO, transaction, type Queryable, type SqlParam } from "@/lib/db";
import {
  MAX_BULK_IDS,
  MAX_ENTRY_MINUTES,
  OPEN_TASK_STATUSES,
  PRIORITY_ORDER,
  TASK_DETAIL_ACTIVITY_LIMIT,
  TASK_POSITION_STEP,
} from "@/lib/constants";
import type {
  BulkDeleteResult,
  BulkResult,
  BulkTaskPatch,
  CreateTaskInput,
  LabelSummary,
  MilestoneKind,
  MoveTaskInput,
  MyTaskFilters,
  MyTaskGroup,
  Priority,
  ProgressMode,
  ProjectStatus,
  TaskChecklistItem,
  TaskDetail,
  TaskFilters,
  TaskRef,
  TaskSort,
  TaskStatus,
  TaskWithMeta,
  UpdateTaskInput,
  UserSummary,
} from "@/lib/types";
import { likeContains, needsRebalance, parseTaskKey, positionBetween, taskKey } from "@/lib/utils";
import { addDaysISO, startOfWeekISO } from "@/lib/workspace-time";
import { listTaskActivity } from "./activity";

/* ------------------------------ Row shapes ------------------------------ */

interface TaskRow {
  id: string;
  number: number;
  project_id: string;
  milestone_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee_id: string | null;
  start_date: string | null;
  due_date: string | null;
  estimate_minutes: number | null;
  is_deliverable: boolean;
  approved_by_name: string | null;
  approved_on: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface TaskMetaRow extends TaskRow {
  assignee_name: string | null;
  assignee_email: string | null;
  assignee_color: string | null;
  assignee_job_title: string | null;
  project_name: string;
  project_color: string | null;
  project_status: ProjectStatus;
  client_code: string | null;
  milestone_name: string | null;
  milestone_kind: MilestoneKind | null;
  checklist_total: number;
  checklist_done: number;
  subtask_count: number;
  subtask_done_count: number;
  comment_count: number;
  attachment_count: number;
  is_blocked: boolean;
  logged_minutes: number;
}

interface TaskRefRow {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  project_id: string;
}

interface TaskLabelRow extends LabelSummary {
  task_id: string;
}

interface ChecklistRow {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/* ------------------------------ SQL pieces ------------------------------ */

const TASK_COLUMNS = `t.id, t.number, t.project_id, t.milestone_id, t.parent_task_id, t.title,
  t.description, t.status, t.priority, t.assignee_id, t.start_date, t.due_date, t.estimate_minutes,
  t.is_deliverable, t.approved_by_name, t.approved_on, t.position, t.created_by, t.created_at,
  t.updated_at, t.completed_at`;

/**
 * Every hydrated field in one statement: joins for assignee, project (+ client
 * code) and milestone; LATERAL aggregates for checklist and subtask counts;
 * scalar subqueries for comments, attachments, blockers and logged minutes.
 * Labels are attached afterwards with one grouped query (no per-row queries).
 */
const TASK_META_SELECT = `
  SELECT ${TASK_COLUMNS},
         a.name AS assignee_name, a.email AS assignee_email, a.color AS assignee_color,
         a.job_title AS assignee_job_title,
         p.name AS project_name, p.color AS project_color, p.status AS project_status,
         cl.code AS client_code,
         m.name AS milestone_name, m.kind AS milestone_kind,
         ck.total AS checklist_total, ck.done AS checklist_done,
         st.total AS subtask_count, st.done AS subtask_done_count,
         (SELECT COUNT(*)::int FROM comments c WHERE c.task_id = t.id) AS comment_count,
         (SELECT COUNT(*)::int FROM attachments att WHERE att.task_id = t.id) AS attachment_count,
         EXISTS (
           SELECT 1 FROM task_dependencies d
             JOIN tasks b ON b.id = d.blocked_by_id
            WHERE d.task_id = t.id AND b.status NOT IN ('done', 'cancelled')
         ) AS is_blocked,
         (SELECT COALESCE(SUM(te.minutes), 0)::int FROM time_entries te WHERE te.task_id = t.id)
           AS logged_minutes
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN clients cl ON cl.id = p.client_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN milestones m ON m.id = t.milestone_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ci.done)::int AS done
        FROM task_checklist_items ci
       WHERE ci.task_id = t.id
    ) ck ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE s.status <> 'cancelled')::int AS total,
             COUNT(*) FILTER (WHERE s.status = 'done')::int AS done
        FROM tasks s
       WHERE s.parent_task_id = t.id
    ) st ON TRUE`;

/** urgent -> 0 ... low -> 3, built from the PRIORITY_ORDER constant (never user input). */
const PRIORITY_RANK = `CASE t.priority ${PRIORITY_ORDER.map((value, index) => `WHEN '${value}' THEN ${index}`).join(" ")} ELSE ${PRIORITY_ORDER.length} END`;

const ORDER_BY: Record<TaskSort, string> = {
  position: "t.position ASC, t.number ASC",
  due_date: "t.due_date ASC NULLS LAST, t.position ASC, t.number ASC",
  priority: `${PRIORITY_RANK} ASC, t.position ASC, t.number ASC`,
  updated: "t.updated_at DESC, t.number DESC",
  created: "t.created_at DESC, t.number DESC",
  number: "t.number ASC",
};

const LABEL_GROUP_RANK = "CASE l.label_group WHEN 'tech' THEN 0 WHEN 'domain' THEN 1 ELSE 2 END";

/** Collects bound values and hands out their `$n` placeholders. */
class Params {
  readonly values: SqlParam[] = [];

  add(value: SqlParam): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

function asList<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
}

function emptyToNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value.trim() === "" ? null : value;
}

/* ------------------------------ Hydration ------------------------------- */

function toTaskRef(row: TaskRefRow): TaskRef {
  return {
    id: row.id,
    number: row.number,
    key: taskKey(row.number),
    title: row.title,
    status: row.status,
    project_id: row.project_id,
  };
}

function toChecklistItem(row: ChecklistRow): TaskChecklistItem {
  return {
    id: row.id,
    task_id: row.task_id,
    title: row.title,
    done: row.done,
    position: row.position,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toTaskWithMeta(row: TaskMetaRow, labels: LabelSummary[]): TaskWithMeta {
  const assignee: UserSummary | null =
    row.assignee_id && row.assignee_name !== null
      ? {
          id: row.assignee_id,
          name: row.assignee_name,
          email: row.assignee_email ?? "",
          color: row.assignee_color ?? "#64748b",
          job_title: row.assignee_job_title,
        }
      : null;
  return {
    id: row.id,
    number: row.number,
    key: taskKey(row.number),
    project_id: row.project_id,
    milestone_id: row.milestone_id,
    parent_task_id: row.parent_task_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee_id: row.assignee_id,
    start_date: row.start_date,
    due_date: row.due_date,
    estimate_minutes: row.estimate_minutes,
    is_deliverable: row.is_deliverable,
    approved_by_name: row.approved_by_name,
    approved_on: row.approved_on,
    position: row.position,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    assignee,
    project: {
      id: row.project_id,
      name: row.project_name,
      color: row.project_color,
      status: row.project_status,
      client_code: row.client_code,
    },
    milestone:
      row.milestone_id && row.milestone_name !== null
        ? { id: row.milestone_id, name: row.milestone_name, kind: row.milestone_kind ?? "phase" }
        : null,
    labels,
    checklist_total: row.checklist_total ?? 0,
    checklist_done: row.checklist_done ?? 0,
    subtask_count: row.subtask_count ?? 0,
    subtask_done_count: row.subtask_done_count ?? 0,
    comment_count: row.comment_count,
    attachment_count: row.attachment_count,
    is_blocked: row.is_blocked,
    logged_minutes: row.logged_minutes,
  };
}

async function fetchLabelsByTask(taskIds: string[], q: Queryable): Promise<Map<string, LabelSummary[]>> {
  const result = new Map<string, LabelSummary[]>();
  if (taskIds.length === 0) return result;
  const rows = await q.query<TaskLabelRow>(
    `SELECT tl.task_id, l.id, l.name, l.color, l.label_group
       FROM task_labels tl
       JOIN labels l ON l.id = tl.label_id
      WHERE tl.task_id = ANY($1::text[])
      ORDER BY ${LABEL_GROUP_RANK}, lower(l.name) ASC`,
    [taskIds],
  );
  for (const row of rows) {
    const list = result.get(row.task_id) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color, label_group: row.label_group });
    result.set(row.task_id, list);
  }
  return result;
}

/** Runs the hydrated SELECT with a WHERE (placeholders from `params`) and attaches labels. */
async function queryTasks(
  where: string[],
  params: Params,
  orderBy: string,
  limit: number | undefined,
  q: Queryable = db,
): Promise<TaskWithMeta[]> {
  let sql = `${TASK_META_SELECT}${where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${orderBy}`;
  if (limit !== undefined && Number.isFinite(limit) && limit > 0) {
    sql += ` LIMIT ${params.add(Math.floor(limit))}`;
  }
  const rows = await q.query<TaskMetaRow>(sql, params.values);
  if (rows.length === 0) return [];
  const labels = await fetchLabelsByTask(
    rows.map((row) => row.id),
    q,
  );
  return rows.map((row) => toTaskWithMeta(row, labels.get(row.id) ?? []));
}

async function getTaskWith(id: string, q: Queryable = db): Promise<TaskWithMeta | null> {
  const params = new Params();
  const [task] = await queryTasks([`t.id = ${params.add(id)}`], params, ORDER_BY.number, undefined, q);
  return task ?? null;
}

async function listTaskRefsWhere(where: string, values: SqlParam[], q: Queryable = db): Promise<TaskRef[]> {
  const rows = await q.query<TaskRefRow>(
    `SELECT t.id, t.number, t.title, t.status, t.project_id FROM tasks t WHERE ${where} ORDER BY t.number ASC`,
    values,
  );
  return rows.map(toTaskRef);
}

/* ------------------------------- Progress ------------------------------- */

interface ProgressInputsRow {
  progress_mode: ProgressMode;
  task_total: number;
  task_done: number;
  phase_total: number;
  phase_done: number;
  units_target: number;
  units_accepted: number;
}

/**
 * Derives a project's progress from its `progress_mode` (SPEC §16) and writes
 * `projects.progress` without bumping `updated_at`. Returns the new value, or
 * null for manual projects (left untouched). Call it inside the transaction
 * of any write that changes tasks, phases or batches (pass `q`).
 */
export async function recomputeProjectProgress(projectId: string, q: Queryable = db): Promise<number | null> {
  const row = await q.queryOne<ProgressInputsRow>(
    `SELECT p.progress_mode,
            (SELECT COUNT(*) FILTER (WHERE t.status <> 'cancelled')::int FROM tasks t WHERE t.project_id = p.id)
              AS task_total,
            (SELECT COUNT(*) FILTER (WHERE t.status = 'done')::int FROM tasks t WHERE t.project_id = p.id)
              AS task_done,
            (SELECT COUNT(*) FILTER (WHERE m.status <> 'stopped')::int FROM milestones m
              WHERE m.project_id = p.id AND m.kind = 'phase') AS phase_total,
            (SELECT COUNT(*) FILTER (WHERE m.status = 'done')::int FROM milestones m
              WHERE m.project_id = p.id AND m.kind = 'phase') AS phase_done,
            (SELECT COALESCE(SUM(b.units_target), 0)::float8 FROM data_batches b WHERE b.project_id = p.id)
              AS units_target,
            (SELECT COALESCE(SUM(b.units_accepted), 0)::float8 FROM data_batches b WHERE b.project_id = p.id)
              AS units_accepted
       FROM projects p
      WHERE p.id = $1`,
    [projectId],
  );
  if (!row || row.progress_mode === "manual") return null;

  let progress = 0;
  if (row.progress_mode === "tasks") {
    progress = row.task_total > 0 ? Math.round((100 * row.task_done) / row.task_total) : 0;
  } else if (row.progress_mode === "milestones") {
    progress = row.phase_total > 0 ? Math.round((100 * row.phase_done) / row.phase_total) : 0;
  } else if (row.progress_mode === "batches") {
    progress = row.units_target > 0 ? Math.min(100, Math.round((100 * row.units_accepted) / row.units_target)) : 0;
  }
  progress = Math.min(100, Math.max(0, progress));

  await q.execute("UPDATE projects SET progress = $2 WHERE id = $1 AND progress <> $2", [projectId, progress]);
  return progress;
}

/* -------------------------------- Reads --------------------------------- */

/**
 * Tasks matching `filters` (see TaskFilters), hydrated as TaskWithMeta.
 * Default sort "position" (board order, then number).
 */
export async function listTasks(filters: TaskFilters = {}, q: Queryable = db): Promise<TaskWithMeta[]> {
  const where: string[] = [];
  const params = new Params();

  if (filters.projectId) where.push(`t.project_id = ${params.add(filters.projectId)}`);
  if (filters.projectIds !== undefined) {
    where.push(`t.project_id = ANY(${params.add(unique(filters.projectIds))}::text[])`);
  }
  if (filters.clientId) where.push(`p.client_id = ${params.add(filters.clientId)}`);

  if (filters.milestoneId === null) where.push("t.milestone_id IS NULL");
  else if (typeof filters.milestoneId === "string") where.push(`t.milestone_id = ${params.add(filters.milestoneId)}`);

  if (filters.parentTaskId === null) where.push("t.parent_task_id IS NULL");
  else if (typeof filters.parentTaskId === "string") {
    where.push(`t.parent_task_id = ${params.add(filters.parentTaskId)}`);
  }

  if (filters.assigneeId === null) where.push("t.assignee_id IS NULL");
  else if (typeof filters.assigneeId === "string") where.push(`t.assignee_id = ${params.add(filters.assigneeId)}`);

  if (filters.createdBy) where.push(`t.created_by = ${params.add(filters.createdBy)}`);

  // An empty list (nothing ticked in a filter UI) means "no constraint".
  const statuses = asList(filters.status);
  if (statuses.length > 0) where.push(`t.status = ANY(${params.add(statuses)}::text[])`);
  const priorities = asList(filters.priority);
  if (priorities.length > 0) where.push(`t.priority = ANY(${params.add(priorities)}::text[])`);

  const labelIds = unique(filters.labelIds ?? []);
  if (labelIds.length > 0) {
    where.push(
      `EXISTS (SELECT 1 FROM task_labels tl WHERE tl.task_id = t.id AND tl.label_id = ANY(${params.add(labelIds)}::text[]))`,
    );
  }

  if (filters.isDeliverable !== undefined) where.push(`t.is_deliverable = ${params.add(filters.isDeliverable)}`);

  const search = filters.search?.trim();
  if (search) {
    const pattern = params.add(likeContains(search));
    const number = parseTaskKey(search);
    const text = `t.title ILIKE ${pattern} ESCAPE '\\' OR t.description ILIKE ${pattern} ESCAPE '\\'`;
    where.push(number !== null ? `(${text} OR t.number = ${params.add(number)})` : `(${text})`);
  }

  if (filters.dueFrom) where.push(`t.due_date >= ${params.add(filters.dueFrom)}`);
  if (filters.dueTo) where.push(`t.due_date <= ${params.add(filters.dueTo)}`);
  if (filters.hasDueDate === true) where.push("t.due_date IS NOT NULL");
  if (filters.hasDueDate === false) where.push("t.due_date IS NULL");

  if (filters.ids !== undefined) where.push(`t.id = ANY(${params.add(unique(filters.ids))}::text[])`);

  const orderBy = ORDER_BY[filters.sort ?? "position"] ?? ORDER_BY.position;
  return queryTasks(where, params, orderBy, filters.limit, q);
}

export async function getTask(id: string): Promise<TaskWithMeta | null> {
  return getTaskWith(id);
}

export async function getTaskByNumber(number: number): Promise<TaskWithMeta | null> {
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  const params = new Params();
  const [task] = await queryTasks([`t.number = ${params.add(number)}`], params, ORDER_BY.number, undefined);
  return task ?? null;
}

export async function getTaskByKey(key: string): Promise<TaskWithMeta | null> {
  const number = parseTaskKey(key);
  return number === null ? null : getTaskByNumber(number);
}

/** Bucket of an open task for My tasks (SPEC §17.2): this_week runs to the end of the ISO week. */
function myTaskGroupOf(dueDate: string | null, today: string): MyTaskGroup {
  if (!dueDate) return "no_date";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  const weekEnd = addDaysISO(startOfWeekISO(today), 6);
  return dueDate <= weekEnd ? "this_week" : "later";
}

const PRIORITY_INDEX: Record<Priority, number> = Object.fromEntries(
  PRIORITY_ORDER.map((value, index) => [value, index]),
) as Record<Priority, number>;

/**
 * Open tasks assigned to (or created by) `userId`, grouped by due date
 * relative to the workspace `today`: overdue, today, this_week (tomorrow to
 * the end of the ISO week), later and no_date. Dated groups are sorted by due
 * date then priority; no_date by priority then number.
 */
export async function listMyTasks(
  userId: string,
  scope: "assigned" | "created",
  today: string,
  filters: MyTaskFilters = {},
): Promise<Record<MyTaskGroup, TaskWithMeta[]>> {
  const tasks = await listTasks({
    ...(scope === "assigned" ? { assigneeId: userId } : { createdBy: userId }),
    status: OPEN_TASK_STATUSES,
    labelIds: filters.labelIds,
    projectId: filters.projectId,
    sort: "due_date",
  });
  const groups: Record<MyTaskGroup, TaskWithMeta[]> = {
    overdue: [],
    today: [],
    this_week: [],
    later: [],
    no_date: [],
  };
  for (const task of tasks) groups[myTaskGroupOf(task.due_date, today)].push(task);
  const byDueThenPriority = (a: TaskWithMeta, b: TaskWithMeta) =>
    (a.due_date ?? "").localeCompare(b.due_date ?? "") ||
    PRIORITY_INDEX[a.priority] - PRIORITY_INDEX[b.priority] ||
    a.number - b.number;
  for (const key of ["overdue", "today", "this_week", "later"] as const) groups[key].sort(byDueThenPriority);
  groups.no_date.sort((a, b) => PRIORITY_INDEX[a.priority] - PRIORITY_INDEX[b.priority] || a.number - b.number);
  return groups;
}

interface CreatorRow {
  id: string;
  name: string;
  email: string;
  color: string;
  job_title: string | null;
}

/** TaskWithMeta plus creator, parent, checklist, subtasks, dependencies and recent activity. */
export async function getTaskDetail(id: string): Promise<TaskDetail | null> {
  const task = await getTaskWith(id);
  if (!task) return null;

  const [creator, parentRefs, checklist, subtasks, blockedBy, blocking, activity] = await Promise.all([
    db.queryOne<CreatorRow>("SELECT id, name, email, color, job_title FROM users WHERE id = $1", [task.created_by]),
    task.parent_task_id ? listTaskRefsWhere("t.id = $1", [task.parent_task_id]) : Promise.resolve([]),
    db.query<ChecklistRow>(
      `SELECT id, task_id, title, done, position, completed_at, created_at, updated_at
         FROM task_checklist_items WHERE task_id = $1 ORDER BY position ASC, created_at ASC, id ASC`,
      [id],
    ),
    listTasks({ parentTaskId: id, sort: "number" }),
    listTaskRefsWhere("t.id IN (SELECT blocked_by_id FROM task_dependencies WHERE task_id = $1)", [id]),
    listTaskRefsWhere("t.id IN (SELECT task_id FROM task_dependencies WHERE blocked_by_id = $1)", [id]),
    listTaskActivity(id, TASK_DETAIL_ACTIVITY_LIMIT),
  ]);

  return {
    ...task,
    creator: creator
      ? { id: creator.id, name: creator.name, email: creator.email, color: creator.color, job_title: creator.job_title }
      : null,
    parent: parentRefs[0] ?? null,
    checklist: checklist.map(toChecklistItem),
    subtasks,
    blocked_by: blockedBy,
    blocking,
    activity,
  };
}

/** Who may delete a task: its creator and the project owner (plus admins, checked by the caller). */
export interface TaskAccess {
  task_id: string;
  project_id: string;
  number: number;
  title: string;
  created_by: string;
  project_owner_id: string | null;
}

export async function getTaskAccess(id: string): Promise<TaskAccess | null> {
  return db.queryOne<TaskAccess>(
    `SELECT t.id AS task_id, t.project_id, t.number, t.title, t.created_by, p.owner_id AS project_owner_id
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.id = $1`,
    [id],
  );
}

/** Access rows for many tasks at once (bulk permission checks). */
export async function listTaskAccess(ids: string[]): Promise<TaskAccess[]> {
  const list = unique(ids);
  if (list.length === 0) return [];
  return db.query<TaskAccess>(
    `SELECT t.id AS task_id, t.project_id, t.number, t.title, t.created_by, p.owner_id AS project_owner_id
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.id = ANY($1::text[])`,
    [list],
  );
}

/** Tasks that list `taskId` as a blocker (for "blocker cleared" notifications). */
export async function listTasksBlockedBy(taskId: string): Promise<TaskRef[]> {
  return listTaskRefsWhere("t.id IN (SELECT task_id FROM task_dependencies WHERE blocked_by_id = $1)", [taskId]);
}

/**
 * Parent task keys for the subtasks in `tasks`, as `{ [parent_task_id]: "PRX-n" }`
 * (lists that mix subtasks with top-level tasks label them "Subtask of PRX-n").
 */
export async function listParentTaskKeys(
  tasks: ReadonlyArray<Pick<TaskWithMeta, "parent_task_id">>,
): Promise<Record<string, string>> {
  const ids = unique(tasks.flatMap((task) => (task.parent_task_id ? [task.parent_task_id] : [])));
  if (ids.length === 0) return {};
  const refs = await listTaskRefsWhere("t.id = ANY($1::text[])", [ids]);
  return Object.fromEntries(refs.map((ref) => [ref.id, ref.key]));
}

/* ------------------------------ Validation ------------------------------ */

async function assertMilestoneInProject(q: Queryable, milestoneId: string, projectId: string): Promise<void> {
  const row = await q.queryOne<{ project_id: string }>("SELECT project_id FROM milestones WHERE id = $1", [
    milestoneId,
  ]);
  if (!row) throw new Error("That phase no longer exists.");
  if (row.project_id !== projectId) throw new Error("Pick a phase from this task's project.");
}

async function assertActiveUser(q: Queryable, userId: string): Promise<void> {
  const row = await q.queryOne<{ id: string }>("SELECT id FROM users WHERE id = $1 AND is_active", [userId]);
  if (!row) throw new Error("Pick an active team member as the assignee.");
}

function assertDateOrder(startDate: string | null, dueDate: string | null): void {
  if (startDate && dueDate && dueDate < startDate) {
    throw new Error("The due date can't be before the start date.");
  }
}

async function columnEnd(q: Queryable, projectId: string, status: TaskStatus, excludeId?: string): Promise<number> {
  const row = await q.queryOne<{ max: number | null }>(
    `SELECT MAX(position)::float8 AS max FROM tasks
      WHERE project_id = $1 AND status = $2${excludeId ? " AND id <> $3" : ""}`,
    excludeId ? [projectId, status, excludeId] : [projectId, status],
  );
  return positionBetween(row?.max ?? null, null);
}

async function replaceTaskLabels(q: Queryable, taskId: string, labelIds: string[], now: string): Promise<void> {
  const ids = unique(labelIds);
  await q.execute("DELETE FROM task_labels WHERE task_id = $1 AND NOT (label_id = ANY($2::text[]))", [taskId, ids]);
  if (ids.length > 0) {
    await q.execute(
      `INSERT INTO task_labels (task_id, label_id, created_at)
       SELECT $1, l.id, $3 FROM labels l WHERE l.id = ANY($2::text[])
       ON CONFLICT (task_id, label_id) DO NOTHING`,
      [taskId, ids, now],
    );
  }
}

/* -------------------------------- Writes -------------------------------- */

/**
 * Creates a task at the end of its status column. Validates that the phase
 * belongs to the project and that a parent is a top-level task of the same
 * project (user-facing errors otherwise). Inserts labels and the initial
 * checklist and recomputes the project's progress, all in one transaction.
 */
export async function createTask(input: CreateTaskInput, createdBy: string): Promise<TaskWithMeta> {
  const id = newId();
  await transaction(async (tx) => {
    // FOR UPDATE serialises concurrent creates in a project so they never read the same column end.
    const project = await tx.queryOne<{ id: string }>("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [
      input.project_id,
    ]);
    if (!project) throw new Error("This project no longer exists.");

    const milestoneId = emptyToNull(input.milestone_id);
    if (milestoneId) await assertMilestoneInProject(tx, milestoneId, input.project_id);

    const parentId = emptyToNull(input.parent_task_id);
    if (parentId) {
      const parent = await tx.queryOne<{ project_id: string; parent_task_id: string | null }>(
        "SELECT project_id, parent_task_id FROM tasks WHERE id = $1",
        [parentId],
      );
      if (!parent) throw new Error("The parent task no longer exists.");
      if (parent.project_id !== input.project_id || parent.parent_task_id !== null) {
        throw new Error("Subtasks can only be added to a top-level task in the same project.");
      }
    }

    const assigneeId = emptyToNull(input.assignee_id);
    if (assigneeId) await assertActiveUser(tx, assigneeId);

    const startDate = emptyToNull(input.start_date);
    const dueDate = emptyToNull(input.due_date);
    assertDateOrder(startDate, dueDate);

    const status: TaskStatus = input.status ?? "todo";
    const now = nowISO();
    const position = await columnEnd(tx, input.project_id, status);

    await tx.execute(
      `INSERT INTO tasks (id, project_id, milestone_id, parent_task_id, title, description, status, priority,
                          assignee_id, start_date, due_date, estimate_minutes, is_deliverable, position,
                          created_by, created_at, updated_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16, $17)`,
      [
        id,
        input.project_id,
        milestoneId,
        parentId,
        input.title.trim(),
        input.description ?? "",
        status,
        input.priority ?? "medium",
        assigneeId,
        startDate,
        dueDate,
        input.estimate_minutes ?? null,
        input.is_deliverable ?? false,
        position,
        createdBy,
        now,
        status === "done" ? now : null,
      ],
    );

    if (input.label_ids && input.label_ids.length > 0) await replaceTaskLabels(tx, id, input.label_ids, now);

    const checklist = (input.checklist ?? []).map((title) => title.trim()).filter((title) => title.length > 0);
    for (const [index, title] of checklist.entries()) {
      await tx.execute(
        `INSERT INTO task_checklist_items (id, task_id, title, done, position, created_at, updated_at)
         VALUES ($1, $2, $3, FALSE, $4, $5, $5)`,
        [newId(), id, title, index, now],
      );
    }

    await recomputeProjectProgress(input.project_id, tx);
  });

  const task = await getTaskWith(id);
  if (!task) throw new Error("Failed to create the task.");
  return task;
}

/**
 * Updates only the provided keys. A status change maintains `completed_at`,
 * moves the task to the end of its new column and recomputes progress;
 * `label_ids` replaces the label set.
 */
export async function updateTask(id: string, patch: UpdateTaskInput): Promise<TaskWithMeta> {
  await transaction(async (tx) => {
    const current = await tx.queryOne<TaskRow>(`SELECT ${TASK_COLUMNS} FROM tasks t WHERE t.id = $1 FOR UPDATE`, [id]);
    if (!current) throw new Error("This task no longer exists.");

    const now = nowISO();
    const sets: string[] = [];
    const params = new Params();
    const set = (column: string, value: SqlParam) => sets.push(`${column} = ${params.add(value)}`);

    if (patch.title !== undefined) set("title", patch.title.trim());
    if (patch.description !== undefined) set("description", patch.description);
    if (patch.priority !== undefined) set("priority", patch.priority);
    if (patch.assignee_id !== undefined) {
      const assigneeId = emptyToNull(patch.assignee_id);
      if (assigneeId && assigneeId !== current.assignee_id) await assertActiveUser(tx, assigneeId);
      set("assignee_id", assigneeId);
    }
    if (patch.milestone_id !== undefined) {
      const milestoneId = emptyToNull(patch.milestone_id);
      if (milestoneId && milestoneId !== current.milestone_id) {
        await assertMilestoneInProject(tx, milestoneId, current.project_id);
      }
      set("milestone_id", milestoneId);
    }
    const startDate = patch.start_date !== undefined ? emptyToNull(patch.start_date) : current.start_date;
    const dueDate = patch.due_date !== undefined ? emptyToNull(patch.due_date) : current.due_date;
    if (patch.start_date !== undefined || patch.due_date !== undefined) assertDateOrder(startDate, dueDate);
    if (patch.start_date !== undefined) set("start_date", startDate);
    if (patch.due_date !== undefined) set("due_date", dueDate);
    if (patch.estimate_minutes !== undefined) set("estimate_minutes", patch.estimate_minutes);
    if (patch.is_deliverable !== undefined) set("is_deliverable", patch.is_deliverable);
    if (patch.approved_by_name !== undefined) set("approved_by_name", emptyToNull(patch.approved_by_name));
    if (patch.approved_on !== undefined) set("approved_on", emptyToNull(patch.approved_on));

    const statusChanged = patch.status !== undefined && patch.status !== current.status;
    if (statusChanged && patch.status) {
      set("status", patch.status);
      set("position", await columnEnd(tx, current.project_id, patch.status, id));
      if (patch.status === "done") set("completed_at", now);
      else if (current.status === "done") set("completed_at", null);
    }

    set("updated_at", now);
    await tx.execute(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ${params.add(id)}`, params.values);

    if (patch.label_ids !== undefined) await replaceTaskLabels(tx, id, patch.label_ids, now);
    if (statusChanged) await recomputeProjectProgress(current.project_id, tx);
  });

  const task = await getTaskWith(id);
  if (!task) throw new Error("This task no longer exists.");
  return task;
}

/** Rewrites a column's positions to multiples of TASK_POSITION_STEP (keeping order). */
async function rebalanceColumn(q: Queryable, projectId: string, status: TaskStatus, excludeId: string): Promise<void> {
  await q.execute(
    `UPDATE tasks t SET position = r.rn * ${TASK_POSITION_STEP}
       FROM (
         SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC, number ASC) AS rn
           FROM tasks WHERE project_id = $1 AND status = $2 AND id <> $3
       ) r
      WHERE t.id = r.id`,
    [projectId, status, excludeId],
  );
}

interface Neighbours {
  lo: number | null;
  hi: number | null;
}

/**
 * The positions around the drop point, read from the database (the source of
 * truth): anchored on `before_id` (the task that ends up above), else on
 * `after_id` (the task below), else the end of the column. Neighbours follow
 * the board order `(position, number)`, so a neighbour that shares the
 * anchor's position yields `lo === hi` and triggers a rebalance instead of
 * being skipped (positions can tie: the column default is 0).
 */
async function findNeighbours(
  q: Queryable,
  projectId: string,
  status: TaskStatus,
  movingId: string,
  beforeId: string | null,
  afterId: string | null,
): Promise<Neighbours> {
  const anchorOf = async (anchorId: string | null): Promise<{ position: number; number: number } | null> => {
    if (!anchorId || anchorId === movingId) return null;
    const row = await q.queryOne<{ position: number; number: number }>(
      "SELECT position::float8 AS position, number FROM tasks WHERE id = $1 AND project_id = $2 AND status = $3",
      [anchorId, projectId, status],
    );
    return row ? { position: Number(row.position), number: Number(row.number) } : null;
  };
  const neighbour = async (sql: string, anchor: { position: number; number: number }): Promise<number | null> => {
    const row = await q.queryOne<{ value: number }>(sql, [projectId, status, movingId, anchor.position, anchor.number]);
    return row ? Number(row.value) : null;
  };

  const before = await anchorOf(beforeId);
  if (before !== null) {
    const hi = await neighbour(
      `SELECT position::float8 AS value FROM tasks
        WHERE project_id = $1 AND status = $2 AND id <> $3
          AND (position, number) > ($4::float8, $5::int)
        ORDER BY position ASC, number ASC LIMIT 1`,
      before,
    );
    return { lo: before.position, hi };
  }
  const after = await anchorOf(afterId);
  if (after !== null) {
    const lo = await neighbour(
      `SELECT position::float8 AS value FROM tasks
        WHERE project_id = $1 AND status = $2 AND id <> $3
          AND (position, number) < ($4::float8, $5::int)
        ORDER BY position DESC, number DESC LIMIT 1`,
      after,
    );
    return { lo, hi: after.position };
  }
  const end = await q.queryOne<{ value: number | null }>(
    "SELECT MAX(position)::float8 AS value FROM tasks WHERE project_id = $1 AND status = $2 AND id <> $3",
    [projectId, status, movingId],
  );
  return { lo: end?.value ?? null, hi: null };
}

/**
 * Board drop: new status plus a fractional position between the neighbours.
 * Rebalances the column first when the gap is too small. Recomputes progress
 * when the status changed.
 */
export async function moveTask(id: string, input: MoveTaskInput): Promise<TaskWithMeta> {
  await transaction(async (tx) => {
    const current = await tx.queryOne<TaskRow>(`SELECT ${TASK_COLUMNS} FROM tasks t WHERE t.id = $1 FOR UPDATE`, [id]);
    if (!current) throw new Error("This task no longer exists.");

    const beforeId = input.before_id ?? null;
    const afterId = input.after_id ?? null;
    let { lo, hi } = await findNeighbours(tx, current.project_id, input.status, id, beforeId, afterId);
    if (needsRebalance(lo, hi)) {
      await rebalanceColumn(tx, current.project_id, input.status, id);
      ({ lo, hi } = await findNeighbours(tx, current.project_id, input.status, id, beforeId, afterId));
    }
    const position = positionBetween(lo, hi);

    const statusChanged = input.status !== current.status;
    const now = nowISO();
    if (statusChanged) {
      const completedAt = input.status === "done" ? now : current.status === "done" ? null : current.completed_at;
      await tx.execute(
        "UPDATE tasks SET status = $2, position = $3, completed_at = $4, updated_at = $5 WHERE id = $1",
        [id, input.status, position, completedAt, now],
      );
      await recomputeProjectProgress(current.project_id, tx);
    } else {
      await tx.execute("UPDATE tasks SET position = $2 WHERE id = $1", [id, position]);
    }
  });

  const task = await getTaskWith(id);
  if (!task) throw new Error("This task no longer exists.");
  return task;
}

/** File attachments that cascade with these tasks (their own and their comments'). */
async function blobUrlsForTasks(q: Queryable, taskIds: string[]): Promise<string[]> {
  if (taskIds.length === 0) return [];
  const rows = await q.query<{ url: string }>(
    `SELECT DISTINCT a.url FROM attachments a
      WHERE a.kind = 'file'
        AND (a.task_id = ANY($1::text[])
             OR a.comment_id IN (SELECT c.id FROM comments c WHERE c.task_id = ANY($1::text[])))`,
    [taskIds],
  );
  return rows.map((row) => row.url);
}

/** The ids plus every subtask of them (one level). */
async function withSubtaskIds(q: Queryable, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await q.query<{ id: string }>(
    "SELECT id FROM tasks WHERE id = ANY($1::text[]) OR parent_task_id = ANY($1::text[])",
    [ids],
  );
  return rows.map((row) => row.id);
}

/**
 * Before tasks are deleted, folds their timesheet rows into the project-level
 * ("no task") timesheet cell. `time_entries.task_id` is ON DELETE SET NULL, so
 * without this a deleted task's timesheet row would collide on
 * `uq_time_entries_timesheet_cell` with an existing no-task row for the same
 * user, project and date (or with another deleted task's row in that cell).
 * Per cell the minutes are added to the existing no-task row (or to one of the
 * deleted tasks' rows, which then becomes the no-task row via the cascade),
 * capped at MAX_ENTRY_MINUTES, and the other rows are removed. Manual and timer
 * entries are untouched (they are not part of the unique index). Runs on the
 * caller's transaction, before the DELETE.
 */
async function mergeTimesheetRowsOfTasks(q: Queryable, taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) return;
  const cells = await q.query<{ ids: string[]; minutes: number; keep_id: string | null; keep_minutes: number | null }>(
    `WITH doomed AS (
       SELECT user_id, project_id, entry_date,
              SUM(minutes)::int AS minutes,
              array_agg(id ORDER BY created_at ASC, id ASC) AS ids
         FROM time_entries
        WHERE source = 'timesheet' AND task_id = ANY($1::text[])
        GROUP BY user_id, project_id, entry_date
     )
     SELECT d.ids, d.minutes, e.id AS keep_id, e.minutes AS keep_minutes
       FROM doomed d
       LEFT JOIN time_entries e
         ON e.source = 'timesheet' AND e.task_id IS NULL
        AND e.user_id = d.user_id AND e.project_id = d.project_id AND e.entry_date = d.entry_date`,
    [taskIds],
  );

  const updateIds: string[] = [];
  const updateMinutes: number[] = [];
  const deleteIds: string[] = [];
  for (const cell of cells) {
    if (cell.keep_id !== null) {
      // An existing no-task row: it absorbs every deleted task's row.
      updateIds.push(cell.keep_id);
      updateMinutes.push(Math.min(MAX_ENTRY_MINUTES, (cell.keep_minutes ?? 0) + cell.minutes));
      deleteIds.push(...cell.ids);
    } else if (cell.ids.length > 1) {
      // Several deleted tasks share the cell: the oldest row survives (and loses its task).
      const [keep, ...rest] = cell.ids;
      updateIds.push(keep);
      updateMinutes.push(Math.min(MAX_ENTRY_MINUTES, cell.minutes));
      deleteIds.push(...rest);
    }
    // A single row with no no-task row in its cell simply loses its task_id.
  }

  if (deleteIds.length > 0) await q.execute("DELETE FROM time_entries WHERE id = ANY($1::text[])", [deleteIds]);
  if (updateIds.length > 0) {
    await q.execute(
      `UPDATE time_entries t SET minutes = v.minutes, updated_at = $3
         FROM unnest($1::text[], $2::int[]) AS v(id, minutes)
        WHERE t.id = v.id`,
      // SqlParam arrays are text; Postgres casts them back with ::int[].
      [updateIds, updateMinutes.map(String), nowISO()],
    );
  }
}

/**
 * Deletes a task (subtasks, checklist, dependencies, labels, comments and
 * attachments cascade; time entries keep existing without the task, timesheet
 * rows merged into the project-level cell first) and
 * recomputes progress. `blob_urls` lists the file attachments removed by the
 * cascade so the caller can delete the blobs after the commit.
 */
export async function deleteTask(
  id: string,
): Promise<{ project_id: string; number: number; title: string; blob_urls: string[] }> {
  return transaction(async (tx) => {
    const row = await tx.queryOne<{ project_id: string; number: number; title: string }>(
      "SELECT project_id, number, title FROM tasks WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!row) throw new Error("This task no longer exists.");
    const doomedIds = await withSubtaskIds(tx, [id]);
    const blobUrls = await blobUrlsForTasks(tx, doomedIds);
    await mergeTimesheetRowsOfTasks(tx, doomedIds);
    await tx.execute("DELETE FROM tasks WHERE id = $1", [id]);
    await recomputeProjectProgress(row.project_id, tx);
    return { project_id: row.project_id, number: row.number, title: row.title, blob_urls: blobUrls };
  });
}

/** Replaces the label set of a task; returns the labels now attached. */
export async function setTaskLabels(taskId: string, labelIds: string[]): Promise<LabelSummary[]> {
  return transaction(async (tx) => {
    const exists = await tx.queryOne<{ id: string }>("SELECT id FROM tasks WHERE id = $1 FOR UPDATE", [taskId]);
    if (!exists) throw new Error("This task no longer exists.");
    const now = nowISO();
    await replaceTaskLabels(tx, taskId, labelIds, now);
    await tx.execute("UPDATE tasks SET updated_at = $2 WHERE id = $1", [taskId, now]);
    const labels = await fetchLabelsByTask([taskId], tx);
    return labels.get(taskId) ?? [];
  });
}

/* ------------------------------- Checklist ------------------------------ */

const CHECKLIST_RETURNING = "id, task_id, title, done, position, completed_at, created_at, updated_at";

export async function addChecklistItem(taskId: string, title: string): Promise<TaskChecklistItem> {
  return transaction(async (tx) => {
    const exists = await tx.queryOne<{ id: string }>("SELECT id FROM tasks WHERE id = $1 FOR UPDATE", [taskId]);
    if (!exists) throw new Error("This task no longer exists.");
    const now = nowISO();
    const row = await tx.queryOne<ChecklistRow>(
      `INSERT INTO task_checklist_items (id, task_id, title, done, position, created_at, updated_at)
       VALUES ($1, $2, $3, FALSE,
               (SELECT COALESCE(MAX(position) + 1, 0) FROM task_checklist_items WHERE task_id = $2), $4, $4)
       RETURNING ${CHECKLIST_RETURNING}`,
      [newId(), taskId, title.trim(), now],
    );
    if (!row) throw new Error("Failed to add the checklist item.");
    await tx.execute("UPDATE tasks SET updated_at = $2 WHERE id = $1", [taskId, now]);
    return toChecklistItem(row);
  });
}

/** Updates title and/or done; `completed_at` follows `done`. */
export async function updateChecklistItem(
  id: string,
  patch: { title?: string; done?: boolean },
): Promise<TaskChecklistItem> {
  const now = nowISO();
  const sets: string[] = ["updated_at = $2"];
  const values: SqlParam[] = [id, now];
  if (patch.title !== undefined) {
    values.push(patch.title.trim());
    sets.push(`title = $${values.length}`);
  }
  if (patch.done !== undefined) {
    values.push(patch.done);
    const done = `$${values.length}`;
    sets.push(`done = ${done}`);
    // Keep the original completion time when an already-done item is ticked again.
    sets.push(`completed_at = CASE WHEN ${done} THEN COALESCE(completed_at, $2) ELSE NULL END`);
  }
  const row = await db.queryOne<ChecklistRow>(
    `UPDATE task_checklist_items SET ${sets.join(", ")} WHERE id = $1 RETURNING ${CHECKLIST_RETURNING}`,
    values,
  );
  if (!row) throw new Error("This checklist item no longer exists.");
  return toChecklistItem(row);
}

export async function deleteChecklistItem(id: string): Promise<{ task_id: string }> {
  const row = await db.queryOne<{ task_id: string }>(
    "DELETE FROM task_checklist_items WHERE id = $1 RETURNING task_id",
    [id],
  );
  if (!row) throw new Error("This checklist item no longer exists.");
  return { task_id: row.task_id };
}

/**
 * Rewrites positions 0..n in the given order. Ids that are not items of the
 * task are ignored; items missing from the list keep their relative order
 * after the listed ones.
 */
export async function reorderChecklist(taskId: string, orderedIds: string[]): Promise<void> {
  const ids = unique(orderedIds);
  await transaction(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      "SELECT id FROM task_checklist_items WHERE task_id = $1 ORDER BY position ASC, created_at ASC, id ASC FOR UPDATE",
      [taskId],
    );
    const known = new Set(rows.map((row) => row.id));
    const listed = ids.filter((id) => known.has(id));
    const rest = rows.map((row) => row.id).filter((id) => !listed.includes(id));
    const order = [...listed, ...rest];
    if (order.length === 0) return;
    await tx.execute(
      `UPDATE task_checklist_items c SET position = o.ord - 1
         FROM unnest($2::text[]) WITH ORDINALITY AS o(id, ord)
        WHERE c.id = o.id AND c.task_id = $1`,
      [taskId, order],
    );
  });
}

/* ------------------------------ Dependencies ---------------------------- */

/**
 * Replaces the set of tasks `taskId` is blocked by. Rejects self-dependencies
 * and cycles (direct or transitive) with a user-facing Error.
 */
export async function setBlockedBy(taskId: string, blockedByIds: string[], userId: string): Promise<TaskRef[]> {
  const ids = unique(blockedByIds);
  if (ids.includes(taskId)) throw new Error("A task can't be blocked by itself.");

  return transaction(async (tx) => {
    const exists = await tx.queryOne<{ id: string }>("SELECT id FROM tasks WHERE id = $1 FOR UPDATE", [taskId]);
    if (!exists) throw new Error("This task no longer exists.");

    if (ids.length > 0) {
      const found = await tx.query<{ id: string }>("SELECT id FROM tasks WHERE id = ANY($1::text[])", [ids]);
      if (found.length !== ids.length) throw new Error("One of the blocking tasks no longer exists.");

      // Adding "taskId is blocked by b" closes a loop when b is (transitively) blocked by taskId.
      const cycle = await tx.queryOne<{ number: number }>(
        `WITH RECURSIVE chain(id) AS (
           SELECT d.blocked_by_id FROM task_dependencies d WHERE d.task_id = ANY($1::text[])
           UNION
           SELECT d.blocked_by_id FROM task_dependencies d JOIN chain c ON d.task_id = c.id
         )
         SELECT t.number FROM chain JOIN tasks t ON t.id = chain.id WHERE chain.id = $2 LIMIT 1`,
        [ids, taskId],
      );
      if (cycle) throw new Error("That would create a circular dependency.");
    }

    await tx.execute("DELETE FROM task_dependencies WHERE task_id = $1 AND NOT (blocked_by_id = ANY($2::text[]))", [
      taskId,
      ids,
    ]);
    if (ids.length > 0) {
      await tx.execute(
        `INSERT INTO task_dependencies (task_id, blocked_by_id, created_by, created_at)
         SELECT $1, b.id, $3, $4 FROM unnest($2::text[]) AS b(id)
         ON CONFLICT (task_id, blocked_by_id) DO NOTHING`,
        [taskId, ids, userId, nowISO()],
      );
    }
    await tx.execute("UPDATE tasks SET updated_at = $2 WHERE id = $1", [taskId, nowISO()]);
    return listTaskRefsWhere("t.id IN (SELECT blocked_by_id FROM task_dependencies WHERE task_id = $1)", [taskId], tx);
  });
}

/* --------------------------------- Bulk --------------------------------- */

interface BulkRow {
  id: string;
  project_id: string;
  status: TaskStatus;
  priority: Priority;
  assignee_id: string | null;
  milestone_id: string | null;
  start_date: string | null;
  due_date: string | null;
}

function emptyBulkResult(): BulkResult {
  return { updated: 0, project_ids: [], per_project: {}, task_ids: [], newly_assigned_ids: [], completed_ids: [] };
}

/**
 * Applies one patch to up to MAX_BULK_IDS tasks in one transaction and
 * recomputes progress once per project whose task statuses changed. A
 * `milestone_id` must belong to the project of every selected task.
 */
export async function bulkUpdateTasks(ids: string[], patch: BulkTaskPatch): Promise<BulkResult> {
  const list = unique(ids);
  if (list.length === 0) return emptyBulkResult();
  if (list.length > MAX_BULK_IDS) throw new Error(`Select at most ${MAX_BULK_IDS} tasks at a time.`);

  return transaction(async (tx) => {
    const rows = await tx.query<BulkRow>(
      `SELECT id, project_id, status, priority, assignee_id, milestone_id, start_date, due_date
         FROM tasks WHERE id = ANY($1::text[]) ORDER BY position ASC, number ASC FOR UPDATE`,
      [list],
    );

    const milestoneId = patch.milestone_id === undefined ? undefined : emptyToNull(patch.milestone_id);
    if (milestoneId) {
      const milestone = await tx.queryOne<{ project_id: string }>("SELECT project_id FROM milestones WHERE id = $1", [
        milestoneId,
      ]);
      if (!milestone) throw new Error("That phase no longer exists.");
      if (rows.some((row) => row.project_id !== milestone.project_id)) {
        throw new Error("Every selected task must belong to the phase's project.");
      }
    }
    const assigneeId = patch.assignee_id === undefined ? undefined : emptyToNull(patch.assignee_id);
    if (assigneeId) await assertActiveUser(tx, assigneeId);
    const dueDate = patch.due_date === undefined ? undefined : emptyToNull(patch.due_date);

    const now = nowISO();
    const changed = new Set<string>();
    const newlyAssigned: string[] = [];
    const completed: string[] = [];
    const statusProjects = new Set<string>();
    /** Next free position per "project:status" column for tasks that change column. */
    const columnTails = new Map<string, number>();

    for (const row of rows) {
      const sets: string[] = [];
      const params = new Params();
      const set = (column: string, value: SqlParam) => sets.push(`${column} = ${params.add(value)}`);

      if (patch.status !== undefined && patch.status !== row.status) {
        const key = `${row.project_id}:${patch.status}`;
        const tail = columnTails.get(key) ?? (await columnEnd(tx, row.project_id, patch.status));
        columnTails.set(key, tail + TASK_POSITION_STEP);
        set("status", patch.status);
        set("position", tail);
        if (patch.status === "done") {
          set("completed_at", now);
          completed.push(row.id);
        } else if (row.status === "done") {
          set("completed_at", null);
        }
        statusProjects.add(row.project_id);
      }
      if (assigneeId !== undefined && assigneeId !== row.assignee_id) {
        set("assignee_id", assigneeId);
        if (assigneeId !== null) newlyAssigned.push(row.id);
      }
      if (patch.priority !== undefined && patch.priority !== row.priority) set("priority", patch.priority);
      if (milestoneId !== undefined && milestoneId !== row.milestone_id) set("milestone_id", milestoneId);
      if (dueDate !== undefined && dueDate !== row.due_date) {
        if (dueDate && row.start_date && dueDate < row.start_date) {
          // Keep the task valid: a due date before its start moves the start along.
          set("start_date", dueDate);
        }
        set("due_date", dueDate);
      }

      if (sets.length > 0) {
        set("updated_at", now);
        await tx.execute(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ${params.add(row.id)}`, params.values);
        changed.add(row.id);
      }
    }

    const rowIds = rows.map((row) => row.id);
    const addLabels = unique(patch.add_label_ids ?? []);
    if (addLabels.length > 0 && rowIds.length > 0) {
      const added = await tx.query<{ task_id: string }>(
        `INSERT INTO task_labels (task_id, label_id, created_at)
         SELECT t.id, l.id, $3 FROM unnest($1::text[]) AS t(id) CROSS JOIN labels l
          WHERE l.id = ANY($2::text[])
         ON CONFLICT (task_id, label_id) DO NOTHING
         RETURNING task_id`,
        [rowIds, addLabels, now],
      );
      for (const row of added) changed.add(row.task_id);
    }
    const removeLabels = unique(patch.remove_label_ids ?? []);
    if (removeLabels.length > 0 && rowIds.length > 0) {
      const removed = await tx.query<{ task_id: string }>(
        `DELETE FROM task_labels WHERE task_id = ANY($1::text[]) AND label_id = ANY($2::text[]) RETURNING task_id`,
        [rowIds, removeLabels],
      );
      for (const row of removed) changed.add(row.task_id);
    }
    const labelOnly = rows.filter((row) => changed.has(row.id)).map((row) => row.id);
    if (addLabels.length > 0 || removeLabels.length > 0) {
      await tx.execute("UPDATE tasks SET updated_at = $2 WHERE id = ANY($1::text[]) AND updated_at <> $2", [
        labelOnly,
        now,
      ]);
    }

    for (const projectId of statusProjects) await recomputeProjectProgress(projectId, tx);

    const perProject: Record<string, number> = {};
    const taskIds: string[] = [];
    for (const row of rows) {
      if (!changed.has(row.id)) continue;
      taskIds.push(row.id);
      perProject[row.project_id] = (perProject[row.project_id] ?? 0) + 1;
    }
    return {
      updated: taskIds.length,
      project_ids: Object.keys(perProject),
      per_project: perProject,
      task_ids: taskIds,
      newly_assigned_ids: newlyAssigned,
      completed_ids: completed,
    };
  });
}

/** Deletes up to MAX_BULK_IDS tasks in one transaction; returns the cascade's blob URLs. */
export async function bulkDeleteTasks(ids: string[]): Promise<BulkDeleteResult> {
  const list = unique(ids);
  if (list.length === 0) return { ...emptyBulkResult(), blob_urls: [] };
  if (list.length > MAX_BULK_IDS) throw new Error(`Select at most ${MAX_BULK_IDS} tasks at a time.`);

  return transaction(async (tx) => {
    const rows = await tx.query<{ id: string; project_id: string }>(
      "SELECT id, project_id FROM tasks WHERE id = ANY($1::text[]) ORDER BY number ASC FOR UPDATE",
      [list],
    );
    const rowIds = rows.map((row) => row.id);
    const doomedIds = await withSubtaskIds(tx, rowIds);
    const blobUrls = await blobUrlsForTasks(tx, doomedIds);
    await mergeTimesheetRowsOfTasks(tx, doomedIds);
    if (rowIds.length > 0) await tx.execute("DELETE FROM tasks WHERE id = ANY($1::text[])", [rowIds]);

    const perProject: Record<string, number> = {};
    for (const row of rows) perProject[row.project_id] = (perProject[row.project_id] ?? 0) + 1;
    for (const projectId of Object.keys(perProject)) await recomputeProjectProgress(projectId, tx);

    return {
      updated: rowIds.length,
      project_ids: Object.keys(perProject),
      per_project: perProject,
      task_ids: rowIds,
      newly_assigned_ids: [],
      completed_ids: [],
      blob_urls: blobUrls,
    };
  });
}
