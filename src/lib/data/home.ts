import { db } from "@/lib/db";
import {
  HANDOVER_PHASE_KEY,
  MILESTONE_DUE_WINDOW_DAYS,
  OPEN_RISK_STATUSES,
  OPEN_STATUSES,
  OPEN_TASK_STATUSES,
  TUNING_ENDING_WINDOW_DAYS,
} from "@/lib/constants";
import { emptyTotals } from "@/lib/money";
import {
  CURRENCIES,
  type Activity,
  type Currency,
  type CurrencyTotals,
  type GateAwaiting,
  type HomeStats,
  type MilestoneDue,
  type MilestoneKind,
  type MilestoneStatus,
  type MilestoneSummary,
  type Priority,
  type ProjectStatus,
  type ProjectSummary,
  type ProjectWithMeta,
  type RagHealth,
  type RiskCategory,
  type RiskKind,
  type RiskStatus,
  type RunningTimer,
  type StaleUpdate,
  type TaskRef,
  type TaskStatus,
  type TaskWithMeta,
  type TuningWindow,
  type User,
  type UserSummary,
  type WorkspaceDateContext,
} from "@/lib/types";
import { isUpdateDue, riskScore, riskSeverity, taskKey } from "@/lib/utils";
import {
  addDaysISO,
  dateInTimeZone,
  diffDaysISO,
  startOfWeekISO,
  tuningEndDate,
  workspaceHour,
} from "@/lib/workspace-time";
import { listRecentActivity } from "./activity";
import { countUnread, generateTimeBasedNotifications, pruneReadNotifications } from "./notifications";
import { listMyProjects } from "./projects";
import { countOverdueRiskReviews } from "./risks";
import { listMyTasks } from "./tasks";

/*
 * Home dashboard 2.0 (SPEC.md §17.7 `home`). Everything the bento needs comes
 * from `getHomeData`, which runs every read in parallel. Time entries and
 * timers are queried directly here (the `time` module is a sibling). Admin-only
 * commercial figures are loaded only when the server-side user is an admin.
 */

/* ------------------------------- Types ---------------------------------- */

/** Open project with its latest health, for the portfolio strip. */
export type PortfolioHealthEntry = ProjectSummary & {
  health: RagHealth | null;
  health_updated_at: string | null;
};

/** Portfolio counts by latest health ("none" = no status update yet). */
export type HealthCounts = Record<RagHealth | "none", number>;

/** The slice of a task the "Today" tile renders (keeps the client payload small). */
export interface HomeTask {
  id: string;
  key: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  is_blocked: boolean;
  project: ProjectSummary;
}

/** My open assigned tasks by workspace date: the "Today" focus tile. */
export interface HomeMyWork {
  overdue: HomeTask[];
  today: HomeTask[];
  /** Tomorrow to the end of the ISO week (Monday start). */
  this_week: HomeTask[];
  later_count: number;
  no_date_count: number;
}

export interface HomeRisk {
  id: string;
  title: string;
  kind: RiskKind;
  category: RiskCategory;
  status: RiskStatus;
  likelihood: number | null;
  impact: number | null;
  score: number | null;
  severity: RagHealth | null;
  review_date: string | null;
  owner: UserSummary | null;
  project: ProjectSummary;
}

/** ADMIN-ONLY. Contract value of open top-level engagements, one total per currency (never summed across). */
export interface HomeContractValue {
  totals: CurrencyTotals;
  project_counts: Record<Currency, number>;
}

export type DayPart = "morning" | "afternoon" | "evening";

export interface HomeGreeting {
  first_name: string;
  day_part: DayPart;
  /** Workspace today. */
  today: string;
}

export interface HomeData {
  greeting: HomeGreeting;
  stats: HomeStats;
  my_work: HomeMyWork;
  running_timer: RunningTimer | null;
  /** Open projects I own, created or belong to (commercial fields always stripped). */
  my_projects: ProjectWithMeta[];
  portfolio: PortfolioHealthEntry[];
  health_counts: HealthCounts;
  /** Admins, and members who own an open project (gate deciders). */
  can_decide_gates: boolean;
  /** Admins: every gate; owners: gates of the projects they own; others: empty. */
  gates: GateAwaiting[];
  stale_updates: StaleUpdate[];
  milestones_due: MilestoneDue[];
  tuning_ending: TuningWindow[];
  top_risks: HomeRisk[];
  /** My open risk items whose review date has passed. */
  my_overdue_risk_reviews: number;
  activity: Activity[];
  unread_count: number;
  /** ADMIN-ONLY: null for members. */
  contract_value: HomeContractValue | null;
}

/* ------------------------------ Row shapes ------------------------------ */

interface ProjectRefColumns {
  project_id: string;
  project_name: string;
  project_color: string | null;
  project_status: ProjectStatus;
  client_code: string | null;
}

interface MilestoneRow extends ProjectRefColumns {
  id: string;
  name: string;
  kind: MilestoneKind;
  status: MilestoneStatus;
  phase_key: string | null;
  start_date: string | null;
  due_date: string | null;
}

interface GateRow extends MilestoneRow {
  requested_at: string;
}

interface TimerRow extends ProjectRefColumns {
  id: string;
  user_id: string;
  task_id: string | null;
  note: string;
  started_at: string;
  stopped_at: string | null;
  time_entry_id: string | null;
  task_number: number | null;
  task_title: string | null;
  task_status: TaskStatus | null;
}

interface TuningRow extends ProjectRefColumns {
  go_live_date: string;
  tuning_days: number;
  handover_total: number;
  handover_done: number;
}

interface StaleRow extends ProjectRefColumns {
  health_updated_at: string | null;
  created_at: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_color: string | null;
  owner_job_title: string | null;
}

interface PortfolioRow extends ProjectRefColumns {
  health: RagHealth | null;
  health_updated_at: string | null;
}

interface RiskRow extends ProjectRefColumns {
  id: string;
  title: string;
  kind: RiskKind;
  category: RiskCategory;
  status: RiskStatus;
  likelihood: number | null;
  impact: number | null;
  review_date: string | null;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_color: string | null;
  owner_job_title: string | null;
}

/* ------------------------------ SQL pieces ------------------------------ */

/** Project reference columns; every query aliases `projects p` and `clients cl`. */
const PROJECT_REF = `p.id AS project_id, p.name AS project_name, p.color AS project_color,
  p.status AS project_status, cl.code AS client_code`;

const MILESTONE_COLUMNS = `m.id, m.name, m.kind, m.status, m.phase_key, m.start_date, m.due_date`;

/** Phases and milestones that still need to happen. */
const OPEN_MILESTONE_STATUSES: MilestoneStatus[] = ["planned", "active", "gate_review"];

/** RAID kinds that describe a threat (decisions are a record, not a risk). */
const THREAT_RISK_KINDS: RiskKind[] = ["risk", "issue", "dependency", "assumption"];

/** Hard caps so a busy workspace never streams hundreds of rows into one tile. */
const MILESTONES_DUE_LIMIT = 50;
const TOP_RISKS_DEFAULT_LIMIT = 5;
const MY_PROJECTS_LIMIT = 6;
const RECENT_ACTIVITY_LIMIT = 10;

/** Red first, then amber, then projects without an update, then green. */
const HEALTH_RANK = `CASE p.health WHEN 'red' THEN 0 WHEN 'amber' THEN 1 WHEN 'green' THEN 3 ELSE 2 END`;

/* ------------------------------- Mapping -------------------------------- */

function toProjectSummary(row: ProjectRefColumns): ProjectSummary {
  return {
    id: row.project_id,
    name: row.project_name,
    color: row.project_color,
    status: row.project_status,
    client_code: row.client_code,
  };
}

function toMilestoneSummary(row: MilestoneRow): MilestoneSummary {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    phase_key: row.phase_key,
    start_date: row.start_date,
    due_date: row.due_date,
  };
}

function toOwner(row: {
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_color: string | null;
  owner_job_title: string | null;
}): UserSummary | null {
  if (!row.owner_id || row.owner_name === null) return null;
  return {
    id: row.owner_id,
    name: row.owner_name,
    email: row.owner_email ?? "",
    color: row.owner_color ?? "#64748b",
    job_title: row.owner_job_title,
  };
}

function toHomeTask(task: TaskWithMeta): HomeTask {
  return {
    id: task.id,
    key: task.key,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
    is_blocked: task.is_blocked,
    project: task.project,
  };
}

export function dayPartForHour(hour: number): DayPart {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function firstNameOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.split(/\s+/)[0] || trimmed || name;
}

/* -------------------------------- Stats --------------------------------- */

/**
 * KPI numbers for Home: active engagements (open top-level projects with a
 * client), my open and overdue assigned tasks, my minutes logged this ISO week
 * against my weekly capacity, and open top-level projects at risk (amber/red).
 */
export async function getHomeStats(userId: string, today: string): Promise<HomeStats> {
  const weekStart = startOfWeekISO(today);
  const weekEnd = addDaysISO(weekStart, 6);
  const row = await db.queryOne<HomeStats>(
    `SELECT
       (SELECT COUNT(*)::int FROM projects p
         WHERE p.parent_id IS NULL AND p.client_id IS NOT NULL AND p.status = ANY($2::text[]))
         AS active_engagements,
       (SELECT COUNT(*)::int FROM tasks t
         WHERE t.assignee_id = $1 AND t.status = ANY($3::text[])) AS my_open_tasks,
       (SELECT COUNT(*)::int FROM tasks t
         WHERE t.assignee_id = $1 AND t.status = ANY($3::text[])
           AND t.due_date IS NOT NULL AND t.due_date < $4) AS my_overdue_tasks,
       (SELECT COALESCE(SUM(e.minutes), 0)::int FROM time_entries e
         WHERE e.user_id = $1 AND e.entry_date >= $5 AND e.entry_date <= $6) AS hours_this_week_minutes,
       COALESCE((SELECT u.weekly_capacity_hours * 60 FROM users u WHERE u.id = $1), 0)::int
         AS capacity_minutes,
       (SELECT COUNT(*)::int FROM projects p
         WHERE p.parent_id IS NULL AND p.status = ANY($2::text[]) AND p.health IN ('red', 'amber'))
         AS at_risk_projects`,
    [userId, OPEN_STATUSES, OPEN_TASK_STATUSES, today, weekStart, weekEnd],
  );
  return (
    row ?? {
      active_engagements: 0,
      my_open_tasks: 0,
      my_overdue_tasks: 0,
      hours_this_week_minutes: 0,
      capacity_minutes: 0,
      at_risk_projects: 0,
    }
  );
}

/* ------------------------------ Delivery -------------------------------- */

/**
 * Phases waiting for a Go / Extend once / Stop decision on open projects,
 * longest waiting first. `requested_at` is the latest `gate_requested`
 * activity of the phase (falling back to the phase's `updated_at`).
 * `ownerId` narrows to projects that user owns (members decide only those).
 */
export async function listGatesAwaiting(options: { ownerId?: string } = {}): Promise<GateAwaiting[]> {
  const rows = await db.query<GateRow>(
    `SELECT ${MILESTONE_COLUMNS}, ${PROJECT_REF},
            COALESCE(
              (SELECT MAX(a.created_at) FROM activity a
                WHERE a.project_id = m.project_id AND a.type = 'gate_requested'
                  AND a.meta->>'milestone_id' = m.id),
              m.updated_at
            ) AS requested_at
       FROM milestones m
       JOIN projects p ON p.id = m.project_id
       LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE m.status = 'gate_review' AND p.status = ANY($1::text[])
        AND ($2::text IS NULL OR p.owner_id = $2)
      ORDER BY requested_at ASC, m.position ASC`,
    [OPEN_STATUSES, options.ownerId ?? null],
  );
  return rows.map((row) => ({
    milestone: toMilestoneSummary(row),
    project: toProjectSummary(row),
    requested_at: row.requested_at,
  }));
}

/**
 * Phases and point milestones of open projects that are not done or stopped
 * and are due on or before `today + days` (overdue ones included, negative
 * `days_left`), soonest first.
 */
export async function listMilestonesDue(
  today: string,
  days: number = MILESTONE_DUE_WINDOW_DAYS,
): Promise<MilestoneDue[]> {
  const horizon = addDaysISO(today, Math.max(0, Math.floor(days)));
  const rows = await db.query<MilestoneRow>(
    `SELECT ${MILESTONE_COLUMNS}, ${PROJECT_REF}
       FROM milestones m
       JOIN projects p ON p.id = m.project_id
       LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE m.status = ANY($1::text[]) AND p.status = ANY($2::text[])
        AND m.due_date IS NOT NULL AND m.due_date <= $3
      ORDER BY m.due_date ASC, lower(p.name) ASC, m.position ASC
      LIMIT ${MILESTONES_DUE_LIMIT}`,
    [OPEN_MILESTONE_STATUSES, OPEN_STATUSES, horizon],
  );
  return rows.map((row) => ({
    milestone: toMilestoneSummary(row),
    project: toProjectSummary(row),
    days_left: diffDaysISO(today, row.due_date ?? today),
  }));
}

/**
 * Open tuning windows (go-live set, tuning not closed, project open) that end
 * within `days` of `today`, plus windows that already ended but were never
 * closed (negative `days_left`). Handover progress counts the non-cancelled
 * deliverables of the `scale` phase. Soonest end first.
 */
export async function listTuningEnding(
  today: string,
  days: number = TUNING_ENDING_WINDOW_DAYS,
): Promise<TuningWindow[]> {
  const rows = await db.query<TuningRow>(
    `SELECT ${PROJECT_REF}, p.go_live_date, p.tuning_days,
            COALESCE(h.total, 0)::int AS handover_total, COALESCE(h.done, 0)::int AS handover_done
       FROM projects p
       LEFT JOIN clients cl ON cl.id = p.client_id
       LEFT JOIN LATERAL (
         SELECT m.id FROM milestones m
          WHERE m.project_id = p.id AND m.phase_key = $2 AND m.kind = 'phase'
          ORDER BY m.position ASC, m.created_at ASC
          LIMIT 1
       ) s ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE t.status <> 'cancelled')::int AS total,
                COUNT(*) FILTER (WHERE t.status = 'done')::int AS done
           FROM tasks t
          WHERE t.milestone_id = s.id AND t.is_deliverable
       ) h ON TRUE
      WHERE p.go_live_date IS NOT NULL AND p.tuning_closed_at IS NULL AND p.status = ANY($1::text[])`,
    [OPEN_STATUSES, HANDOVER_PHASE_KEY],
  );
  const windowDays = Math.max(0, Math.floor(days));
  const windows: TuningWindow[] = [];
  for (const row of rows) {
    const end = tuningEndDate(row.go_live_date, row.tuning_days);
    if (!end) continue;
    const daysLeft = diffDaysISO(today, end);
    if (daysLeft > windowDays) continue;
    windows.push({
      project: toProjectSummary(row),
      go_live_date: row.go_live_date,
      end_date: end,
      tuning_days: row.tuning_days,
      days_left: daysLeft,
      handover_total: row.handover_total,
      handover_done: row.handover_done,
    });
  }
  return windows.sort((a, b) => a.days_left - b.days_left || a.project.name.localeCompare(b.project.name));
}

/**
 * Open top-level projects whose weekly status update is due: exactly
 * `isUpdateDue(project, today, cadenceDays, timeZone)` (ongoing, last update
 * or creation on or before today - cadence, as a workspace date). Never
 * updated first, then the longest silence.
 */
export async function listStaleUpdates(today: string, cadenceDays: number, timeZone: string): Promise<StaleUpdate[]> {
  const rows = await db.query<StaleRow>(
    `SELECT ${PROJECT_REF}, p.health_updated_at, p.created_at, p.owner_id,
            o.name AS owner_name, o.email AS owner_email, o.color AS owner_color,
            o.job_title AS owner_job_title
       FROM projects p
       LEFT JOIN clients cl ON cl.id = p.client_id
       LEFT JOIN users o ON o.id = p.owner_id
      WHERE p.parent_id IS NULL AND p.status = ANY($1::text[])`,
    [OPEN_STATUSES],
  );
  const stale: StaleUpdate[] = [];
  for (const row of rows) {
    const due = isUpdateDue(
      { status: row.project_status, health_updated_at: row.health_updated_at, created_at: row.created_at },
      today,
      cadenceDays,
      timeZone,
    );
    if (!due) continue;
    stale.push({
      project: toProjectSummary(row),
      owner: toOwner(row),
      last_update_at: row.health_updated_at,
      days_since: row.health_updated_at
        ? diffDaysISO(dateInTimeZone(row.health_updated_at, timeZone), today)
        : null,
    });
  }
  return stale.sort((a, b) => {
    if (a.days_since === null && b.days_since !== null) return -1;
    if (b.days_since === null && a.days_since !== null) return 1;
    return (b.days_since ?? 0) - (a.days_since ?? 0) || a.project.name.localeCompare(b.project.name);
  });
}

/** Open top-level projects with their latest health: red, amber, no update, then green; by name. */
export async function listPortfolioHealth(): Promise<PortfolioHealthEntry[]> {
  const rows = await db.query<PortfolioRow>(
    `SELECT ${PROJECT_REF}, p.health, p.health_updated_at
       FROM projects p
       LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE p.parent_id IS NULL AND p.status = ANY($1::text[])
      ORDER BY ${HEALTH_RANK}, lower(p.name) ASC, p.created_at ASC`,
    [OPEN_STATUSES],
  );
  return rows.map((row) => ({
    ...toProjectSummary(row),
    health: row.health,
    health_updated_at: row.health_updated_at,
  }));
}

/** Counts per latest health of a portfolio list. */
export function countHealth(entries: readonly { health: RagHealth | null }[]): HealthCounts {
  const counts: HealthCounts = { green: 0, amber: 0, red: 0, none: 0 };
  for (const entry of entries) counts[entry.health ?? "none"] += 1;
  return counts;
}

/**
 * Highest-scoring open/mitigating RAID threats (risks, issues, dependencies,
 * assumptions; decisions excluded) on open projects. Unscored items sort last.
 */
export async function listTopRisks(limit: number = TOP_RISKS_DEFAULT_LIMIT): Promise<HomeRisk[]> {
  const rows = await db.query<RiskRow>(
    `SELECT r.id, r.title, r.kind, r.category, r.status, r.likelihood::int AS likelihood,
            r.impact::int AS impact, r.review_date, r.owner_id,
            u.name AS owner_name, u.email AS owner_email, u.color AS owner_color,
            u.job_title AS owner_job_title, ${PROJECT_REF}
       FROM risks r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN clients cl ON cl.id = p.client_id
       LEFT JOIN users u ON u.id = r.owner_id
      WHERE r.status = ANY($1::text[]) AND r.kind = ANY($2::text[]) AND p.status = ANY($3::text[])
      ORDER BY (r.likelihood * r.impact) DESC NULLS LAST, r.review_date ASC NULLS LAST,
               r.created_at DESC, r.id ASC
      LIMIT $4`,
    [OPEN_RISK_STATUSES, THREAT_RISK_KINDS, OPEN_STATUSES, Math.max(1, Math.floor(limit))],
  );
  return rows.map((row) => {
    const score = riskScore(row.likelihood, row.impact);
    return {
      id: row.id,
      title: row.title,
      kind: row.kind,
      category: row.category,
      status: row.status,
      likelihood: row.likelihood,
      impact: row.impact,
      score,
      severity: riskSeverity(score),
      review_date: row.review_date,
      owner: toOwner(row),
      project: toProjectSummary(row),
    };
  });
}

/* ------------------------------ Personal -------------------------------- */

/** My running timer with its project and task (queried directly; `time` owns the timer writes). */
async function loadRunningTimer(userId: string): Promise<RunningTimer | null> {
  const row = await db.queryOne<TimerRow>(
    `SELECT tm.id, tm.user_id, tm.task_id, tm.note, tm.started_at, tm.stopped_at, tm.time_entry_id,
            ${PROJECT_REF},
            t.number AS task_number, t.title AS task_title, t.status AS task_status
       FROM timers tm
       JOIN projects p ON p.id = tm.project_id
       LEFT JOIN clients cl ON cl.id = p.client_id
       LEFT JOIN tasks t ON t.id = tm.task_id
      WHERE tm.user_id = $1 AND tm.stopped_at IS NULL
      ORDER BY tm.started_at DESC
      LIMIT 1`,
    [userId],
  );
  if (!row) return null;
  const task: TaskRef | null =
    row.task_id && row.task_number !== null && row.task_title !== null && row.task_status !== null
      ? {
          id: row.task_id,
          number: row.task_number,
          key: taskKey(row.task_number),
          title: row.task_title,
          status: row.task_status,
          project_id: row.project_id,
        }
      : null;
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    task_id: row.task_id,
    note: row.note,
    started_at: row.started_at,
    stopped_at: row.stopped_at,
    time_entry_id: row.time_entry_id,
    project: toProjectSummary(row),
    task,
  };
}

async function loadMyWork(userId: string, today: string): Promise<HomeMyWork> {
  const groups = await listMyTasks(userId, "assigned", today);
  return {
    overdue: groups.overdue.map(toHomeTask),
    today: groups.today.map(toHomeTask),
    this_week: groups.this_week.map(toHomeTask),
    later_count: groups.later.length,
    no_date_count: groups.no_date.length,
  };
}

async function ownsOpenProject(userId: string): Promise<boolean> {
  const row = await db.queryOne<{ owns: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM projects p WHERE p.owner_id = $1 AND p.status = ANY($2::text[])
     ) AS owns`,
    [userId, OPEN_STATUSES],
  );
  return row?.owns === true;
}

/* ------------------------------ Commercial ------------------------------ */

/**
 * ADMIN-ONLY. Contract value of open top-level engagements per currency
 * (INR and USD are reported separately, never added together).
 */
export async function getOpenContractValue(): Promise<HomeContractValue> {
  const rows = await db.query<{ currency: Currency; amount: number; project_count: number }>(
    `SELECT p.currency, COALESCE(SUM(p.contract_value), 0)::float8 AS amount, COUNT(*)::int AS project_count
       FROM projects p
      WHERE p.parent_id IS NULL AND p.status = ANY($1::text[])
        AND p.contract_value IS NOT NULL AND p.currency IS NOT NULL
      GROUP BY p.currency`,
    [OPEN_STATUSES],
  );
  const totals = emptyTotals();
  const counts = Object.fromEntries(CURRENCIES.map((currency) => [currency, 0])) as Record<Currency, number>;
  for (const row of rows) {
    if (!CURRENCIES.includes(row.currency)) continue;
    totals[row.currency] = row.amount;
    counts[row.currency] = row.project_count;
  }
  return { totals, project_counts: counts };
}

/* ------------------------------ Notifications --------------------------- */

/**
 * The lazy, idempotent time-based notification pass (due soon, update due,
 * tuning ending, budget thresholds) plus pruning of old read notifications.
 * Best effort: failures are logged and Home still renders.
 */
export async function syncHomeNotifications(userId: string, context: WorkspaceDateContext): Promise<void> {
  try {
    await Promise.all([
      generateTimeBasedNotifications(userId, context.today, context.timeZone, { cadenceDays: context.cadenceDays }),
      pruneReadNotifications(userId, context.today),
    ]);
  } catch (error) {
    console.error("Home: time-based notifications failed", error);
  }
}

/* -------------------------------- Loader -------------------------------- */

/**
 * Everything Home renders, loaded in parallel for the signed-in `user` (the
 * server's user, never client input). `context` is the workspace today,
 * timezone and update cadence the page already read. Runs the lazy
 * notification pass first in its branch so the unread count includes the
 * notifications it creates. Commercial data is loaded only for admins.
 */
export async function getHomeData(
  user: Pick<User, "id" | "name" | "role">,
  context: WorkspaceDateContext,
  now: Date = new Date(),
): Promise<HomeData> {
  const isAdmin = user.role === "admin";
  const { today, timeZone, cadenceDays } = context;

  const [
    stats,
    myWork,
    runningTimer,
    myProjects,
    portfolio,
    owns,
    gates,
    staleUpdates,
    milestonesDue,
    tuningEnding,
    topRisks,
    myOverdueReviews,
    activity,
    unreadCount,
    contractValue,
  ] = await Promise.all([
    getHomeStats(user.id, today),
    loadMyWork(user.id, today),
    loadRunningTimer(user.id),
    listMyProjects(user.id, MY_PROJECTS_LIMIT, { includeCommercial: false }),
    listPortfolioHealth(),
    isAdmin ? Promise.resolve(true) : ownsOpenProject(user.id),
    listGatesAwaiting(isAdmin ? {} : { ownerId: user.id }),
    listStaleUpdates(today, cadenceDays, timeZone),
    listMilestonesDue(today),
    listTuningEnding(today),
    listTopRisks(),
    countOverdueRiskReviews(today, user.id),
    listRecentActivity(RECENT_ACTIVITY_LIMIT),
    syncHomeNotifications(user.id, context).then(() => countUnread(user.id)),
    isAdmin ? getOpenContractValue() : Promise.resolve(null),
  ]);

  return {
    greeting: {
      first_name: firstNameOf(user.name),
      day_part: dayPartForHour(workspaceHour(timeZone, now)),
      today,
    },
    stats,
    my_work: myWork,
    running_timer: runningTimer,
    my_projects: myProjects,
    portfolio,
    health_counts: countHealth(portfolio),
    can_decide_gates: owns,
    gates,
    stale_updates: staleUpdates,
    milestones_due: milestonesDue,
    tuning_ending: tuningEnding,
    top_risks: topRisks,
    my_overdue_risk_reviews: myOverdueReviews,
    activity,
    unread_count: unreadCount,
    contract_value: isAdmin ? contractValue : null,
  };
}
