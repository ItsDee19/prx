import { db, type Queryable, type SqlParam } from "@/lib/db";
import { CLOSED_TASK_STATUSES, MAX_TUNING_DAYS, OPEN_STATUSES, PRIORITY_ORDER } from "@/lib/constants";
import type {
  CalendarFilters,
  CalendarGoLiveItem,
  CalendarItem,
  CalendarItemKind,
  CalendarMilestoneItem,
  CalendarProjectDueItem,
  CalendarTaskItem,
  CalendarTuningEndItem,
  MilestoneKind,
  MilestoneStatus,
  Priority,
  ProjectStatus,
  TaskStatus,
} from "@/lib/types";
import { taskKey } from "@/lib/utils";
import { addDaysISO, diffDaysISO, isDateOnly, tuningEndDate } from "@/lib/workspace-time";

/*
 * Calendar reads (SPEC §17.5). One query per item source, all bounded by the
 * inclusive `from..to` range and served by the due-date indexes:
 *   task        tasks.due_date (cancelled tasks are left out)
 *   milestone   milestones.due_date (phases and point milestones; gates via requires_gate)
 *   project_due projects.due_date, open projects only
 *   go_live     projects.go_live_date
 *   tuning_end  tuningEndDate(go_live_date, tuning_days) while tuning is open
 * Dates are stored as workspace-local "YYYY-MM-DD" strings, so no timezone
 * conversion happens here; callers pass a range computed from the workspace today.
 */

/** Longest range one call may cover (a 6-week month grid is 42 days; a year view would be 371). */
export const CALENDAR_MAX_RANGE_DAYS = 371;

/**
 * Module-local extension of `CalendarFilters`: `assigneeId` narrows the task
 * items of the "all" scope to one person (`null` = unassigned tasks). It has
 * no effect with scope "mine", whose tasks are always the viewer's.
 */
export interface CalendarQuery extends CalendarFilters {
  assigneeId?: string | null;
}

/** A task item plus its start date, so a reschedule can keep start <= due. */
export interface CalendarTaskEntry extends CalendarTaskItem {
  start_date: string | null;
}

export type CalendarEntry =
  | CalendarTaskEntry
  | CalendarMilestoneItem
  | CalendarProjectDueItem
  | CalendarGoLiveItem
  | CalendarTuningEndItem;

/** Order of kinds inside one day: the dates that matter most for the engagement first. */
export const CALENDAR_KIND_ORDER: readonly CalendarItemKind[] = [
  "go_live",
  "tuning_end",
  "milestone",
  "project_due",
  "task",
];

/* ------------------------------ Row shapes ------------------------------ */

interface ProjectRefColumns {
  project_id: string;
  project_name: string;
  project_color: string | null;
  client_code: string | null;
}

interface TaskCalendarRow extends ProjectRefColumns {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: Priority;
  start_date: string | null;
  due_date: string;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  assignee_color: string | null;
  assignee_job_title: string | null;
}

interface MilestoneCalendarRow extends ProjectRefColumns {
  id: string;
  name: string;
  kind: MilestoneKind;
  status: MilestoneStatus;
  requires_gate: boolean;
  due_date: string;
}

interface ProjectDueRow extends ProjectRefColumns {
  due_date: string;
  status: ProjectStatus;
}

interface GoLiveRow extends ProjectRefColumns {
  go_live_date: string;
}

interface TuningRow extends ProjectRefColumns {
  go_live_date: string;
  tuning_days: number;
}

/* ------------------------------ SQL pieces ------------------------------ */

/** Collects bound values and hands out their `$n` placeholders. */
class Params {
  readonly values: SqlParam[] = [];

  add(value: SqlParam): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

const PROJECT_REF_COLUMNS = `p.id AS project_id, p.name AS project_name, p.color AS project_color, cl.code AS client_code`;

/** Project-level conditions shared by every source (scope "mine", project, client, label). */
function projectConditions(
  filters: CalendarQuery,
  params: Params,
  options: { mine: boolean; labelTable: "project" | "task" },
): string[] {
  const where: string[] = [];
  if (filters.projectId) where.push(`p.id = ${params.add(filters.projectId)}`);
  if (filters.clientId) where.push(`p.client_id = ${params.add(filters.clientId)}`);
  if (options.mine) {
    const viewer = params.add(filters.userId);
    where.push(
      `(p.owner_id = ${viewer} OR p.created_by = ${viewer} OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${viewer}
       ))`,
    );
  }
  if (filters.labelId) {
    const label = params.add(filters.labelId);
    where.push(
      options.labelTable === "task"
        ? `EXISTS (SELECT 1 FROM task_labels tl WHERE tl.task_id = t.id AND tl.label_id = ${label})`
        : `EXISTS (SELECT 1 FROM project_labels pl WHERE pl.project_id = p.id AND pl.label_id = ${label})`,
    );
  }
  return where;
}

function projectRef(row: ProjectRefColumns) {
  return {
    project_id: row.project_id,
    project_name: row.project_name,
    project_color: row.project_color,
    client_code: row.client_code,
  };
}

function projectHref(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

/* -------------------------------- Sources ------------------------------- */

async function listTaskEntries(filters: CalendarQuery, q: Queryable): Promise<CalendarTaskEntry[]> {
  const params = new Params();
  const where = [
    `t.due_date >= ${params.add(filters.from)}`,
    `t.due_date <= ${params.add(filters.to)}`,
    `t.status <> 'cancelled'`,
  ];
  if (filters.scope === "mine") where.push(`t.assignee_id = ${params.add(filters.userId)}`);
  else if (filters.assigneeId === null) where.push("t.assignee_id IS NULL");
  else if (typeof filters.assigneeId === "string" && filters.assigneeId) {
    where.push(`t.assignee_id = ${params.add(filters.assigneeId)}`);
  }
  // "Mine" tasks are the viewer's tasks wherever they are; project membership only scopes project-level items.
  where.push(...projectConditions(filters, params, { mine: false, labelTable: "task" }));

  const rows = await q.query<TaskCalendarRow>(
    `SELECT t.id, t.number, t.title, t.status, t.priority, t.start_date, t.due_date,
            ${PROJECT_REF_COLUMNS},
            u.id AS assignee_id, u.name AS assignee_name, u.email AS assignee_email,
            u.color AS assignee_color, u.job_title AS assignee_job_title
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN clients cl ON cl.id = p.client_id
       LEFT JOIN users u ON u.id = t.assignee_id
      WHERE ${where.join(" AND ")}
      ORDER BY t.due_date ASC, t.number ASC`,
    params.values,
  );
  return rows.map((row) => {
    const key = taskKey(row.number);
    return {
      kind: "task",
      id: `task:${row.id}`,
      entity_id: row.id,
      date: row.due_date,
      title: row.title,
      ...projectRef(row),
      href: `/tasks/${key}`,
      task_key: key,
      status: row.status,
      priority: row.priority,
      start_date: row.start_date,
      assignee:
        row.assignee_id && row.assignee_name !== null
          ? {
              id: row.assignee_id,
              name: row.assignee_name,
              email: row.assignee_email ?? "",
              color: row.assignee_color ?? "#64748b",
              job_title: row.assignee_job_title,
            }
          : null,
    };
  });
}

async function listMilestoneItems(filters: CalendarQuery, q: Queryable): Promise<CalendarMilestoneItem[]> {
  const params = new Params();
  const where = [`m.due_date >= ${params.add(filters.from)}`, `m.due_date <= ${params.add(filters.to)}`];
  where.push(...projectConditions(filters, params, { mine: filters.scope === "mine", labelTable: "project" }));
  const rows = await q.query<MilestoneCalendarRow>(
    `SELECT m.id, m.name, m.kind, m.status, m.requires_gate, m.due_date, ${PROJECT_REF_COLUMNS}
       FROM milestones m
       JOIN projects p ON p.id = m.project_id
       LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE ${where.join(" AND ")}
      ORDER BY m.due_date ASC, m.position ASC`,
    params.values,
  );
  return rows.map((row) => ({
    kind: "milestone",
    id: `milestone:${row.id}`,
    entity_id: row.id,
    date: row.due_date,
    title: row.name,
    ...projectRef(row),
    href: projectHref(row.project_id),
    milestone_kind: row.kind,
    status: row.status,
    requires_gate: row.requires_gate,
  }));
}

async function listProjectDueItems(filters: CalendarQuery, q: Queryable): Promise<CalendarProjectDueItem[]> {
  const params = new Params();
  const where = [
    `p.due_date >= ${params.add(filters.from)}`,
    `p.due_date <= ${params.add(filters.to)}`,
    `p.status = ANY(${params.add(OPEN_STATUSES)}::text[])`,
  ];
  where.push(...projectConditions(filters, params, { mine: filters.scope === "mine", labelTable: "project" }));
  const rows = await q.query<ProjectDueRow>(
    `SELECT p.due_date, p.status, ${PROJECT_REF_COLUMNS}
       FROM projects p
       LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.due_date ASC, lower(p.name) ASC`,
    params.values,
  );
  return rows.map((row) => ({
    kind: "project_due",
    id: `project_due:${row.project_id}`,
    entity_id: row.project_id,
    date: row.due_date,
    title: row.project_name,
    ...projectRef(row),
    href: projectHref(row.project_id),
    status: row.status,
  }));
}

async function listGoLiveItems(filters: CalendarQuery, q: Queryable): Promise<CalendarGoLiveItem[]> {
  const params = new Params();
  const where = [
    `p.go_live_date >= ${params.add(filters.from)}`,
    `p.go_live_date <= ${params.add(filters.to)}`,
    `p.status <> 'cancelled'`,
  ];
  where.push(...projectConditions(filters, params, { mine: filters.scope === "mine", labelTable: "project" }));
  const rows = await q.query<GoLiveRow>(
    `SELECT p.go_live_date, ${PROJECT_REF_COLUMNS}
       FROM projects p
       LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.go_live_date ASC, lower(p.name) ASC`,
    params.values,
  );
  return rows.map((row) => ({
    kind: "go_live",
    id: `go_live:${row.project_id}`,
    entity_id: row.project_id,
    date: row.go_live_date,
    title: row.project_name,
    ...projectRef(row),
    href: projectHref(row.project_id),
  }));
}

async function listTuningEndItems(filters: CalendarQuery, q: Queryable): Promise<CalendarTuningEndItem[]> {
  const params = new Params();
  // The window ends go_live + tuning_days (0..MAX_TUNING_DAYS), so only these go-live dates can land in range.
  const where = [
    "p.go_live_date IS NOT NULL",
    "p.tuning_closed_at IS NULL",
    `p.status <> 'cancelled'`,
    `p.go_live_date >= ${params.add(addDaysISO(filters.from, -MAX_TUNING_DAYS))}`,
    `p.go_live_date <= ${params.add(filters.to)}`,
  ];
  where.push(...projectConditions(filters, params, { mine: filters.scope === "mine", labelTable: "project" }));
  const rows = await q.query<TuningRow>(
    `SELECT p.go_live_date, p.tuning_days, ${PROJECT_REF_COLUMNS}
       FROM projects p
       LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE ${where.join(" AND ")}`,
    params.values,
  );
  const items: CalendarTuningEndItem[] = [];
  for (const row of rows) {
    const end = tuningEndDate(row.go_live_date, row.tuning_days);
    if (!end || end < filters.from || end > filters.to) continue;
    items.push({
      kind: "tuning_end",
      id: `tuning_end:${row.project_id}`,
      entity_id: row.project_id,
      date: end,
      title: row.project_name,
      ...projectRef(row),
      href: projectHref(row.project_id),
      tuning_days: row.tuning_days,
    });
  }
  return items;
}

/* --------------------------------- Sort --------------------------------- */

const KIND_RANK = new Map(CALENDAR_KIND_ORDER.map((kind, index) => [kind, index]));
const PRIORITY_RANK = new Map(PRIORITY_ORDER.map((priority, index) => [priority, index]));
const CLOSED_TASK = new Set<TaskStatus>(CLOSED_TASK_STATUSES);

/** Date, then kind (CALENDAR_KIND_ORDER); tasks: open before done, then priority (urgent first), then key. */
export function compareCalendarItems(a: CalendarItem, b: CalendarItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const kind = (KIND_RANK.get(a.kind) ?? 0) - (KIND_RANK.get(b.kind) ?? 0);
  if (kind !== 0) return kind;
  if (a.kind === "task" && b.kind === "task") {
    const closed = Number(CLOSED_TASK.has(a.status)) - Number(CLOSED_TASK.has(b.status));
    if (closed !== 0) return closed;
    // PRIORITY_ORDER runs urgent -> low, so urgent comes first in a day.
    const priority = (PRIORITY_RANK.get(a.priority) ?? 0) - (PRIORITY_RANK.get(b.priority) ?? 0);
    if (priority !== 0) return priority;
  }
  return a.project_name.localeCompare(b.project_name) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

/* --------------------------------- Read --------------------------------- */

/**
 * Every dated item inside the inclusive `from..to` range (workspace dates),
 * sorted by date then kind (`compareCalendarItems`).
 *
 * Scope "mine": tasks assigned to `userId`, plus the milestones, project due
 * dates, go-lives and tuning ends of projects the viewer owns, created or is a
 * member of. Scope "all": everything; `assigneeId` then narrows the tasks.
 * `projectId` / `clientId` narrow every kind; `labelId` matches task labels
 * for tasks and project labels for the project-level kinds.
 *
 * Returns [] for a malformed or reversed range; ranges longer than
 * CALENDAR_MAX_RANGE_DAYS are rejected with a user-facing Error.
 */
export async function listCalendarItems(filters: CalendarQuery, q: Queryable = db): Promise<CalendarEntry[]> {
  if (!isDateOnly(filters.from) || !isDateOnly(filters.to) || filters.to < filters.from) return [];
  if (diffDaysISO(filters.from, filters.to) + 1 > CALENDAR_MAX_RANGE_DAYS) {
    throw new Error(`The calendar shows at most ${CALENDAR_MAX_RANGE_DAYS} days at a time.`);
  }
  if (!filters.userId) return [];

  // Sequential on purpose: the same `q` may be a single pooled connection or a transaction.
  const tasks = await listTaskEntries(filters, q);
  const milestones = await listMilestoneItems(filters, q);
  const projectDue = await listProjectDueItems(filters, q);
  const goLive = await listGoLiveItems(filters, q);
  const tuning = await listTuningEndItems(filters, q);

  const items: CalendarEntry[] = [...tasks, ...milestones, ...projectDue, ...goLive, ...tuning];
  return items.sort(compareCalendarItems);
}
