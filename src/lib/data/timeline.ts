import { db, type SqlParam } from "@/lib/db";
import { OPEN_STATUSES } from "@/lib/constants";
import type {
  ClientSummary,
  Currency,
  MilestoneKind,
  MilestoneStatus,
  ProjectStatus,
  ProjectTimelineData,
  ProjectTimelineRow,
  RagHealth,
  ServiceLine,
  TaskStatus,
  TimelineData,
  TimelineFilters,
  TimelineGroup,
  TimelineMilestone,
  TimelineProject,
  TimelineTask,
  UserSummary,
} from "@/lib/types";
import { taskKey } from "@/lib/utils";
import { tuningEndDate } from "@/lib/workspace-time";

/*
 * Timeline reads (SPEC.md section 17.5, W3 `timeline`). Read-only: the
 * timeline never writes (rescheduling goes through the task and milestone
 * actions). No commercial data is selected here, so every caller (admin or
 * member) gets the same rows.
 */

/* ------------------------------ Public types ---------------------------- */

/** Inclusive "YYYY-MM-DD" span. */
export interface TimelineSpan {
  start: string;
  end: string;
}

/**
 * Portfolio filters: the `TimelineFilters` contract plus the service line and
 * health filters of the /timeline toolbar. `health: "none"` = no status update yet.
 */
export interface TimelinePortfolioFilters extends TimelineFilters {
  serviceLine?: ServiceLine;
  health?: RagHealth | "none";
}

/** A `TimelineProject` with its computed bar span and current phase. */
export interface TimelinePortfolioProject extends TimelineProject {
  /**
   * The bar: `start_date` (else the earliest phase/milestone date, else
   * `due_date`) to `due_date` (else the latest phase/milestone date, else
   * `start_date`). null for unscheduled projects (neither date set).
   */
  span: TimelineSpan | null;
  /** First phase (by position) that is active or in gate review, as on project cards. */
  current_phase: TimelineMilestone | null;
}

export interface TimelinePortfolioGroup extends TimelineGroup {
  projects: TimelinePortfolioProject[];
}

export interface TimelinePortfolioData extends TimelineData {
  groups: TimelinePortfolioGroup[];
  unscheduled: TimelinePortfolioProject[];
}

/** A task blocking a timeline task (dependency hint). */
export interface TimelineBlocker {
  id: string;
  key: string;
  title: string;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  /** false when the blocker belongs to another project (no connector is drawn). */
  same_project: boolean;
}

export interface TimelineTaskDetail extends TimelineTask {
  number: number;
  milestone_id: string | null;
  parent_task_id: string | null;
  is_deliverable: boolean;
  /** Tasks this one is blocked by (any status), by task number. */
  blocked_by: TimelineBlocker[];
}

export interface ProjectTimelineRowDetail extends ProjectTimelineRow {
  tasks: TimelineTaskDetail[];
}

export interface ProjectTimelineDetail extends ProjectTimelineData {
  project: TimelinePortfolioProject;
  rows: ProjectTimelineRowDetail[];
  /** Earliest and latest date across the project, its milestones, tasks, go-live and tuning end. */
  range: TimelineSpan | null;
}

/* ------------------------------ Row shapes ------------------------------ */

interface ProjectRow {
  id: string;
  name: string;
  color: string | null;
  status: ProjectStatus;
  progress: number;
  health: RagHealth | null;
  service_line: ServiceLine | null;
  start_date: string | null;
  due_date: string | null;
  go_live_date: string | null;
  tuning_days: number;
  tuning_closed_at: string | null;
  client_id: string | null;
  client_name: string | null;
  client_code: string | null;
  client_color: string | null;
  client_currency: Currency | null;
  client_confidential: boolean | null;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_color: string | null;
  owner_job_title: string | null;
}

interface MilestoneRow {
  id: string;
  project_id: string;
  name: string;
  kind: MilestoneKind;
  status: MilestoneStatus;
  requires_gate: boolean;
  start_date: string | null;
  due_date: string | null;
  position: number;
}

interface TaskRow {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  milestone_id: string | null;
  parent_task_id: string | null;
  is_deliverable: boolean;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  assignee_color: string | null;
  assignee_job_title: string | null;
}

interface BlockerRow {
  task_id: string;
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  project_id: string;
}

/* ------------------------------ SQL pieces ------------------------------ */

/* Date-only columns are TEXT; "" is treated as null everywhere (SPEC section 2). */
const PROJECT_SELECT = `
  SELECT p.id, p.name, p.color, p.status, p.progress, p.health, p.service_line,
         NULLIF(p.start_date, '') AS start_date, NULLIF(p.due_date, '') AS due_date,
         NULLIF(p.go_live_date, '') AS go_live_date, p.tuning_days, p.tuning_closed_at,
         cl.id AS client_id, cl.name AS client_name, cl.code AS client_code, cl.color AS client_color,
         cl.currency AS client_currency, cl.confidential AS client_confidential,
         o.id AS owner_id, o.name AS owner_name, o.email AS owner_email, o.color AS owner_color,
         o.job_title AS owner_job_title
    FROM projects p
    LEFT JOIN clients cl ON cl.id = p.client_id
    LEFT JOIN users o ON o.id = p.owner_id`;

const MILESTONE_SELECT = `
  SELECT m.id, m.project_id, m.name, m.kind, m.status, m.requires_gate,
         NULLIF(m.start_date, '') AS start_date, NULLIF(m.due_date, '') AS due_date, m.position
    FROM milestones m`;

const PHASE_CURRENT_STATUSES: readonly MilestoneStatus[] = ["active", "gate_review"];

/* ------------------------------ Helpers --------------------------------- */

class Params {
  readonly values: SqlParam[] = [];

  add(value: SqlParam): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

function minDate(dates: readonly (string | null | undefined)[]): string | null {
  let result: string | null = null;
  for (const date of dates) if (date && (result === null || date < result)) result = date;
  return result;
}

function maxDate(dates: readonly (string | null | undefined)[]): string | null {
  let result: string | null = null;
  for (const date of dates) if (date && (result === null || date > result)) result = date;
  return result;
}

/** Earliest and latest of the given dates, or null when none is set. */
export function spanOfDates(dates: readonly (string | null | undefined)[]): TimelineSpan | null {
  const start = minDate(dates);
  const end = maxDate(dates);
  return start && end ? { start, end } : null;
}

function toMilestone(row: MilestoneRow): TimelineMilestone {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    requires_gate: row.requires_gate === true,
    start_date: row.start_date,
    due_date: row.due_date,
    position: row.position,
  };
}

/** The bar of a project (see `TimelinePortfolioProject.span`). */
function projectSpan(row: ProjectRow, milestones: readonly TimelineMilestone[]): TimelineSpan | null {
  if (!row.start_date && !row.due_date) return null;
  const milestoneDates = milestones.flatMap((m) => [m.start_date, m.due_date]);
  const start = row.start_date ?? minDate(milestoneDates) ?? row.due_date;
  const end = row.due_date ?? maxDate(milestoneDates) ?? row.start_date;
  if (!start || !end) return null;
  // A due date before the start (legacy data) still renders as a forward bar.
  return start <= end ? { start, end } : { start: end, end: start };
}

function currentPhase(milestones: readonly TimelineMilestone[]): TimelineMilestone | null {
  return milestones.find((m) => m.kind === "phase" && PHASE_CURRENT_STATUSES.includes(m.status)) ?? null;
}

function toProject(row: ProjectRow, milestones: TimelineMilestone[]): TimelinePortfolioProject {
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
  const tuningDays = Number(row.tuning_days) || 0;
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    status: row.status,
    progress: Number(row.progress) || 0,
    health: row.health,
    service_line: row.service_line,
    start_date: row.start_date,
    due_date: row.due_date,
    go_live_date: row.go_live_date,
    tuning_days: tuningDays,
    tuning_end_date: tuningEndDate(row.go_live_date, tuningDays),
    tuning_closed_at: row.tuning_closed_at,
    client,
    owner,
    milestones,
    span: projectSpan(row, milestones),
    current_phase: currentPhase(milestones),
  };
}

async function loadMilestones(projectIds: readonly string[]): Promise<Map<string, TimelineMilestone[]>> {
  const byProject = new Map<string, TimelineMilestone[]>();
  if (projectIds.length === 0) return byProject;
  const rows = await db.query<MilestoneRow>(
    `${MILESTONE_SELECT}
      WHERE m.project_id = ANY($1::text[])
      ORDER BY m.project_id, m.position ASC, m.created_at ASC`,
    [projectIds],
  );
  for (const row of rows) {
    const list = byProject.get(row.project_id);
    if (list) list.push(toMilestone(row));
    else byProject.set(row.project_id, [toMilestone(row)]);
  }
  return byProject;
}

/** Every date a project contributes to the visible range. */
function projectDates(project: TimelinePortfolioProject): (string | null)[] {
  return [
    project.span?.start ?? null,
    project.span?.end ?? null,
    project.go_live_date,
    project.tuning_end_date,
    ...project.milestones.flatMap((m) => [m.start_date, m.due_date]),
  ];
}

function bySpanThenName(a: TimelinePortfolioProject, b: TimelinePortfolioProject): number {
  const left = a.span?.start ?? "9999-12-31";
  const right = b.span?.start ?? "9999-12-31";
  if (left !== right) return left < right ? -1 : 1;
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}

/* ------------------------------ Portfolio ------------------------------- */

/**
 * Top-level projects (open unless `includeClosed`) with their milestones,
 * grouped by client (clients by name, "No client" last; projects by bar start,
 * then name). Projects with neither a start nor a due date go to
 * `unscheduled` (by name). `range` spans every scheduled bar, phase and
 * milestone date, go-live and tuning end. Two queries in total.
 */
export async function listTimeline(filters: TimelinePortfolioFilters = {}): Promise<TimelinePortfolioData> {
  const params = new Params();
  const where: string[] = ["p.parent_id IS NULL"];

  if (!filters.includeClosed) where.push(`p.status = ANY(${params.add(OPEN_STATUSES)}::text[])`);
  if (filters.clientId) where.push(`p.client_id = ${params.add(filters.clientId)}`);
  if (filters.serviceLine) where.push(`p.service_line = ${params.add(filters.serviceLine)}`);
  if (filters.health === "none") where.push("p.health IS NULL");
  else if (filters.health) where.push(`p.health = ${params.add(filters.health)}`);
  if (filters.memberId) {
    const member = params.add(filters.memberId);
    where.push(
      `(p.owner_id = ${member} OR p.created_by = ${member} OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${member}
       ))`,
    );
  }
  if (filters.labelId) {
    where.push(
      `EXISTS (SELECT 1 FROM project_labels pl WHERE pl.project_id = p.id AND pl.label_id = ${params.add(filters.labelId)})`,
    );
  }

  const rows = await db.query<ProjectRow>(
    `${PROJECT_SELECT}
      WHERE ${where.join(" AND ")}
      ORDER BY lower(p.name) ASC, p.created_at ASC`,
    params.values,
  );
  const milestones = await loadMilestones(rows.map((row) => row.id));
  const projects = rows.map((row) => toProject(row, milestones.get(row.id) ?? []));

  const unscheduled: TimelinePortfolioProject[] = [];
  const groups = new Map<string, TimelinePortfolioGroup>();
  let noClient: TimelinePortfolioGroup | null = null;
  const rangeDates: (string | null)[] = [];

  for (const project of projects) {
    if (!project.span) {
      unscheduled.push(project);
      continue;
    }
    rangeDates.push(...projectDates(project));
    if (!project.client) {
      noClient ??= { client: null, projects: [] };
      noClient.projects.push(project);
      continue;
    }
    const group = groups.get(project.client.id);
    if (group) group.projects.push(project);
    else groups.set(project.client.id, { client: project.client, projects: [project] });
  }

  const ordered = [...groups.values()].sort((a, b) => {
    const byName = (a.client?.name ?? "").localeCompare(b.client?.name ?? "", "en", { sensitivity: "base" });
    return byName !== 0 ? byName : (a.client?.code ?? "").localeCompare(b.client?.code ?? "");
  });
  if (noClient) ordered.push(noClient);
  for (const group of ordered) group.projects.sort(bySpanThenName);

  return { groups: ordered, unscheduled, range: spanOfDates(rangeDates) };
}

/* ------------------------------ One project ----------------------------- */

function toTask(row: TaskRow, blockedBy: TimelineBlocker[]): TimelineTaskDetail {
  return {
    id: row.id,
    key: taskKey(row.number),
    number: row.number,
    title: row.title,
    status: row.status,
    start_date: row.start_date,
    due_date: row.due_date,
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
    milestone_id: row.milestone_id,
    parent_task_id: row.parent_task_id,
    is_deliverable: row.is_deliverable === true,
    blocked_by: blockedBy,
  };
}

/**
 * Puts each subtask right after its parent when both sit in the same row;
 * subtasks whose parent is elsewhere (or cancelled) keep their own place.
 */
function nestSubtasks(tasks: TimelineTaskDetail[]): TimelineTaskDetail[] {
  const ids = new Set(tasks.map((task) => task.id));
  const children = new Map<string, TimelineTaskDetail[]>();
  const roots: TimelineTaskDetail[] = [];
  for (const task of tasks) {
    if (task.parent_task_id && ids.has(task.parent_task_id)) {
      const list = children.get(task.parent_task_id);
      if (list) list.push(task);
      else children.set(task.parent_task_id, [task]);
    } else {
      roots.push(task);
    }
  }
  return roots.flatMap((task) => [task, ...(children.get(task.id) ?? [])]);
}

/**
 * One project's timeline: milestone rows by position, each with its
 * non-cancelled tasks (by start, else due date, then number; subtasks right
 * after their parent), then a "No milestone" row (`milestone: null`) when some
 * tasks have no milestone. Tasks carry their blockers for dependency hints.
 * Works for sub-projects too. null when the project does not exist.
 */
export async function getProjectTimeline(projectId: string): Promise<ProjectTimelineDetail | null> {
  const projectRow = await db.queryOne<ProjectRow>(`${PROJECT_SELECT} WHERE p.id = $1`, [projectId]);
  if (!projectRow) return null;

  const [milestoneMap, taskRows] = await Promise.all([
    loadMilestones([projectId]),
    db.query<TaskRow>(
      `SELECT t.id, t.number, t.title, t.status,
              NULLIF(t.start_date, '') AS start_date, NULLIF(t.due_date, '') AS due_date,
              t.milestone_id, t.parent_task_id, t.is_deliverable,
              a.id AS assignee_id, a.name AS assignee_name, a.email AS assignee_email,
              a.color AS assignee_color, a.job_title AS assignee_job_title
         FROM tasks t
         LEFT JOIN users a ON a.id = t.assignee_id
        WHERE t.project_id = $1 AND t.status <> 'cancelled'
        ORDER BY COALESCE(NULLIF(t.start_date, ''), NULLIF(t.due_date, '')) ASC NULLS LAST, t.number ASC`,
      [projectId],
    ),
  ]);

  const blockerRows =
    taskRows.length === 0
      ? []
      : await db.query<BlockerRow>(
          `SELECT d.task_id, b.id, b.number, b.title, b.status,
                  NULLIF(b.start_date, '') AS start_date, NULLIF(b.due_date, '') AS due_date, b.project_id
             FROM task_dependencies d
             JOIN tasks b ON b.id = d.blocked_by_id
            WHERE d.task_id = ANY($1::text[])
            ORDER BY b.number ASC`,
          [taskRows.map((row) => row.id)],
        );
  const blockers = new Map<string, TimelineBlocker[]>();
  for (const row of blockerRows) {
    const blocker: TimelineBlocker = {
      id: row.id,
      key: taskKey(row.number),
      title: row.title,
      status: row.status,
      start_date: row.start_date,
      due_date: row.due_date,
      same_project: row.project_id === projectId,
    };
    const list = blockers.get(row.task_id);
    if (list) list.push(blocker);
    else blockers.set(row.task_id, [blocker]);
  }

  const milestones = milestoneMap.get(projectId) ?? [];
  const project = toProject(projectRow, milestones);
  const tasks = taskRows.map((row) => toTask(row, blockers.get(row.id) ?? []));

  const byMilestone = new Map<string, TimelineTaskDetail[]>();
  const loose: TimelineTaskDetail[] = [];
  const milestoneIds = new Set(milestones.map((m) => m.id));
  for (const task of tasks) {
    if (task.milestone_id && milestoneIds.has(task.milestone_id)) {
      const list = byMilestone.get(task.milestone_id);
      if (list) list.push(task);
      else byMilestone.set(task.milestone_id, [task]);
    } else {
      loose.push(task);
    }
  }

  const rows: ProjectTimelineRowDetail[] = milestones.map((milestone) => ({
    milestone,
    tasks: nestSubtasks(byMilestone.get(milestone.id) ?? []),
  }));
  if (loose.length > 0) rows.push({ milestone: null, tasks: nestSubtasks(loose) });

  const range = spanOfDates([
    ...projectDates(project),
    project.start_date,
    project.due_date,
    ...tasks.flatMap((task) => [task.start_date, task.due_date]),
  ]);

  return { project, rows, range };
}
