/**
 * Reports (SPEC.md sections 17.7, 19.1 /reports and 19.2 CSV exports).
 *
 * Read-only aggregations for the /reports page and the CSV export route
 * handlers. Every function takes the filters it needs; scope (admin or not)
 * is decided by the caller from the session, never from client input.
 * Functions marked ADMIN-ONLY may only be called after the caller checked
 * `user.role === "admin"`.
 *
 * Aggregates are cast in SQL (`::int` for counts and minute sums,
 * `::float8` for money and ratios). Timestamps are bucketed into workspace
 * dates with `dateInTimeZone`; date-only columns are compared as text.
 * Time entries are queried directly from `time_entries` (no dependency on
 * the time module).
 */
import { db, type SqlParam } from "@/lib/db";
import {
  DEFAULT_USD_INR_RATE,
  DELIVERY_STATE_CONFIG,
  ENGAGEMENT_TYPE_CONFIG,
  OPEN_RISK_STATUSES,
  OPEN_STATUSES,
  OPEN_TASK_STATUSES,
  PRIORITY_CONFIG,
  RAG_CONFIG,
  RISK_CATEGORY_ORDER,
  SERVICE_LINE_CONFIG,
  SERVICE_LINE_ORDER,
  STATUS_CONFIG,
  TASK_STATUS_CONFIG,
  WORKING_DAYS_PER_WEEK,
  WORKLOAD_WEEKS,
} from "@/lib/constants";
import { toInr } from "@/lib/money";
import {
  DELIVERY_STATES,
  INVOICE_STATUSES,
  PROJECT_STATUSES,
  type BudgetPeriod,
  type BurnRow,
  type ClientSummary,
  type ContractValueRow,
  type Currency,
  type DeliveryState,
  type EngagementType,
  type EvalMetrics,
  type HoursByClientRow,
  type HoursWeekPoint,
  type InvoiceStatus,
  type InvoiceStatusRow,
  type MarginRow,
  type MetricDirection,
  type OverdueByAssigneeRow,
  type PortfolioHealthReport,
  type ProjectStatus,
  type ProjectSummary,
  type ProjectWithMeta,
  type RagHealth,
  type ReportFilters,
  type RiskCategory,
  type ServiceLine,
  type ServiceLineStatusRow,
  type TaskFilters,
  type ThroughputPoint,
  type UserSummary,
  type WorkloadCell,
  type WorkloadRow,
} from "@/lib/types";
import { computeBudgetBurn, isUpdateDue, riskScore, riskSeverity, toCsv } from "@/lib/utils";
import {
  addDaysISO,
  dateInTimeZone,
  eachDayISO,
  endOfMonthISO,
  startOfMonthISO,
  startOfWeekISO,
  weekStartsBetween,
  safeTimeZone,
  workingDaysBetween,
} from "@/lib/workspace-time";
import { listProjects } from "./projects";
import { listTasks } from "./tasks";

/* ================================================================== */
/*                         Module-local report types                   */
/* ================================================================== */

/** Optional scope shared by the portfolio-level reports. */
export interface ReportScope {
  clientId?: string;
}

export interface DeliveryStateRow {
  delivery_state: DeliveryState;
  count: number;
}

export interface PhaseCountRow {
  /** Template phase key, or null for ad-hoc phases and for "no active phase". */
  phase_key: string | null;
  /** Display name; null = open engagements without an active phase. */
  name: string | null;
  count: number;
}

export interface OnTimeStat {
  on_time: number;
  late: number;
  total: number;
  /** round(100 * on_time / total), null without completed items. */
  rate: number | null;
}

/** Items completed inside the range that had a due date. */
export interface OnTimeDeliveryReport {
  tasks: OnTimeStat;
  milestones: OnTimeStat;
}

/** Open work past its due date (workspace today). */
export interface OverdueSummary {
  tasks: number;
  milestones: number;
  projects: number;
}

export interface HoursByProjectRow {
  project: ProjectSummary;
  minutes: number;
  billable_minutes: number;
}

export interface HoursByServiceLineRow {
  service_line: ServiceLine | null;
  minutes: number;
  billable_minutes: number;
}

export interface HoursByPersonRow {
  user: UserSummary;
  minutes: number;
  billable_minutes: number;
  /** weekly_capacity_hours spread over the working days of the range. */
  capacity_minutes: number;
  /** round(100 * minutes / capacity_minutes), null when capacity is 0. */
  utilization_pct: number | null;
}

export interface RiskExposureRow {
  category: RiskCategory;
  /** Open + mitigating items. */
  count: number;
  red: number;
  amber: number;
  /** Items without likelihood or impact. */
  unscored: number;
  /** Sum of likelihood x impact over scored items. */
  total_score: number;
}

export interface EvalImprovementRow {
  project: ProjectSummary;
  metric: string;
  /** From the scorecard metric of the same name ("" when there is none). */
  unit: string;
  direction: MetricDirection;
  baseline_label: string;
  baseline: number;
  champion_label: string;
  champion: number;
  champion_at: string;
  /** champion - baseline. */
  delta: number;
  /** delta moved in the metric's direction. */
  improved: boolean;
}

/** A workload cell with the hours already logged that week. */
export interface ReportWorkloadCell extends WorkloadCell {
  /** Minutes logged in time entries dated inside the week. */
  logged_minutes: number;
  /** round(100 * (minutes + logged_minutes) / capacity_minutes); 0 when capacity is 0. */
  total_pct: number;
}

export interface ReportWorkloadRow extends WorkloadRow {
  cells: ReportWorkloadCell[];
}

/** Filters accepted by the projects CSV export. */
export interface ProjectExportFilters {
  clientId?: string;
}

/* ================================================================== */
/*                                Helpers                              */
/* ================================================================== */

/** Collects bound values and hands out their `$n` placeholders. */
class Params {
  readonly values: SqlParam[] = [];

  add(value: SqlParam): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** Column list for a ProjectSummary of `p` (with `cl` = its client). */
const PROJECT_SUMMARY_COLUMNS = `p.id AS project_id, p.name AS project_name, p.color AS project_color,
  p.status AS project_status, cl.code AS client_code`;

interface ProjectSummaryColumns {
  project_id: string;
  project_name: string;
  project_color: string | null;
  project_status: ProjectStatus;
  client_code: string | null;
}

function toProjectSummary(row: ProjectSummaryColumns): ProjectSummary {
  return {
    id: row.project_id,
    name: row.project_name,
    color: row.project_color,
    status: row.project_status,
    client_code: row.client_code,
  };
}

interface UserColumns {
  user_id: string;
  user_name: string;
  user_email: string;
  user_color: string;
  user_job_title: string | null;
}

function toUserSummary(row: UserColumns): UserSummary {
  return {
    id: row.user_id,
    name: row.user_name,
    email: row.user_email,
    color: row.user_color,
    job_title: row.user_job_title,
  };
}

function pct(part: number, total: number): number | null {
  return total > 0 ? Math.round((100 * part) / total) : null;
}

function onTimeStat(onTime: number, late: number): OnTimeStat {
  const total = onTime + late;
  return { on_time: onTime, late, total, rate: pct(onTime, total) };
}

/** UTC instant (ISO) of the start of a date-only string, shifted by whole days. */
function instantOf(date: string, shiftDays = 0): string {
  return `${addDaysISO(date, shiftDays)}T00:00:00.000Z`;
}

function emptyStatusCounts(): Record<ProjectStatus, number> {
  return Object.fromEntries(PROJECT_STATUSES.map((status) => [status, 0])) as Record<ProjectStatus, number>;
}

function serviceLineRank(value: ServiceLine | null): number {
  return value === null ? SERVICE_LINE_ORDER.length : SERVICE_LINE_ORDER.indexOf(value);
}

/** `AND p.client_id = $n` when a client is set (p = projects alias). */
function clientClause(params: Params, clientId: string | undefined): string {
  return clientId ? ` AND p.client_id = ${params.add(clientId)}` : "";
}

/* ================================================================== */
/*                           Portfolio and delivery                    */
/* ================================================================== */

/**
 * Open top-level engagements by latest health, plus the at-risk list: red
 * first, then amber, then stale (`isUpdateDue`) green or not-yet-updated
 * projects. Commercial fields are stripped (never loaded with them).
 */
export async function getPortfolioHealth(
  today: string,
  cadenceDays: number,
  timeZone: string,
  scope: ReportScope = {},
): Promise<PortfolioHealthReport> {
  const projects = await listProjects({ parentId: null, status: OPEN_STATUSES, clientId: scope.clientId, sort: "name" });
  const counts: Record<RagHealth | "none", number> = { green: 0, amber: 0, red: 0, none: 0 };
  for (const project of projects) counts[project.health ?? "none"] += 1;

  const severity = (project: ProjectWithMeta) => (project.health ? RAG_CONFIG[project.health].severity : -1);
  const flagged = projects.filter((project) => project.health === "red" || project.health === "amber");
  flagged.sort((a, b) => severity(b) - severity(a));
  const stale = projects.filter(
    (project) => project.health !== "red" && project.health !== "amber" && isUpdateDue(project, today, cadenceDays, timeZone),
  );
  return { counts, at_risk: [...flagged, ...stale] };
}

/** Top-level projects per service line and status (null service line last). */
export async function projectsByServiceLine(scope: ReportScope = {}): Promise<ServiceLineStatusRow[]> {
  const params = new Params();
  const rows = await db.query<{ service_line: ServiceLine | null; status: ProjectStatus; count: number }>(
    `SELECT p.service_line, p.status, COUNT(*)::int AS count
       FROM projects p
      WHERE p.parent_id IS NULL${clientClause(params, scope.clientId)}
      GROUP BY p.service_line, p.status`,
    params.values,
  );
  const byLine = new Map<ServiceLine | null, Record<ProjectStatus, number>>();
  for (const row of rows) {
    const counts = byLine.get(row.service_line) ?? emptyStatusCounts();
    counts[row.status] += row.count;
    byLine.set(row.service_line, counts);
  }
  return [...byLine.entries()]
    .map(([service_line, counts]) => ({ service_line, counts }))
    .sort((a, b) => serviceLineRank(a.service_line) - serviceLineRank(b.service_line));
}

/** Open top-level engagements per delivery state (every state, in display order). */
export async function projectsByDeliveryState(scope: ReportScope = {}): Promise<DeliveryStateRow[]> {
  const params = new Params();
  const statuses = params.add(OPEN_STATUSES);
  const rows = await db.query<{ delivery_state: DeliveryState; count: number }>(
    `SELECT p.delivery_state, COUNT(*)::int AS count
       FROM projects p
      WHERE p.parent_id IS NULL AND p.status = ANY(${statuses}::text[])${clientClause(params, scope.clientId)}
      GROUP BY p.delivery_state`,
    params.values,
  );
  const counts = new Map(rows.map((row) => [row.delivery_state, row.count]));
  return [...DELIVERY_STATES]
    .sort((a, b) => DELIVERY_STATE_CONFIG[a].order - DELIVERY_STATE_CONFIG[b].order)
    .map((delivery_state) => ({ delivery_state, count: counts.get(delivery_state) ?? 0 }));
}

/**
 * Open top-level engagements per current phase (the first phase by position
 * that is active or in gate review, as in `ProjectWithMeta.current_phase`).
 * Phases are grouped by template key, else by name; engagements without an
 * active phase form the last row (`name: null`).
 */
export async function projectsByPhase(scope: ReportScope = {}): Promise<PhaseCountRow[]> {
  const params = new Params();
  const statuses = params.add(OPEN_STATUSES);
  const rows = await db.query<{ phase_key: string | null; group_key: string | null; name: string | null; count: number; first_position: number | null }>(
    `SELECT cp.phase_key, COALESCE(cp.phase_key, lower(cp.name)) AS group_key, MIN(cp.name) AS name,
            COUNT(*)::int AS count, MIN(cp.position)::int AS first_position
       FROM projects p
       LEFT JOIN LATERAL (
         SELECT m.phase_key, m.name, m.position
           FROM milestones m
          WHERE m.project_id = p.id AND m.kind = 'phase' AND m.status IN ('active', 'gate_review')
          ORDER BY m.position ASC, m.created_at ASC
          LIMIT 1
       ) cp ON TRUE
      WHERE p.parent_id IS NULL AND p.status = ANY(${statuses}::text[])${clientClause(params, scope.clientId)}
      GROUP BY cp.phase_key, COALESCE(cp.phase_key, lower(cp.name))`,
    params.values,
  );
  return rows
    .map((row) => ({ phase_key: row.group_key === null ? null : row.phase_key, name: row.group_key === null ? null : row.name, count: row.count, rank: row.first_position }))
    .sort((a, b) => {
      if (a.name === null) return 1;
      if (b.name === null) return -1;
      return (a.rank ?? 0) - (b.rank ?? 0) || b.count - a.count || a.name.localeCompare(b.name);
    })
    .map(({ phase_key, name, count }) => ({ phase_key, name, count }));
}

/**
 * Tasks created and completed per week (Monday starts) over the range.
 * `created_at`/`completed_at` are mapped to workspace dates with
 * `dateInTimeZone`; only dates inside from..to count. Every week of the
 * range is present (zeros included).
 */
export async function throughputByWeek(filters: ReportFilters, timeZone: string): Promise<ThroughputPoint[]> {
  if (filters.to < filters.from) return [];
  const params = new Params();
  // Widen the instant window by a day on each side to cover any UTC offset, then filter by workspace date.
  const lower = params.add(instantOf(filters.from, -1));
  const upper = params.add(instantOf(filters.to, 2));
  const rows = await db.query<{ created_at: string; completed_at: string | null; status: string }>(
    `SELECT t.created_at, t.completed_at, t.status
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
      WHERE ((t.created_at >= ${lower} AND t.created_at < ${upper})
          OR (t.status = 'done' AND t.completed_at >= ${lower} AND t.completed_at < ${upper}))${clientClause(params, filters.clientId)}`,
    params.values,
  );
  const weeks = weekStartsBetween(filters.from, filters.to);
  const points = new Map<string, ThroughputPoint>(weeks.map((week) => [week, { week_start: week, created: 0, completed: 0 }]));
  const inRange = (date: string) => date >= filters.from && date <= filters.to;
  for (const row of rows) {
    const created = dateInTimeZone(row.created_at, timeZone);
    if (inRange(created)) {
      const point = points.get(startOfWeekISO(created));
      if (point) point.created += 1;
    }
    if (row.status === "done" && row.completed_at) {
      const completed = dateInTimeZone(row.completed_at, timeZone);
      if (inRange(completed)) {
        const point = points.get(startOfWeekISO(completed));
        if (point) point.completed += 1;
      }
    }
  }
  return weeks.map((week) => points.get(week) as ThroughputPoint);
}

/**
 * Tasks and phases completed inside the range that had a due date: on time
 * when the completion's workspace date is on or before the due date.
 */
export async function onTimeDeliveryRate(filters: ReportFilters, timeZone: string): Promise<OnTimeDeliveryReport> {
  if (filters.to < filters.from) return { tasks: onTimeStat(0, 0), milestones: onTimeStat(0, 0) };
  const params = new Params();
  const lower = params.add(instantOf(filters.from, -1));
  const upper = params.add(instantOf(filters.to, 2));
  const client = clientClause(params, filters.clientId);
  const [tasks, milestones] = await Promise.all([
    db.query<{ completed_at: string; due_date: string }>(
      `SELECT t.completed_at, t.due_date
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
        WHERE t.status = 'done' AND t.due_date IS NOT NULL AND t.completed_at IS NOT NULL
          AND t.completed_at >= ${lower} AND t.completed_at < ${upper}${client}`,
      params.values,
    ),
    db.query<{ completed_at: string; due_date: string }>(
      `SELECT m.completed_at, m.due_date
         FROM milestones m
         JOIN projects p ON p.id = m.project_id
        WHERE m.status = 'done' AND m.due_date IS NOT NULL AND m.completed_at IS NOT NULL
          AND m.completed_at >= ${lower} AND m.completed_at < ${upper}${client}`,
      params.values,
    ),
  ]);
  const tally = (rows: { completed_at: string; due_date: string }[]): OnTimeStat => {
    let onTime = 0;
    let late = 0;
    for (const row of rows) {
      const done = dateInTimeZone(row.completed_at, timeZone);
      if (done < filters.from || done > filters.to) continue;
      if (done <= row.due_date) onTime += 1;
      else late += 1;
    }
    return onTimeStat(onTime, late);
  };
  return { tasks: tally(tasks), milestones: tally(milestones) };
}

/** Open tasks due before today per assignee (unassigned = `user: null`), most first. */
export async function overdueByAssignee(today: string, scope: ReportScope = {}): Promise<OverdueByAssigneeRow[]> {
  const params = new Params();
  const statuses = params.add(OPEN_TASK_STATUSES);
  const day = params.add(today);
  const rows = await db.query<Partial<UserColumns> & { count: number }>(
    `SELECT u.id AS user_id, u.name AS user_name, u.email AS user_email, u.color AS user_color,
            u.job_title AS user_job_title, COUNT(*)::int AS count
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.status = ANY(${statuses}::text[]) AND t.due_date IS NOT NULL AND t.due_date < ${day}${clientClause(params, scope.clientId)}
      GROUP BY u.id, u.name, u.email, u.color, u.job_title
      ORDER BY count DESC, u.name ASC NULLS LAST`,
    params.values,
  );
  return rows.map((row) => ({
    user: row.user_id ? toUserSummary(row as UserColumns) : null,
    count: row.count,
  }));
}

/** Open tasks, open phases/milestones and open projects (any depth) due before today. */
export async function overdueSummary(today: string, scope: ReportScope = {}): Promise<OverdueSummary> {
  const params = new Params();
  const day = params.add(today);
  const taskStatuses = params.add(OPEN_TASK_STATUSES);
  const projectStatuses = params.add(OPEN_STATUSES);
  const client = clientClause(params, scope.clientId);
  const row = await db.queryOne<OverdueSummary>(
    `SELECT
       (SELECT COUNT(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id
         WHERE t.status = ANY(${taskStatuses}::text[]) AND t.due_date IS NOT NULL AND t.due_date < ${day}${client}) AS tasks,
       (SELECT COUNT(*)::int FROM milestones m JOIN projects p ON p.id = m.project_id
         WHERE m.status IN ('planned', 'active', 'gate_review') AND m.due_date IS NOT NULL AND m.due_date < ${day}
           AND p.status = ANY(${projectStatuses}::text[])${client}) AS milestones,
       (SELECT COUNT(*)::int FROM projects p
         WHERE p.status = ANY(${projectStatuses}::text[]) AND p.due_date IS NOT NULL AND p.due_date < ${day}${client}) AS projects`,
    params.values,
  );
  return row ?? { tasks: 0, milestones: 0, projects: 0 };
}

/** Open and mitigating RAID items per category (categories without items left out), highest exposure first. */
export async function riskExposureByCategory(scope: ReportScope = {}): Promise<RiskExposureRow[]> {
  const params = new Params();
  const statuses = params.add(OPEN_RISK_STATUSES);
  const rows = await db.query<{ category: RiskCategory; likelihood: number | null; impact: number | null }>(
    `SELECT r.category, r.likelihood::int AS likelihood, r.impact::int AS impact
       FROM risks r
       JOIN projects p ON p.id = r.project_id
      WHERE r.status = ANY(${statuses}::text[])${clientClause(params, scope.clientId)}`,
    params.values,
  );
  const byCategory = new Map<RiskCategory, RiskExposureRow>();
  for (const row of rows) {
    const entry = byCategory.get(row.category) ?? { category: row.category, count: 0, red: 0, amber: 0, unscored: 0, total_score: 0 };
    entry.count += 1;
    const score = riskScore(row.likelihood, row.impact);
    if (score === null) entry.unscored += 1;
    else {
      entry.total_score += score;
      const severity = riskSeverity(score);
      if (severity === "red") entry.red += 1;
      else if (severity === "amber") entry.amber += 1;
    }
    byCategory.set(row.category, entry);
  }
  return [...byCategory.values()].sort(
    (a, b) =>
      b.total_score - a.total_score ||
      b.count - a.count ||
      RISK_CATEGORY_ORDER.indexOf(a.category) - RISK_CATEGORY_ORDER.indexOf(b.category),
  );
}

/**
 * Champion vs baseline per project and metric. The baseline is the earliest
 * run with verdict "baseline" (else the earliest non-champion run); metrics
 * are matched case-insensitively; unit and direction come from the scorecard
 * metric of the same name (default "higher"). Projects without a champion are
 * skipped.
 */
export async function evalImprovements(scope: ReportScope = {}): Promise<EvalImprovementRow[]> {
  const params = new Params();
  const client = clientClause(params, scope.clientId);
  const runs = await db.query<ProjectSummaryColumns & { label: string; verdict: string; metrics: EvalMetrics; created_at: string }>(
    `SELECT ${PROJECT_SUMMARY_COLUMNS}, e.label, e.verdict, e.metrics, e.created_at
       FROM eval_runs e
       JOIN projects p ON p.id = e.project_id
       LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE e.project_id IN (SELECT project_id FROM eval_runs WHERE verdict = 'champion')${client}
      ORDER BY lower(p.name) ASC, p.id ASC, e.created_at ASC, e.id ASC`,
    params.values,
  );
  if (runs.length === 0) return [];
  const projectIds = [...new Set(runs.map((run) => run.project_id))];
  const metrics = await db.query<{ project_id: string; name: string; unit: string; direction: MetricDirection }>(
    "SELECT project_id, name, unit, direction FROM success_metrics WHERE project_id = ANY($1::text[])",
    [projectIds],
  );
  const scorecard = new Map(metrics.map((metric) => [`${metric.project_id}:${metric.name.toLowerCase()}`, metric]));

  const result: EvalImprovementRow[] = [];
  for (const projectId of projectIds) {
    const projectRuns = runs.filter((run) => run.project_id === projectId);
    const champion = projectRuns.find((run) => run.verdict === "champion");
    const baseline =
      projectRuns.find((run) => run.verdict === "baseline") ?? projectRuns.find((run) => run.verdict !== "champion");
    if (!champion || !baseline) continue;
    const baselineValues = new Map(
      Object.entries(baseline.metrics ?? {}).map(([name, value]) => [name.toLowerCase(), { name, value }]),
    );
    for (const [name, value] of Object.entries(champion.metrics ?? {})) {
      const before = baselineValues.get(name.toLowerCase());
      if (!before || typeof value !== "number" || typeof before.value !== "number") continue;
      if (!Number.isFinite(value) || !Number.isFinite(before.value)) continue;
      const card = scorecard.get(`${projectId}:${name.toLowerCase()}`);
      const direction: MetricDirection = card?.direction ?? "higher";
      const delta = value - before.value;
      result.push({
        project: toProjectSummary(champion),
        metric: card?.name ?? name,
        unit: card?.unit ?? "",
        direction,
        baseline_label: baseline.label,
        baseline: before.value,
        champion_label: champion.label,
        champion: value,
        champion_at: champion.created_at,
        delta,
        improved: direction === "higher" ? delta > 0 : delta < 0,
      });
    }
  }
  return result;
}

/* ================================================================== */
/*                                  Time                               */
/* ================================================================== */

/** Billable and non-billable minutes per week (Monday starts) over the range; zeros included. */
export async function hoursByWeek(filters: ReportFilters): Promise<HoursWeekPoint[]> {
  if (filters.to < filters.from) return [];
  const params = new Params();
  const from = params.add(filters.from);
  const to = params.add(filters.to);
  const rows = await db.query<{ entry_date: string; billable: boolean; minutes: number }>(
    `SELECT te.entry_date, te.billable, SUM(te.minutes)::int AS minutes
       FROM time_entries te
       JOIN projects p ON p.id = te.project_id
      WHERE te.entry_date >= ${from} AND te.entry_date <= ${to}${clientClause(params, filters.clientId)}
      GROUP BY te.entry_date, te.billable`,
    params.values,
  );
  const weeks = weekStartsBetween(filters.from, filters.to);
  const points = new Map<string, HoursWeekPoint>(
    weeks.map((week) => [week, { week_start: week, billable_minutes: 0, non_billable_minutes: 0 }]),
  );
  for (const row of rows) {
    const point = points.get(startOfWeekISO(row.entry_date));
    if (!point) continue;
    if (row.billable) point.billable_minutes += row.minutes;
    else point.non_billable_minutes += row.minutes;
  }
  return weeks.map((week) => points.get(week) as HoursWeekPoint);
}

/** Minutes per client (no client = `client: null`), most first. */
export async function hoursByClient(filters: ReportFilters): Promise<HoursByClientRow[]> {
  if (filters.to < filters.from) return [];
  const params = new Params();
  const from = params.add(filters.from);
  const to = params.add(filters.to);
  const rows = await db.query<{
    client_id: string | null;
    client_name: string | null;
    client_code: string | null;
    client_color: string | null;
    client_currency: Currency | null;
    client_confidential: boolean | null;
    minutes: number;
    billable_minutes: number;
  }>(
    `SELECT cl.id AS client_id, cl.name AS client_name, cl.code AS client_code, cl.color AS client_color,
            cl.currency AS client_currency, cl.confidential AS client_confidential,
            SUM(te.minutes)::int AS minutes,
            COALESCE(SUM(te.minutes) FILTER (WHERE te.billable), 0)::int AS billable_minutes
       FROM time_entries te
       JOIN projects p ON p.id = te.project_id
       LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE te.entry_date >= ${from} AND te.entry_date <= ${to}${clientClause(params, filters.clientId)}
      GROUP BY cl.id, cl.name, cl.code, cl.color, cl.currency, cl.confidential
      ORDER BY minutes DESC, cl.name ASC NULLS LAST`,
    params.values,
  );
  return rows.map((row) => ({
    client:
      row.client_id && row.client_name && row.client_code && row.client_color && row.client_currency
        ? ({
            id: row.client_id,
            name: row.client_name,
            code: row.client_code,
            color: row.client_color,
            currency: row.client_currency,
            confidential: row.client_confidential === true,
          } satisfies ClientSummary)
        : null,
    minutes: row.minutes,
    billable_minutes: row.billable_minutes,
  }));
}

/** Minutes per project (any depth), most first. */
export async function hoursByProject(filters: ReportFilters, limit?: number): Promise<HoursByProjectRow[]> {
  if (filters.to < filters.from) return [];
  const params = new Params();
  const from = params.add(filters.from);
  const to = params.add(filters.to);
  const client = clientClause(params, filters.clientId);
  const limitSql = limit && limit > 0 ? ` LIMIT ${params.add(Math.floor(limit))}` : "";
  const rows = await db.query<ProjectSummaryColumns & { minutes: number; billable_minutes: number }>(
    `SELECT ${PROJECT_SUMMARY_COLUMNS},
            SUM(te.minutes)::int AS minutes,
            COALESCE(SUM(te.minutes) FILTER (WHERE te.billable), 0)::int AS billable_minutes
       FROM time_entries te
       JOIN projects p ON p.id = te.project_id
       LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE te.entry_date >= ${from} AND te.entry_date <= ${to}${client}
      GROUP BY p.id, p.name, p.color, p.status, cl.code
      ORDER BY minutes DESC, lower(p.name) ASC${limitSql}`,
    params.values,
  );
  return rows.map((row) => ({ project: toProjectSummary(row), minutes: row.minutes, billable_minutes: row.billable_minutes }));
}

/** Minutes per service line (null last), most first. */
export async function hoursByServiceLine(filters: ReportFilters): Promise<HoursByServiceLineRow[]> {
  if (filters.to < filters.from) return [];
  const params = new Params();
  const from = params.add(filters.from);
  const to = params.add(filters.to);
  const rows = await db.query<HoursByServiceLineRow>(
    `SELECT p.service_line, SUM(te.minutes)::int AS minutes,
            COALESCE(SUM(te.minutes) FILTER (WHERE te.billable), 0)::int AS billable_minutes
       FROM time_entries te
       JOIN projects p ON p.id = te.project_id
      WHERE te.entry_date >= ${from} AND te.entry_date <= ${to}${clientClause(params, filters.clientId)}
      GROUP BY p.service_line`,
    params.values,
  );
  return rows.sort((a, b) => b.minutes - a.minutes || serviceLineRank(a.service_line) - serviceLineRank(b.service_line));
}

/**
 * Minutes per person with utilisation against capacity over the range
 * (weekly_capacity_hours spread over the working days from..to). Every active
 * user is listed, plus inactive users who logged time in the range.
 */
export async function hoursByPerson(filters: ReportFilters): Promise<HoursByPersonRow[]> {
  if (filters.to < filters.from) return [];
  const params = new Params();
  const from = params.add(filters.from);
  const to = params.add(filters.to);
  const client = clientClause(params, filters.clientId);
  const rows = await db.query<UserColumns & { weekly_capacity_hours: number; minutes: number; billable_minutes: number }>(
    `SELECT u.id AS user_id, u.name AS user_name, u.email AS user_email, u.color AS user_color,
            u.job_title AS user_job_title, u.weekly_capacity_hours::int AS weekly_capacity_hours,
            COALESCE(h.minutes, 0)::int AS minutes, COALESCE(h.billable_minutes, 0)::int AS billable_minutes
       FROM users u
       LEFT JOIN (
         SELECT te.user_id, SUM(te.minutes)::int AS minutes,
                COALESCE(SUM(te.minutes) FILTER (WHERE te.billable), 0)::int AS billable_minutes
           FROM time_entries te
           JOIN projects p ON p.id = te.project_id
          WHERE te.entry_date >= ${from} AND te.entry_date <= ${to}${client}
          GROUP BY te.user_id
       ) h ON h.user_id = u.id
      WHERE u.is_active = TRUE OR h.minutes > 0
      ORDER BY minutes DESC, u.name ASC`,
    params.values,
  );
  const workingDays = workingDaysBetween(filters.from, filters.to).length;
  return rows.map((row) => {
    const capacity = Math.round((row.weekly_capacity_hours * 60 * workingDays) / WORKING_DAYS_PER_WEEK);
    return {
      user: toUserSummary(row),
      minutes: row.minutes,
      billable_minutes: row.billable_minutes,
      capacity_minutes: capacity,
      utilization_pct: pct(row.minutes, capacity),
    };
  });
}

/**
 * Budget burn of every open project (any depth) with an hours budget:
 * minutes inside `budgetPeriodRange` (the current month for monthly budgets,
 * everything for total budgets), highest burn first.
 */
export async function burnByProject(today: string, scope: ReportScope = {}): Promise<BurnRow[]> {
  const params = new Params();
  const statuses = params.add(OPEN_STATUSES);
  const monthStart = params.add(startOfMonthISO(today));
  const monthEnd = params.add(endOfMonthISO(today));
  const rows = await db.query<
    ProjectSummaryColumns & {
      budget_hours: number;
      budget_period: BudgetPeriod;
      start_date: string | null;
      due_date: string | null;
      logged_minutes: number;
    }
  >(
    `SELECT ${PROJECT_SUMMARY_COLUMNS}, p.budget_hours::int AS budget_hours, p.budget_period, p.start_date, p.due_date,
            COALESCE((
              SELECT SUM(te.minutes) FROM time_entries te
               WHERE te.project_id = p.id
                 AND (p.budget_period = 'total' OR (te.entry_date >= ${monthStart} AND te.entry_date <= ${monthEnd}))
            ), 0)::int AS logged_minutes
       FROM projects p
       LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE p.status = ANY(${statuses}::text[]) AND p.budget_hours IS NOT NULL AND p.budget_hours > 0${clientClause(params, scope.clientId)}`,
    params.values,
  );
  const result: BurnRow[] = [];
  for (const row of rows) {
    const burn = computeBudgetBurn({
      budget_hours: row.budget_hours,
      budget_period: row.budget_period,
      start_date: row.start_date,
      due_date: row.due_date,
      logged_minutes: row.logged_minutes,
      today,
    });
    if (burn) result.push({ project: toProjectSummary(row), burn });
  }
  return result.sort((a, b) => b.burn.burn_pct - a.burn.burn_pct || a.project.name.localeCompare(b.project.name));
}

/* ================================================================== */
/*                                Workload                             */
/* ================================================================== */

/**
 * People x weeks, starting with the week of `today`. Each open assigned task
 * with a due date and an estimate contributes its remaining estimate
 * (estimate minus minutes already logged on it, never below 0), spread
 * evenly over the working days from its start date (or today, whichever is
 * later) to its due date; overdue work lands on today. Days before today are
 * never planned (that part of the week shows as `logged_minutes`). Tasks
 * without a due date or estimate are skipped. Active users only, by name.
 */
export async function workloadGrid(today: string, weeks: number = WORKLOAD_WEEKS): Promise<ReportWorkloadRow[]> {
  const weekCount = Math.max(1, Math.min(Math.floor(weeks), 26));
  const firstWeek = startOfWeekISO(today);
  const weekStarts = Array.from({ length: weekCount }, (_, index) => addDaysISO(firstWeek, index * 7));
  const gridEnd = addDaysISO(firstWeek, weekCount * 7 - 1);

  const [users, tasks, logged] = await Promise.all([
    db.query<UserColumns & { weekly_capacity_hours: number }>(
      `SELECT id AS user_id, name AS user_name, email AS user_email, color AS user_color,
              job_title AS user_job_title, weekly_capacity_hours::int AS weekly_capacity_hours
         FROM users WHERE is_active = TRUE ORDER BY name ASC`,
    ),
    db.query<{ assignee_id: string; start_date: string | null; due_date: string; remaining: number }>(
      `SELECT t.assignee_id, t.start_date, t.due_date,
              GREATEST(t.estimate_minutes - COALESCE((SELECT SUM(te.minutes) FROM time_entries te WHERE te.task_id = t.id), 0), 0)::int
                AS remaining
         FROM tasks t
         JOIN users u ON u.id = t.assignee_id AND u.is_active = TRUE
        WHERE t.status = ANY($1::text[]) AND t.estimate_minutes IS NOT NULL AND t.estimate_minutes > 0
          AND t.due_date IS NOT NULL AND (t.start_date IS NULL OR t.start_date <= $2)`,
      [OPEN_TASK_STATUSES, gridEnd],
    ),
    db.query<{ user_id: string; entry_date: string; minutes: number }>(
      `SELECT user_id, entry_date, SUM(minutes)::int AS minutes
         FROM time_entries
        WHERE entry_date >= $1 AND entry_date <= $2
        GROUP BY user_id, entry_date`,
      [firstWeek, gridEnd],
    ),
  ]);

  const planned = new Map<string, Map<string, number>>();
  const addPlanned = (userId: string, week: string, minutes: number) => {
    const byWeek = planned.get(userId) ?? new Map<string, number>();
    byWeek.set(week, (byWeek.get(week) ?? 0) + minutes);
    planned.set(userId, byWeek);
  };
  for (const task of tasks) {
    if (task.remaining <= 0) continue;
    const start = task.start_date && task.start_date > today ? task.start_date : today;
    const end = task.due_date < start ? start : task.due_date;
    let days = workingDaysBetween(start, end);
    if (days.length === 0) days = eachDayISO(start, end);
    const share = task.remaining / days.length;
    for (const day of days) {
      if (day > gridEnd) break;
      addPlanned(task.assignee_id, startOfWeekISO(day), share);
    }
  }

  const loggedByUser = new Map<string, Map<string, number>>();
  for (const row of logged) {
    const byWeek = loggedByUser.get(row.user_id) ?? new Map<string, number>();
    const week = startOfWeekISO(row.entry_date);
    byWeek.set(week, (byWeek.get(week) ?? 0) + row.minutes);
    loggedByUser.set(row.user_id, byWeek);
  }

  return users.map((user) => {
    const capacity = user.weekly_capacity_hours * 60;
    const cells = weekStarts.map((week): ReportWorkloadCell => {
      const minutes = Math.round(planned.get(user.user_id)?.get(week) ?? 0);
      const loggedMinutes = loggedByUser.get(user.user_id)?.get(week) ?? 0;
      return {
        week_start: week,
        minutes,
        capacity_minutes: capacity,
        pct: capacity > 0 ? Math.round((100 * minutes) / capacity) : 0,
        logged_minutes: loggedMinutes,
        total_pct: capacity > 0 ? Math.round((100 * (minutes + loggedMinutes)) / capacity) : 0,
      };
    });
    return { user: toUserSummary(user), weekly_capacity_hours: user.weekly_capacity_hours, cells };
  });
}

/* ================================================================== */
/*                         ADMIN-ONLY: commercial                      */
/* ================================================================== */

/** ADMIN-ONLY. The USD-INR rate and the workspace timezone, straight from app_settings. */
async function readMarginSettings(): Promise<{ rate: number; timeZone: string }> {
  const row = await db.queryOne<{ usd_inr_rate: number; workspace_timezone: string }>(
    "SELECT usd_inr_rate::float8 AS usd_inr_rate, workspace_timezone FROM app_settings WHERE id = 1",
  );
  const rate = row && Number.isFinite(row.usd_inr_rate) && row.usd_inr_rate > 0 ? row.usd_inr_rate : DEFAULT_USD_INR_RATE;
  return { rate, timeZone: safeTimeZone(row?.workspace_timezone) };
}

/**
 * ADMIN-ONLY. Contract value of open top-level engagements per engagement
 * type and currency. INR and USD are separate rows and are never summed.
 */
export async function contractValueByCurrency(scope: ReportScope = {}): Promise<ContractValueRow[]> {
  const params = new Params();
  const statuses = params.add(OPEN_STATUSES);
  const rows = await db.query<ContractValueRow>(
    `SELECT p.engagement_type, p.currency, SUM(p.contract_value)::float8 AS amount, COUNT(*)::int AS project_count
       FROM projects p
      WHERE p.parent_id IS NULL AND p.status = ANY(${statuses}::text[])
        AND p.contract_value IS NOT NULL AND p.currency IS NOT NULL${clientClause(params, scope.clientId)}
      GROUP BY p.engagement_type, p.currency`,
    params.values,
  );
  const typeRank = (value: EngagementType | null) => (value === null ? 99 : ENGAGEMENT_TYPE_CONFIG[value].order);
  return rows.sort((a, b) => a.currency.localeCompare(b.currency) || typeRank(a.engagement_type) - typeRank(b.engagement_type));
}

/** ADMIN-ONLY. Phase prices per currency and invoice status (every status of a present currency). */
export async function invoiceStatusSummary(scope: ReportScope = {}): Promise<InvoiceStatusRow[]> {
  const params = new Params();
  const rows = await db.query<InvoiceStatusRow>(
    `SELECT p.currency, m.invoice_status AS status, SUM(m.price)::float8 AS amount, COUNT(*)::int AS count
       FROM milestones m
       JOIN projects p ON p.id = m.project_id
      WHERE m.price IS NOT NULL AND p.currency IS NOT NULL${clientClause(params, scope.clientId)}
      GROUP BY p.currency, m.invoice_status`,
    params.values,
  );
  const currencies = [...new Set(rows.map((row) => row.currency))].sort();
  const result: InvoiceStatusRow[] = [];
  for (const currency of currencies) {
    for (const status of INVOICE_STATUSES as readonly InvoiceStatus[]) {
      const row = rows.find((item) => item.currency === currency && item.status === status);
      result.push({ currency, status, amount: row?.amount ?? 0, count: row?.count ?? 0 });
    }
  }
  return result;
}

/**
 * ADMIN-ONLY. Approximate margin per project with a contract value: open
 * projects plus those completed on or after `filters.from` (workspace date). Cost = every
 * time entry of the project (lifetime) at the logger's cost rate (users
 * without a rate count 0); USD contracts are converted with
 * app_settings.usd_inr_rate. Lowest margin first.
 */
export async function marginByProject(filters: ReportFilters): Promise<MarginRow[]> {
  const params = new Params();
  const statuses = params.add(OPEN_STATUSES);
  const since = params.add(instantOf(filters.from, -1));
  const [{ rate, timeZone }, rows] = await Promise.all([
    readMarginSettings(),
    db.query<
      ProjectSummaryColumns & { currency: Currency; contract_value: number; logged_minutes: number; cost_inr: number; completed_at: string | null }
    >(
      `SELECT ${PROJECT_SUMMARY_COLUMNS}, p.currency, p.contract_value::float8 AS contract_value, p.completed_at,
              COALESCE(c.logged_minutes, 0)::int AS logged_minutes, COALESCE(c.cost_inr, 0)::float8 AS cost_inr
         FROM projects p
         LEFT JOIN clients cl ON cl.id = p.client_id
         LEFT JOIN (
           SELECT te.project_id, SUM(te.minutes)::int AS logged_minutes,
                  SUM(te.minutes::float8 / 60.0 * COALESCE(u.cost_rate, 0))::float8 AS cost_inr
             FROM time_entries te
             JOIN users u ON u.id = te.user_id
            GROUP BY te.project_id
         ) c ON c.project_id = p.id
        WHERE p.contract_value IS NOT NULL AND p.currency IS NOT NULL
          AND (p.status = ANY(${statuses}::text[]) OR (p.status = 'completed' AND p.completed_at >= ${since}))${clientClause(params, filters.clientId)}`,
      params.values,
    ),
  ]);
  return rows
    .filter((row) => row.project_status !== "completed" || (row.completed_at !== null && dateInTimeZone(row.completed_at, timeZone) >= filters.from))
    .map((row): MarginRow => {
      const costInr = Math.round(row.cost_inr);
      const valueInr = toInr(row.contract_value, row.currency, rate);
      const margin = valueInr - costInr;
      return {
        project: toProjectSummary(row),
        currency: row.currency,
        contract_value: row.contract_value,
        logged_minutes: row.logged_minutes,
        cost_inr: costInr,
        contract_value_inr: valueInr,
        approx_margin_inr: margin,
        margin_pct: pct(margin, valueInr),
        usd_inr_rate: rate,
      };
    })
    .sort(
      (a, b) =>
        (a.margin_pct ?? Number.POSITIVE_INFINITY) - (b.margin_pct ?? Number.POSITIVE_INFINITY) ||
        a.project.name.localeCompare(b.project.name),
    );
}

/* ================================================================== */
/*                               CSV exports                           */
/* ================================================================== */

function hours(minutes: number | null | undefined): number | null {
  return minutes === null || minutes === undefined ? null : Math.round((minutes / 60) * 100) / 100;
}

/**
 * Every project (any depth) as CSV. Contract value and hourly rate columns
 * exist only when `includeCommercial` (pass `user.role === "admin"`).
 * Confidential clients appear as their code in the client column.
 */
export async function exportProjectsCsv(includeCommercial: boolean, filters: ProjectExportFilters = {}): Promise<string> {
  const params = new Params();
  const where = filters.clientId ? `WHERE p.client_id = ${params.add(filters.clientId)}` : "";
  const commercialColumns = includeCommercial ? ", p.contract_value, p.hourly_rate" : "";
  const rows = await db.query<{
    id: string;
    name: string;
    parent_name: string | null;
    client_name: string | null;
    client_code: string | null;
    client_confidential: boolean | null;
    service_line: ServiceLine | null;
    engagement_type: EngagementType | null;
    status: ProjectStatus;
    priority: keyof typeof PRIORITY_CONFIG;
    delivery_state: DeliveryState;
    health: RagHealth | null;
    owner_name: string | null;
    start_date: string | null;
    due_date: string | null;
    go_live_date: string | null;
    progress: number;
    budget_hours: number | null;
    budget_period: BudgetPeriod;
    currency: Currency | null;
    contract_value?: number | null;
    hourly_rate?: number | null;
    logged_minutes: number;
    created_at: string;
    completed_at: string | null;
  }>(
    `SELECT p.id, p.name, par.name AS parent_name, cl.name AS client_name, cl.code AS client_code,
            cl.confidential AS client_confidential, p.service_line, p.engagement_type, p.status, p.priority,
            p.delivery_state, p.health, o.name AS owner_name, p.start_date, p.due_date, p.go_live_date,
            p.progress::int AS progress, p.budget_hours::int AS budget_hours, p.budget_period, p.currency${commercialColumns},
            COALESCE((SELECT SUM(te.minutes) FROM time_entries te WHERE te.project_id = p.id), 0)::int AS logged_minutes,
            p.created_at, p.completed_at
       FROM projects p
       LEFT JOIN projects par ON par.id = p.parent_id
       LEFT JOIN clients cl ON cl.id = p.client_id
       LEFT JOIN users o ON o.id = p.owner_id
       ${where}
      ORDER BY lower(p.name) ASC, p.created_at ASC`,
    params.values,
  );
  const headers = [
    "ID",
    "Name",
    "Parent",
    "Client",
    "Client code",
    "Service line",
    "Engagement type",
    "Status",
    "Priority",
    "Delivery state",
    "Health",
    "Owner",
    "Start date",
    "Due date",
    "Go-live date",
    "Progress %",
    "Budget hours",
    "Budget period",
    "Logged hours",
    "Currency",
    ...(includeCommercial ? ["Contract value", "Hourly rate"] : []),
    "Created",
    "Completed",
  ];
  const body = rows.map((row) => [
    row.id,
    row.name,
    row.parent_name,
    row.client_confidential ? row.client_code : row.client_name,
    row.client_code,
    row.service_line ? SERVICE_LINE_CONFIG[row.service_line].label : null,
    row.engagement_type ? ENGAGEMENT_TYPE_CONFIG[row.engagement_type].label : null,
    STATUS_CONFIG[row.status].label,
    PRIORITY_CONFIG[row.priority].label,
    DELIVERY_STATE_CONFIG[row.delivery_state].label,
    row.health ? RAG_CONFIG[row.health].label : null,
    row.owner_name,
    row.start_date,
    row.due_date,
    row.go_live_date,
    row.progress,
    row.budget_hours,
    row.budget_period,
    hours(row.logged_minutes),
    row.currency,
    ...(includeCommercial ? [row.contract_value ?? null, row.hourly_rate ?? null] : []),
    row.created_at,
    row.completed_at,
  ]);
  return toCsv(headers, body);
}

/** Most rows a tasks export returns. */
export const MAX_TASK_EXPORT_ROWS = 10_000;

/**
 * Tasks matching `filters` as CSV (listTasks ordering; at most
 * MAX_TASK_EXPORT_ROWS). The client column is the client code, so
 * confidential client names never appear.
 */
export async function exportTasksCsv(filters: TaskFilters): Promise<string> {
  const limit = Math.min(filters.limit ?? MAX_TASK_EXPORT_ROWS, MAX_TASK_EXPORT_ROWS);
  const tasks = await listTasks({ ...filters, limit });
  const headers = [
    "Key",
    "Title",
    "Project",
    "Client",
    "Phase",
    "Status",
    "Priority",
    "Assignee",
    "Start date",
    "Due date",
    "Estimate hours",
    "Logged hours",
    "Deliverable",
    "Approved by",
    "Approved on",
    "Labels",
    "Created",
    "Completed",
  ];
  const body = tasks.map((task) => [
    task.key,
    task.title,
    task.project.name,
    task.project.client_code,
    task.milestone?.name ?? null,
    TASK_STATUS_CONFIG[task.status].label,
    PRIORITY_CONFIG[task.priority].label,
    task.assignee?.name ?? null,
    task.start_date,
    task.due_date,
    hours(task.estimate_minutes),
    hours(task.logged_minutes),
    task.is_deliverable ? "Yes" : "No",
    task.approved_by_name,
    task.approved_on,
    task.labels.map((label) => label.name).join("; "),
    task.created_at,
    task.completed_at,
  ]);
  return toCsv(headers, body);
}
