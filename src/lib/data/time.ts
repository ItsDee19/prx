import { db, newId, nowISO, transaction, type Queryable, type SqlParam } from "@/lib/db";
import { DEFAULT_USD_INR_RATE, MAX_ENTRY_MINUTES, MAX_WEEKLY_CAPACITY_HOURS, STOPPED_TIMER_RETENTION_DAYS } from "@/lib/constants";
import { minutesBetween } from "@/lib/duration";
import { toInr } from "@/lib/money";
import type {
  BudgetBurn,
  BudgetPeriod,
  BudgetThreshold,
  Currency,
  EngagementType,
  LogTimeInput,
  MilestoneKind,
  MilestoneRef,
  PhaseMarginRow,
  ProjectMargin,
  ProjectStatus,
  ProjectSummary,
  ProjectTimeSummary,
  RunningTimer,
  StartTimerInput,
  TaskRef,
  TaskStatus,
  TimeEntry,
  TimeEntryFilters,
  TimeEntrySource,
  TimeEntryWithMeta,
  Timer,
  TimesheetCellInput,
  TimesheetRow,
  TimesheetWeek,
  UpdateTimeEntryInput,
  UserCostRate,
} from "@/lib/types";
import { budgetPeriodRange, computeBudgetBurn, taskKey } from "@/lib/utils";
import { addDaysISO, isDateOnly, startOfWeekISO, weekDaysISO } from "@/lib/workspace-time";
import { getAppSettings } from "./app-settings";
import { notify, projectNotificationUrl } from "./notifications";

/*
 * Time tracking (SPEC.md sections 16, 17.7 and 23). Durations are integer
 * minutes; entry dates are workspace dates ("YYYY-MM-DD"). Time entries and
 * timers are personal records: they never log activity (section 23.1).
 *
 * Commercial data: `users.cost_rate` and margins are only read by the
 * functions marked ADMIN-ONLY; callers check `user.role === "admin"` first.
 */

/* -------------------------------- Errors -------------------------------- */

/** User-facing messages thrown by this module (actions pass them through). */
export const TIME_ERRORS = {
  projectMissing: "That project no longer exists.",
  taskMissing: "That task no longer exists.",
  taskOtherProject: "That task belongs to another project.",
  entryMissing: "That time entry no longer exists.",
  minutesRange: `Enter between 1 minute and ${MAX_ENTRY_MINUTES / 60} hours.`,
  invalidDate: "Use a valid date (YYYY-MM-DD).",
  timerRunning: "A timer is already running. Refresh to see it.",
  undoUnavailable: "That timer can no longer be undone.",
  undoBlocked: "Stop the running timer before undoing.",
  cellTaken: "That timesheet cell already has a timesheet entry.",
  userMissing: "That person no longer exists.",
  capacityRange: `Weekly capacity must be 0 to ${MAX_WEEKLY_CAPACITY_HOURS} hours.`,
  costRateRange: "The cost rate must be a whole number of rupees, 0 or more.",
} as const;

/** Most rows one listTimeEntries call returns (CSV export uses the maximum). */
export const TIME_ENTRY_LIST_DEFAULT_LIMIT = 200;
export const TIME_ENTRY_LIST_MAX_LIMIT = 10_000;

/* ------------------------------ Row shapes ------------------------------ */

interface EntryRow {
  id: string;
  user_id: string;
  project_id: string;
  task_id: string | null;
  milestone_id: string | null;
  entry_date: string;
  minutes: number;
  billable: boolean;
  note: string;
  source: TimeEntrySource;
  created_at: string;
  updated_at: string;
}

interface ProjectRefColumns {
  project_name: string;
  project_color: string | null;
  project_status: ProjectStatus;
  client_code: string | null;
}

interface TaskRefColumns {
  task_number: number | null;
  task_title: string | null;
  task_status: TaskStatus | null;
  task_project_id: string | null;
}

interface EntryMetaRow extends EntryRow, ProjectRefColumns, TaskRefColumns {
  user_name: string;
  user_email: string;
  user_color: string;
  user_job_title: string | null;
  milestone_name: string | null;
}

interface TimerRow {
  id: string;
  user_id: string;
  project_id: string;
  task_id: string | null;
  note: string;
  started_at: string;
  stopped_at: string | null;
  time_entry_id: string | null;
}

type TimerMetaRow = TimerRow & ProjectRefColumns & TaskRefColumns;

interface EntryProjectRow {
  id: string;
  engagement_type: EngagementType | null;
}

interface EntryTaskRow {
  id: string;
  project_id: string;
  milestone_id: string | null;
}

interface BudgetProjectRow {
  id: string;
  name: string;
  owner_id: string | null;
  budget_hours: number | null;
  budget_period: BudgetPeriod;
  start_date: string | null;
  due_date: string | null;
}

/* ------------------------------ SQL pieces ------------------------------ */

const ENTRY_COLUMNS = `e.id, e.user_id, e.project_id, e.task_id, e.milestone_id, e.entry_date, e.minutes,
  e.billable, e.note, e.source, e.created_at, e.updated_at`;

const PROJECT_REF_COLUMNS = `p.name AS project_name, p.color AS project_color, p.status AS project_status,
  cl.code AS client_code`;

const TASK_REF_COLUMNS = `t.number AS task_number, t.title AS task_title, t.status AS task_status,
  t.project_id AS task_project_id`;

const ENTRY_META_SELECT = `
  SELECT ${ENTRY_COLUMNS},
         u.name AS user_name, u.email AS user_email, u.color AS user_color, u.job_title AS user_job_title,
         ${PROJECT_REF_COLUMNS},
         ${TASK_REF_COLUMNS},
         m.name AS milestone_name
    FROM time_entries e
    JOIN users u ON u.id = e.user_id
    JOIN projects p ON p.id = e.project_id
    LEFT JOIN clients cl ON cl.id = p.client_id
    LEFT JOIN tasks t ON t.id = e.task_id
    LEFT JOIN milestones m ON m.id = e.milestone_id`;

const TIMER_COLUMNS = "tm.id, tm.user_id, tm.project_id, tm.task_id, tm.note, tm.started_at, tm.stopped_at, tm.time_entry_id";

const TIMER_META_SELECT = `
  SELECT ${TIMER_COLUMNS},
         ${PROJECT_REF_COLUMNS},
         ${TASK_REF_COLUMNS}
    FROM timers tm
    JOIN projects p ON p.id = tm.project_id
    LEFT JOIN clients cl ON cl.id = p.client_id
    LEFT JOIN tasks t ON t.id = tm.task_id`;

/** Minimal positional-parameter builder for dynamic WHERE clauses. */
class Params {
  readonly values: SqlParam[] = [];
  add(value: SqlParam): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/* ------------------------------ Hydration ------------------------------- */

function toEntry(row: EntryRow): TimeEntry {
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    task_id: row.task_id,
    milestone_id: row.milestone_id,
    entry_date: row.entry_date,
    minutes: row.minutes,
    billable: row.billable,
    note: row.note,
    source: row.source,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toProjectSummary(projectId: string, row: ProjectRefColumns): ProjectSummary {
  return {
    id: projectId,
    name: row.project_name,
    color: row.project_color,
    status: row.project_status,
    client_code: row.client_code,
  };
}

function toTaskRef(taskId: string | null, row: TaskRefColumns): TaskRef | null {
  if (!taskId || row.task_number === null || row.task_title === null || row.task_status === null) return null;
  return {
    id: taskId,
    number: row.task_number,
    key: taskKey(row.task_number),
    title: row.task_title,
    status: row.task_status,
    project_id: row.task_project_id ?? "",
  };
}

function toEntryWithMeta(row: EntryMetaRow): TimeEntryWithMeta {
  return {
    ...toEntry(row),
    user: {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      color: row.user_color,
      job_title: row.user_job_title,
    },
    project: toProjectSummary(row.project_id, row),
    task: toTaskRef(row.task_id, row),
    milestone_name: row.milestone_name,
  };
}

function toTimer(row: TimerRow): Timer {
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    task_id: row.task_id,
    note: row.note,
    started_at: row.started_at,
    stopped_at: row.stopped_at,
    time_entry_id: row.time_entry_id,
  };
}

function toRunningTimer(row: TimerMetaRow): RunningTimer {
  return { ...toTimer(row), project: toProjectSummary(row.project_id, row), task: toTaskRef(row.task_id, row) };
}

/* ------------------------------ Validation ------------------------------ */

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as { code?: unknown; constraint?: unknown };
  if (record.code !== "23505") return false;
  return constraint === undefined || record.constraint === undefined || record.constraint === constraint;
}

function assertMinutes(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_ENTRY_MINUTES) {
    throw new Error(TIME_ERRORS.minutesRange);
  }
}

function assertDate(date: string): void {
  if (!isDateOnly(date)) throw new Error(TIME_ERRORS.invalidDate);
}

async function loadEntryProject(q: Queryable, projectId: string): Promise<EntryProjectRow> {
  const project = await q.queryOne<EntryProjectRow>("SELECT id, engagement_type FROM projects WHERE id = $1", [
    projectId,
  ]);
  if (!project) throw new Error(TIME_ERRORS.projectMissing);
  return project;
}

/** The task (or null) for an entry or timer; it must belong to `projectId`. */
async function loadEntryTask(
  q: Queryable,
  taskId: string | null | undefined,
  projectId: string,
): Promise<EntryTaskRow | null> {
  if (!taskId) return null;
  const task = await q.queryOne<EntryTaskRow>("SELECT id, project_id, milestone_id FROM tasks WHERE id = $1", [taskId]);
  if (!task) throw new Error(TIME_ERRORS.taskMissing);
  if (task.project_id !== projectId) throw new Error(TIME_ERRORS.taskOtherProject);
  return task;
}

/** Internal engagements default to non-billable; everything else to billable. */
function defaultBillable(project: EntryProjectRow): boolean {
  return project.engagement_type !== "internal";
}

async function insertEntry(
  q: Queryable,
  input: {
    user_id: string;
    project_id: string;
    task_id: string | null;
    milestone_id: string | null;
    entry_date: string;
    minutes: number;
    billable: boolean;
    note: string;
    source: TimeEntrySource;
  },
): Promise<TimeEntry> {
  const now = nowISO();
  const row = await q.queryOne<EntryRow>(
    `INSERT INTO time_entries
       (id, user_id, project_id, task_id, milestone_id, entry_date, minutes, billable, note, source, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     RETURNING id, user_id, project_id, task_id, milestone_id, entry_date, minutes, billable, note, source,
               created_at, updated_at`,
    [
      newId(),
      input.user_id,
      input.project_id,
      input.task_id,
      input.milestone_id,
      input.entry_date,
      input.minutes,
      input.billable,
      input.note,
      input.source,
      now,
    ],
  );
  if (!row) throw new Error("Could not save the time entry.");
  return toEntry(row);
}

/* -------------------------------- Timers -------------------------------- */

async function loadRunningTimer(q: Queryable, userId: string): Promise<RunningTimer | null> {
  const row = await q.queryOne<TimerMetaRow>(`${TIMER_META_SELECT} WHERE tm.user_id = $1 AND tm.stopped_at IS NULL`, [
    userId,
  ]);
  return row ? toRunningTimer(row) : null;
}

async function loadTimerById(q: Queryable, timerId: string): Promise<RunningTimer | null> {
  const row = await q.queryOne<TimerMetaRow>(`${TIMER_META_SELECT} WHERE tm.id = $1`, [timerId]);
  return row ? toRunningTimer(row) : null;
}

/** The user's running timer with its project and task, or null. */
export async function getRunningTimer(userId: string): Promise<RunningTimer | null> {
  return loadRunningTimer(db, userId);
}

/** Stops `running` on `q`: creates the timer entry (dated `today`) and links it. */
async function stopRunningTimer(
  q: Queryable,
  running: TimerRow,
  today: string,
): Promise<{ timer: Timer; entry: TimeEntry }> {
  const stoppedAt = nowISO();
  const minutes = Math.min(minutesBetween(running.started_at, stoppedAt), MAX_ENTRY_MINUTES);
  const project = await loadEntryProject(q, running.project_id);
  const task = running.task_id
    ? await q.queryOne<EntryTaskRow>("SELECT id, project_id, milestone_id FROM tasks WHERE id = $1", [running.task_id])
    : null;
  const entry = await insertEntry(q, {
    user_id: running.user_id,
    project_id: running.project_id,
    task_id: task && task.project_id === running.project_id ? task.id : null,
    milestone_id: task && task.project_id === running.project_id ? task.milestone_id : null,
    entry_date: today,
    minutes,
    billable: defaultBillable(project),
    note: running.note,
    source: "timer",
  });
  const timer = await q.queryOne<TimerRow>(
    `UPDATE timers tm SET stopped_at = $2, time_entry_id = $3 WHERE tm.id = $1
     RETURNING ${TIMER_COLUMNS}`,
    [running.id, stoppedAt, entry.id],
  );
  if (!timer) throw new Error("Could not stop the timer.");
  return { timer: toTimer(timer), entry };
}

/**
 * Starts a timer for the user. A running timer is stopped (and logged) first,
 * so "switch task" is one call. Stopped timers older than
 * STOPPED_TIMER_RETENTION_DAYS (kept only for Undo) are pruned.
 */
export async function startTimer(
  userId: string,
  input: StartTimerInput,
  today: string,
): Promise<{ timer: RunningTimer; stopped_entry: TimeEntry | null }> {
  try {
    return await transaction(async (tx) => {
      await loadEntryProject(tx, input.project_id);
      const task = await loadEntryTask(tx, input.task_id, input.project_id);

      const running = await tx.queryOne<TimerRow>(
        `SELECT ${TIMER_COLUMNS} FROM timers tm WHERE tm.user_id = $1 AND tm.stopped_at IS NULL FOR UPDATE`,
        [userId],
      );
      const stopped = running ? await stopRunningTimer(tx, running, today) : null;

      const cutoff = new Date(Date.now() - STOPPED_TIMER_RETENTION_DAYS * 86_400_000).toISOString();
      await tx.execute("DELETE FROM timers WHERE user_id = $1 AND stopped_at IS NOT NULL AND stopped_at < $2", [
        userId,
        cutoff,
      ]);

      const id = newId();
      await tx.execute(
        `INSERT INTO timers (id, user_id, project_id, task_id, note, started_at, stopped_at, time_entry_id)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL)`,
        [id, userId, input.project_id, task?.id ?? null, (input.note ?? "").trim(), nowISO()],
      );
      const timer = await loadTimerById(tx, id);
      if (!timer) throw new Error("Could not start the timer.");
      return { timer, stopped_entry: stopped?.entry ?? null };
    });
  } catch (error) {
    if (isUniqueViolation(error, "uq_timers_running")) throw new Error(TIME_ERRORS.timerRunning);
    throw error;
  }
}

/**
 * Stops the user's running timer: entry minutes = minutesBetween(started_at,
 * now) capped at MAX_ENTRY_MINUTES, entry_date = today, source "timer".
 * Returns null when no timer is running.
 */
export async function stopTimer(userId: string, today: string): Promise<{ timer: Timer; entry: TimeEntry } | null> {
  return transaction(async (tx) => {
    const running = await tx.queryOne<TimerRow>(
      `SELECT ${TIMER_COLUMNS} FROM timers tm WHERE tm.user_id = $1 AND tm.stopped_at IS NULL FOR UPDATE`,
      [userId],
    );
    if (!running) return null;
    return stopRunningTimer(tx, running, today);
  });
}

/** Undo a stop: deletes the timer's entry and runs the timer again. Fails while another timer runs. */
export async function undoStopTimer(userId: string, timerId: string): Promise<RunningTimer> {
  try {
    return await transaction(async (tx) => {
      const timer = await tx.queryOne<TimerRow>(
        `SELECT ${TIMER_COLUMNS} FROM timers tm WHERE tm.id = $1 AND tm.user_id = $2 FOR UPDATE`,
        [timerId, userId],
      );
      if (!timer) throw new Error(TIME_ERRORS.undoUnavailable);
      if (timer.stopped_at !== null) {
        const other = await tx.queryOne<{ id: string }>(
          "SELECT id FROM timers WHERE user_id = $1 AND stopped_at IS NULL AND id <> $2",
          [userId, timerId],
        );
        if (other) throw new Error(TIME_ERRORS.undoBlocked);
        if (timer.time_entry_id) {
          await tx.execute("DELETE FROM time_entries WHERE id = $1 AND user_id = $2", [timer.time_entry_id, userId]);
        }
        await tx.execute("UPDATE timers SET stopped_at = NULL, time_entry_id = NULL WHERE id = $1", [timerId]);
      }
      const running = await loadTimerById(tx, timerId);
      if (!running) throw new Error(TIME_ERRORS.undoUnavailable);
      return running;
    });
  } catch (error) {
    if (isUniqueViolation(error, "uq_timers_running")) throw new Error(TIME_ERRORS.undoBlocked);
    throw error;
  }
}

/** Throws the running timer away without logging time. */
export async function discardTimer(userId: string): Promise<void> {
  await db.execute("DELETE FROM timers WHERE user_id = $1 AND stopped_at IS NULL", [userId]);
}

/* ----------------------------- Time entries ----------------------------- */

/** Entries newest first (date, then creation), hydrated with person, project, task and phase. */
export async function listTimeEntries(filters: TimeEntryFilters): Promise<TimeEntryWithMeta[]> {
  const params = new Params();
  const where: string[] = [];
  if (filters.userId) where.push(`e.user_id = ${params.add(filters.userId)}`);
  if (filters.projectId) where.push(`e.project_id = ${params.add(filters.projectId)}`);
  if (filters.clientId) where.push(`p.client_id = ${params.add(filters.clientId)}`);
  if (filters.taskId) where.push(`e.task_id = ${params.add(filters.taskId)}`);
  if (filters.milestoneId) where.push(`e.milestone_id = ${params.add(filters.milestoneId)}`);
  if (filters.from) where.push(`e.entry_date >= ${params.add(filters.from)}`);
  if (filters.to) where.push(`e.entry_date <= ${params.add(filters.to)}`);
  if (filters.billable !== undefined) where.push(`e.billable = ${params.add(filters.billable)}`);
  const limit = Math.min(
    Math.max(1, Math.floor(filters.limit ?? TIME_ENTRY_LIST_DEFAULT_LIMIT)),
    TIME_ENTRY_LIST_MAX_LIMIT,
  );
  const rows = await db.query<EntryMetaRow>(
    `${ENTRY_META_SELECT}
     ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY e.entry_date DESC, e.created_at DESC, e.id ASC
     LIMIT ${params.add(limit)}`,
    params.values,
  );
  return rows.map(toEntryWithMeta);
}

export async function getTimeEntry(id: string): Promise<TimeEntry | null> {
  const row = await db.queryOne<EntryRow>(`SELECT ${ENTRY_COLUMNS} FROM time_entries e WHERE e.id = $1`, [id]);
  return row ? toEntry(row) : null;
}

/** One entry hydrated like listTimeEntries (dialogs, drawer). */
export async function getTimeEntryWithMeta(id: string): Promise<TimeEntryWithMeta | null> {
  const row = await db.queryOne<EntryMetaRow>(`${ENTRY_META_SELECT} WHERE e.id = $1`, [id]);
  return row ? toEntryWithMeta(row) : null;
}

/**
 * Logs time for `userId`. `billable` defaults to false on internal
 * engagements; `milestone_id` comes from the task.
 */
export async function logTime(userId: string, input: LogTimeInput): Promise<TimeEntry> {
  assertMinutes(input.minutes);
  assertDate(input.entry_date);
  const project = await loadEntryProject(db, input.project_id);
  const task = await loadEntryTask(db, input.task_id, input.project_id);
  return insertEntry(db, {
    user_id: userId,
    project_id: project.id,
    task_id: task?.id ?? null,
    milestone_id: task?.milestone_id ?? null,
    entry_date: input.entry_date,
    minutes: input.minutes,
    billable: input.billable ?? defaultBillable(project),
    note: (input.note ?? "").trim(),
    source: input.source ?? "manual",
  });
}

/** Updates only the provided keys; a project or task change re-derives the phase. */
export async function updateTimeEntry(id: string, patch: UpdateTimeEntryInput): Promise<TimeEntry> {
  if (patch.minutes !== undefined) assertMinutes(patch.minutes);
  if (patch.entry_date !== undefined) assertDate(patch.entry_date);
  try {
    return await transaction(async (tx) => {
      const current = await tx.queryOne<EntryRow>(
        `SELECT ${ENTRY_COLUMNS} FROM time_entries e WHERE e.id = $1 FOR UPDATE`,
        [id],
      );
      if (!current) throw new Error(TIME_ERRORS.entryMissing);

      const projectId = patch.project_id ?? current.project_id;
      const projectChanged = projectId !== current.project_id;
      if (projectChanged) await loadEntryProject(tx, projectId);

      let taskId = current.task_id;
      let milestoneId = current.milestone_id;
      if (patch.task_id !== undefined || projectChanged) {
        const requested = patch.task_id !== undefined ? patch.task_id : projectChanged ? null : current.task_id;
        const task = await loadEntryTask(tx, requested, projectId);
        taskId = task?.id ?? null;
        milestoneId = task?.milestone_id ?? null;
      }

      const row = await tx.queryOne<EntryRow>(
        `UPDATE time_entries e
            SET project_id = $2, task_id = $3, milestone_id = $4, entry_date = $5, minutes = $6,
                billable = $7, note = $8, updated_at = $9
          WHERE e.id = $1
          RETURNING ${ENTRY_COLUMNS}`,
        [
          id,
          projectId,
          taskId,
          milestoneId,
          patch.entry_date ?? current.entry_date,
          patch.minutes ?? current.minutes,
          patch.billable ?? current.billable,
          patch.note !== undefined ? patch.note.trim() : current.note,
          nowISO(),
        ],
      );
      if (!row) throw new Error(TIME_ERRORS.entryMissing);
      return toEntry(row);
    });
  } catch (error) {
    if (isUniqueViolation(error, "uq_time_entries_timesheet_cell")) throw new Error(TIME_ERRORS.cellTaken);
    throw error;
  }
}

export async function deleteTimeEntry(id: string): Promise<{ project_id: string }> {
  const row = await db.queryOne<{ project_id: string }>(
    "DELETE FROM time_entries WHERE id = $1 RETURNING project_id",
    [id],
  );
  if (!row) throw new Error(TIME_ERRORS.entryMissing);
  return row;
}

/* ------------------------------- Timesheet ------------------------------ */

interface TimesheetCellRow extends ProjectRefColumns, TaskRefColumns {
  project_id: string;
  task_id: string | null;
  entry_date: string;
  minutes: number;
}

function rowKey(projectId: string, taskId: string | null): string {
  return `${projectId}:${taskId ?? ""}`;
}

function compareRows(
  a: { project: ProjectSummary; task: TaskRef | null },
  b: { project: ProjectSummary; task: TaskRef | null },
): number {
  const byProject = a.project.name.localeCompare(b.project.name, "en", { sensitivity: "base" });
  if (byProject !== 0) return byProject;
  if (a.project.id !== b.project.id) return a.project.id < b.project.id ? -1 : 1;
  if (!a.task) return b.task ? -1 : 0;
  if (!b.task) return 1;
  return a.task.number - b.task.number;
}

/** The user's week (Monday..Sunday): one row per project/task with minutes per day and totals. */
export async function getTimesheet(userId: string, weekStart: string): Promise<TimesheetWeek> {
  const monday = startOfWeekISO(weekStart);
  const days = weekDaysISO(monday);
  const cells = await db.query<TimesheetCellRow>(
    `SELECT e.project_id, e.task_id, e.entry_date, SUM(e.minutes)::int AS minutes,
            ${PROJECT_REF_COLUMNS},
            ${TASK_REF_COLUMNS}
       FROM time_entries e
       JOIN projects p ON p.id = e.project_id
       LEFT JOIN clients cl ON cl.id = p.client_id
       LEFT JOIN tasks t ON t.id = e.task_id
      WHERE e.user_id = $1 AND e.entry_date >= $2 AND e.entry_date <= $3
      GROUP BY e.project_id, e.task_id, e.entry_date, p.name, p.color, p.status, cl.code,
               t.number, t.title, t.status, t.project_id`,
    [userId, days[0], days[6]],
  );

  const rows = new Map<string, TimesheetRow>();
  for (const cell of cells) {
    const key = rowKey(cell.project_id, cell.task_id);
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        project: toProjectSummary(cell.project_id, cell),
        task: toTaskRef(cell.task_id, cell),
        minutes: [0, 0, 0, 0, 0, 0, 0],
        total: 0,
      };
      rows.set(key, row);
    }
    const index = days.indexOf(cell.entry_date);
    if (index >= 0) {
      row.minutes[index] += cell.minutes;
      row.total += cell.minutes;
    }
  }

  const sorted = [...rows.values()].sort(compareRows);
  const dayTotals = days.map((_, index) => sorted.reduce((sum, row) => sum + row.minutes[index], 0));
  return {
    user_id: userId,
    week_start: monday,
    days,
    rows: sorted,
    day_totals: dayTotals,
    total: dayTotals.reduce((sum, value) => sum + value, 0),
  };
}

/**
 * Sets a timesheet cell's total to `minutes`. Manual and timer entries in the
 * cell are kept and counted, so the cell's single timesheet row holds the
 * rest (capped at MAX_ENTRY_MINUTES); at 0 or below the timesheet row is
 * deleted. The upsert on uq_time_entries_timesheet_cell makes overlapping
 * autosaves of one cell update the same row instead of doubling it.
 */
export async function setTimesheetCell(userId: string, input: TimesheetCellInput): Promise<void> {
  assertDate(input.entry_date);
  if (!Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > MAX_ENTRY_MINUTES) {
    throw new Error(TIME_ERRORS.minutesRange);
  }
  await transaction(async (tx) => {
    const project = await loadEntryProject(tx, input.project_id);
    const task = await loadEntryTask(tx, input.task_id, input.project_id);
    const taskId = task?.id ?? null;

    const other = await tx.queryOne<{ minutes: number }>(
      `SELECT COALESCE(SUM(minutes), 0)::int AS minutes
         FROM time_entries
        WHERE user_id = $1 AND project_id = $2 AND COALESCE(task_id, '') = COALESCE($3::text, '')
          AND entry_date = $4 AND source <> 'timesheet'`,
      [userId, project.id, taskId, input.entry_date],
    );
    const rest = Math.min(input.minutes - (other?.minutes ?? 0), MAX_ENTRY_MINUTES);

    if (rest <= 0) {
      await tx.execute(
        `DELETE FROM time_entries
          WHERE user_id = $1 AND project_id = $2 AND COALESCE(task_id, '') = COALESCE($3::text, '')
            AND entry_date = $4 AND source = 'timesheet'`,
        [userId, project.id, taskId, input.entry_date],
      );
      return;
    }

    const now = nowISO();
    await tx.execute(
      `INSERT INTO time_entries
         (id, user_id, project_id, task_id, milestone_id, entry_date, minutes, billable, note, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '', 'timesheet', $9, $9)
       ON CONFLICT (user_id, project_id, COALESCE(task_id, ''), entry_date) WHERE source = 'timesheet'
       DO UPDATE SET minutes = EXCLUDED.minutes, updated_at = EXCLUDED.updated_at`,
      [
        newId(),
        userId,
        project.id,
        taskId,
        task?.milestone_id ?? null,
        input.entry_date,
        rest,
        defaultBillable(project),
        now,
      ],
    );
  });
}

/** Distinct project/task rows of the week before `weekStart` ("Copy last week's rows"). */
export async function getPreviousWeekRows(
  userId: string,
  weekStart: string,
): Promise<Pick<TimesheetRow, "key" | "project" | "task">[]> {
  const monday = startOfWeekISO(weekStart);
  const from = addDaysISO(monday, -7);
  const to = addDaysISO(monday, -1);
  const rows = await db.query<TimesheetCellRow>(
    `SELECT DISTINCT e.project_id, e.task_id, ''::text AS entry_date, 0 AS minutes,
            ${PROJECT_REF_COLUMNS},
            ${TASK_REF_COLUMNS}
       FROM time_entries e
       JOIN projects p ON p.id = e.project_id
       LEFT JOIN clients cl ON cl.id = p.client_id
       LEFT JOIN tasks t ON t.id = e.task_id
      WHERE e.user_id = $1 AND e.entry_date >= $2 AND e.entry_date <= $3`,
    [userId, from, to],
  );
  return rows
    .map((row) => ({
      key: rowKey(row.project_id, row.task_id),
      project: toProjectSummary(row.project_id, row),
      task: toTaskRef(row.task_id, row),
    }))
    .sort(compareRows);
}

/* ------------------------- Summaries and budgets ------------------------ */

async function loadBudgetProject(q: Queryable, projectId: string): Promise<BudgetProjectRow | null> {
  return q.queryOne<BudgetProjectRow>(
    `SELECT id, name, owner_id, budget_hours, budget_period, start_date, due_date FROM projects WHERE id = $1`,
    [projectId],
  );
}

async function periodMinutes(q: Queryable, project: BudgetProjectRow, today: string): Promise<number> {
  const range = budgetPeriodRange(project.budget_period, today);
  const row = await q.queryOne<{ minutes: number }>(
    `SELECT COALESCE(SUM(minutes), 0)::int AS minutes FROM time_entries
      WHERE project_id = $1
        AND ($2::text IS NULL OR entry_date >= $2)
        AND ($3::text IS NULL OR entry_date <= $3)`,
    [project.id, range.from, range.to],
  );
  return row?.minutes ?? 0;
}

function burnFor(project: BudgetProjectRow, loggedMinutes: number, today: string): BudgetBurn | null {
  return computeBudgetBurn({
    budget_hours: project.budget_hours,
    budget_period: project.budget_period,
    start_date: project.start_date,
    due_date: project.due_date,
    logged_minutes: loggedMinutes,
    today,
  });
}

/** Burn against the hours budget for the current budget period (null without a budget). */
export async function getBudgetBurn(projectId: string, today: string): Promise<BudgetBurn | null> {
  const project = await loadBudgetProject(db, projectId);
  if (!project || project.budget_hours === null || project.budget_hours <= 0) return null;
  return burnFor(project, await periodMinutes(db, project, today), today);
}

/**
 * Minutes inside the project's current budget period, or null without a
 * budget. Actions read it before a write and pass it to
 * crossedBudgetThreshold / notifyBudgetThreshold afterwards.
 */
export async function getBudgetPeriodMinutes(projectId: string, today: string): Promise<number | null> {
  const project = await loadBudgetProject(db, projectId);
  if (!project || project.budget_hours === null || project.budget_hours <= 0) return null;
  return periodMinutes(db, project, today);
}

async function detectCrossing(
  projectId: string,
  today: string,
  beforeMinutes: number,
): Promise<{ project: BudgetProjectRow; burn: BudgetBurn } | null> {
  const project = await loadBudgetProject(db, projectId);
  if (!project || project.budget_hours === null || project.budget_hours <= 0) return null;
  const after = burnFor(project, await periodMinutes(db, project, today), today);
  const before = burnFor(project, beforeMinutes, today);
  if (!after || after.threshold === 0) return null;
  if (before && before.threshold >= after.threshold) return null;
  return { project, burn: after };
}

/** The threshold (75, 90, 100) newly crossed by the latest write, or null. */
export async function crossedBudgetThreshold(
  projectId: string,
  today: string,
  beforeMinutes: number,
): Promise<BudgetThreshold | null> {
  const crossing = await detectCrossing(projectId, today, beforeMinutes);
  return crossing ? crossing.burn.threshold : null;
}

/**
 * Event-driven `budget_threshold` notification for the project owner and
 * every active admin when the latest write crossed a threshold. Uses the same
 * dedupe key (and wording) as the lazy catch-up in notifications.ts, so a
 * threshold is announced once per recipient whichever path sees it first.
 * It is a system event (actor null), like the catch-up. Returns rows inserted.
 */
export async function notifyBudgetThreshold(projectId: string, today: string, beforeMinutes: number): Promise<number> {
  const crossing = await detectCrossing(projectId, today, beforeMinutes);
  if (!crossing) return 0;
  const { project, burn } = crossing;
  const admins = await db.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE");
  const recipients = [project.owner_id, ...admins.map((admin) => admin.id)].filter(
    (id): id is string => typeof id === "string",
  );
  const scope = burn.period === "monthly" ? "this month's" : "the";
  return notify({
    recipients,
    type: "budget_threshold",
    actor_id: null,
    project_id: project.id,
    title: `${project.name} has used ${burn.burn_pct}% of ${scope} hours budget`,
    body: `Crossed the ${burn.threshold}% threshold of ${burn.budget_hours}h.`,
    url: projectNotificationUrl(project.id, { tab: "time" }),
    dedupe_key: `budget:${project.id}:${burn.threshold}:${burn.period_start ?? "total"}`,
  });
}

interface SummaryTotalsRow {
  total_minutes: number;
  billable_minutes: number;
}

interface SummaryUserRow {
  id: string;
  name: string;
  email: string;
  color: string;
  job_title: string | null;
  minutes: number;
  billable_minutes: number;
}

interface SummaryMilestoneRow {
  id: string | null;
  name: string | null;
  kind: MilestoneKind | null;
  minutes: number;
}

interface SummaryTaskRow {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  project_id: string;
  estimate_minutes: number | null;
  logged_minutes: number;
}

/** Most task rows the project summary returns (estimate vs actual). */
const SUMMARY_TASK_LIMIT = 100;

/** Totals by person, by phase/milestone and estimate vs actual per task, plus budget burn. */
export async function getProjectTimeSummary(projectId: string, today: string): Promise<ProjectTimeSummary> {
  const [totals, users, milestones, tasks, budget] = await Promise.all([
    db.queryOne<SummaryTotalsRow>(
      `SELECT COALESCE(SUM(minutes), 0)::int AS total_minutes,
              COALESCE(SUM(minutes) FILTER (WHERE billable), 0)::int AS billable_minutes
         FROM time_entries WHERE project_id = $1`,
      [projectId],
    ),
    db.query<SummaryUserRow>(
      `SELECT u.id, u.name, u.email, u.color, u.job_title,
              SUM(e.minutes)::int AS minutes,
              COALESCE(SUM(e.minutes) FILTER (WHERE e.billable), 0)::int AS billable_minutes
         FROM time_entries e
         JOIN users u ON u.id = e.user_id
        WHERE e.project_id = $1
        GROUP BY u.id
        ORDER BY minutes DESC, lower(u.name) ASC`,
      [projectId],
    ),
    db.query<SummaryMilestoneRow>(
      `SELECT m.id, m.name, m.kind, SUM(e.minutes)::int AS minutes
         FROM time_entries e
         LEFT JOIN milestones m ON m.id = e.milestone_id
        WHERE e.project_id = $1
        GROUP BY m.id, m.name, m.kind, m.position
        ORDER BY m.position ASC NULLS LAST`,
      [projectId],
    ),
    db.query<SummaryTaskRow>(
      `SELECT t.id, t.number, t.title, t.status, t.project_id, t.estimate_minutes,
              COALESCE(SUM(e.minutes), 0)::int AS logged_minutes
         FROM tasks t
         LEFT JOIN time_entries e ON e.task_id = t.id
        WHERE t.project_id = $1
        GROUP BY t.id
       HAVING (t.estimate_minutes IS NOT NULL AND t.estimate_minutes > 0) OR COALESCE(SUM(e.minutes), 0) > 0
        ORDER BY logged_minutes DESC, t.number ASC
        LIMIT ${SUMMARY_TASK_LIMIT}`,
      [projectId],
    ),
    getBudgetBurn(projectId, today),
  ]);

  return {
    total_minutes: totals?.total_minutes ?? 0,
    billable_minutes: totals?.billable_minutes ?? 0,
    by_user: users.map((row) => ({
      user: { id: row.id, name: row.name, email: row.email, color: row.color, job_title: row.job_title },
      minutes: row.minutes,
      billable_minutes: row.billable_minutes,
    })),
    by_milestone: milestones.map((row) => ({
      milestone:
        row.id && row.name && row.kind ? ({ id: row.id, name: row.name, kind: row.kind } satisfies MilestoneRef) : null,
      minutes: row.minutes,
    })),
    by_task: tasks.map((row) => ({
      task: {
        id: row.id,
        number: row.number,
        key: taskKey(row.number),
        title: row.title,
        status: row.status,
        project_id: row.project_id,
      },
      estimate_minutes: row.estimate_minutes,
      logged_minutes: row.logged_minutes,
    })),
    budget,
  };
}

/** Minutes the user logged in the Monday-based week containing `today`. */
export async function getLoggedMinutesThisWeek(userId: string, today: string): Promise<number> {
  const monday = startOfWeekISO(today);
  const row = await db.queryOne<{ minutes: number }>(
    `SELECT COALESCE(SUM(minutes), 0)::int AS minutes FROM time_entries
      WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3`,
    [userId, monday, addDaysISO(monday, 6)],
  );
  return row?.minutes ?? 0;
}

/** Minutes per user id logged in the week containing `today` (Team page; one grouped query). */
export async function listLoggedMinutesThisWeek(today: string): Promise<Record<string, number>> {
  const monday = startOfWeekISO(today);
  const rows = await db.query<{ user_id: string; minutes: number }>(
    `SELECT user_id, SUM(minutes)::int AS minutes FROM time_entries
      WHERE entry_date >= $1 AND entry_date <= $2
      GROUP BY user_id`,
    [monday, addDaysISO(monday, 6)],
  );
  const result: Record<string, number> = {};
  for (const row of rows) result[row.user_id] = row.minutes;
  return result;
}

/* ------------------------- Capacity and cost rates ---------------------- */

/** Weekly capacity in hours (0..MAX_WEEKLY_CAPACITY_HOURS). Callers check admin. */
export async function setUserWeeklyCapacity(userId: string, hours: number): Promise<void> {
  if (!Number.isInteger(hours) || hours < 0 || hours > MAX_WEEKLY_CAPACITY_HOURS) {
    throw new Error(TIME_ERRORS.capacityRange);
  }
  const updated = await db.execute("UPDATE users SET weekly_capacity_hours = $2, updated_at = $3 WHERE id = $1", [
    userId,
    hours,
    nowISO(),
  ]);
  if (updated === 0) throw new Error(TIME_ERRORS.userMissing);
}

/** ADMIN-ONLY. Every user's internal cost rate (INR per hour), by name. */
export async function listUserCostRates(): Promise<UserCostRate[]> {
  return db.query<UserCostRate>("SELECT id AS user_id, cost_rate FROM users ORDER BY lower(name) ASC, id ASC");
}

/** ADMIN-ONLY. Sets (or clears with null) a user's cost rate in whole rupees per hour. */
export async function setUserCostRate(userId: string, rate: number | null): Promise<void> {
  if (rate !== null && (!Number.isInteger(rate) || rate < 0)) throw new Error(TIME_ERRORS.costRateRange);
  const updated = await db.execute("UPDATE users SET cost_rate = $2, updated_at = $3 WHERE id = $1", [
    userId,
    rate,
    nowISO(),
  ]);
  if (updated === 0) throw new Error(TIME_ERRORS.userMissing);
}

interface MarginProjectRow {
  id: string;
  name: string;
  color: string | null;
  status: ProjectStatus;
  client_code: string | null;
  currency: Currency | null;
  contract_value: number | null;
}

interface MarginPhaseRow {
  id: string;
  name: string;
  kind: MilestoneKind;
  price: number | null;
  minutes: number;
  cost_inr: number;
}

/**
 * ADMIN-ONLY. Approximate margin: the project's contract value (converted to
 * INR with app_settings.usd_inr_rate) minus logged cost (minutes / 60 x the
 * person's cost_rate; people without a rate count 0), and the same per phase
 * against each phase's fixed price.
 */
export async function getProjectMargin(projectId: string): Promise<ProjectMargin> {
  const [settings, project, cost, phases] = await Promise.all([
    getAppSettings({ includeCommercial: true }),
    db.queryOne<MarginProjectRow>(
      `SELECT p.id, p.name, p.color, p.status, cl.code AS client_code, p.currency, p.contract_value
         FROM projects p LEFT JOIN clients cl ON cl.id = p.client_id
        WHERE p.id = $1`,
      [projectId],
    ),
    db.queryOne<{ minutes: number; cost_inr: number }>(
      `SELECT COALESCE(SUM(e.minutes), 0)::int AS minutes,
              COALESCE(SUM(e.minutes * COALESCE(u.cost_rate, 0)) / 60.0, 0)::float8 AS cost_inr
         FROM time_entries e JOIN users u ON u.id = e.user_id
        WHERE e.project_id = $1`,
      [projectId],
    ),
    db.query<MarginPhaseRow>(
      `SELECT m.id, m.name, m.kind, m.price,
              COALESCE(SUM(e.minutes), 0)::int AS minutes,
              COALESCE(SUM(e.minutes * COALESCE(u.cost_rate, 0)) / 60.0, 0)::float8 AS cost_inr
         FROM milestones m
         LEFT JOIN time_entries e ON e.milestone_id = m.id
         LEFT JOIN users u ON u.id = e.user_id
        WHERE m.project_id = $1 AND m.kind = 'phase'
        GROUP BY m.id
        ORDER BY m.position ASC, m.created_at ASC`,
      [projectId],
    ),
  ]);
  if (!project) throw new Error(TIME_ERRORS.projectMissing);

  const rate = settings.usd_inr_rate ?? DEFAULT_USD_INR_RATE;
  const costInr = Math.round(cost?.cost_inr ?? 0);

  let projectRow: ProjectMargin["project"] = null;
  if (project.currency && project.contract_value !== null) {
    const contractInr = toInr(project.contract_value, project.currency, rate);
    const margin = contractInr - costInr;
    projectRow = {
      project: {
        id: project.id,
        name: project.name,
        color: project.color,
        status: project.status,
        client_code: project.client_code,
      },
      currency: project.currency,
      contract_value: project.contract_value,
      logged_minutes: cost?.minutes ?? 0,
      cost_inr: costInr,
      contract_value_inr: contractInr,
      approx_margin_inr: margin,
      margin_pct: contractInr === 0 ? null : Math.round((100 * margin) / contractInr),
      usd_inr_rate: rate,
    };
  }

  const phaseRows: PhaseMarginRow[] = phases.map((phase) => {
    const phaseCost = Math.round(phase.cost_inr);
    const price = project.currency ? phase.price : null;
    return {
      milestone: { id: phase.id, name: phase.name, kind: phase.kind },
      price,
      currency: project.currency,
      minutes: phase.minutes,
      cost_inr: phaseCost,
      approx_margin_inr:
        price !== null && project.currency ? toInr(price, project.currency, rate) - phaseCost : null,
    };
  });

  return { usd_inr_rate: rate, project: projectRow, phases: phaseRows };
}
