import { db, newId, nowISO, transaction, type Queryable, type SqlParam } from "@/lib/db";
import { MAX_GATE_EXTENSIONS, MAX_SUCCESS_METRICS, RISK_SCORE_RED } from "@/lib/constants";
import type {
  CreateMetricInput,
  EvalMetrics,
  EvalRunWithMeta,
  GateDecision,
  GateDecisionInput,
  GateReviewData,
  Milestone,
  MilestoneStatus,
  MilestoneSummary,
  MetricSnapshot,
  ProjectQueryOptions,
  RiskWithMeta,
  SuccessMetric,
  SuccessMetricWithStatus,
  MetricTrendPoint,
  UpdateMetricInput,
  UserSummary,
} from "@/lib/types";
import { metricIsMet, metricProgress, riskScore, riskSeverity } from "@/lib/utils";
import { getWorkspaceToday } from "./app-settings";
import { activateNextPhase, getMilestone, listDeliverables, listGateHistory } from "./milestones";
import { getProjectSummary } from "./projects";
import { recomputeProjectProgress } from "./tasks";

/*
 * Success scorecard and go / no-go gates (SPEC §17.6, W4 scorecard).
 *
 * - Rates are fractions 0-1; unit "%" is display-only (formatMetricValue).
 * - Metric names are unique per project, case-insensitively
 *   (uq_success_metrics_project_name); eval-run metrics match them by
 *   lower(name) for trends.
 * - Gate decisions run in one transaction that locks the project row, then
 *   the milestone (both FOR NO KEY UPDATE, the order every phase writer uses),
 *   and the UPDATE itself is guarded by `status = 'gate_review'`, so two
 *   concurrent decisions cannot both apply.
 * - Champion runs and open risks are read from eval_runs / risks directly
 *   (no imports of sibling W4 modules).
 */

/* ------------------------------ Errors ---------------------------------- */

/** User-facing messages thrown by this module (actions pass them through). */
export const SCORECARD_ERRORS = {
  metricNotFound: "This metric no longer exists.",
  projectNotFound: "This project no longer exists.",
  phaseNotFound: "This phase no longer exists.",
  duplicateName: "A metric with this name already exists.",
  tooMany: `A scorecard holds at most ${MAX_SUCCESS_METRICS} metrics. Remove one first.`,
  reasonRequired: "Give a reason for changing the baseline, target or direction after the scorecard was locked.",
  rateRange: "Percent values must be between 0% and 100%.",
  notInGateReview: "This phase is no longer waiting for a gate decision. Someone may have decided it already.",
  extendUsed: `This phase was already extended${MAX_GATE_EXTENSIONS > 1 ? ` ${MAX_GATE_EXTENSIONS} times` : " once"}. Decide Go or Stop.`,
  extendNeedsFixes: "List what must be fixed before the next review.",
  extendNeedsDate: "Pick the new due date for the extension.",
  extendDateOrder: "The new due date must be on or after the phase's start date.",
} as const;

/* ------------------------------ Row shapes ------------------------------ */

type MetricRow = SuccessMetric;

interface TrendRow {
  key: string;
  value: number;
  label: string;
  created_at: string;
  verdict: string;
}

interface ChampionRow {
  id: string;
  project_id: string;
  milestone_id: string | null;
  label: string;
  change_type: EvalRunWithMeta["change_type"];
  model_name: string;
  prompt_version: string;
  dataset_version: string;
  metrics: unknown;
  verdict: EvalRunWithMeta["verdict"];
  external_url: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  creator_name: string | null;
  creator_email: string | null;
  creator_color: string | null;
  creator_job_title: string | null;
  milestone_name: string | null;
}

interface RiskRow {
  id: string;
  project_id: string;
  kind: RiskWithMeta["kind"];
  category: RiskWithMeta["category"];
  title: string;
  description: string;
  likelihood: number | null;
  impact: number | null;
  owner_id: string | null;
  mitigation: string;
  status: RiskWithMeta["status"];
  review_date: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_color: string | null;
  owner_job_title: string | null;
  project_name: string;
}

interface GateMilestoneRow {
  id: string;
  project_id: string;
  kind: Milestone["kind"];
  status: MilestoneStatus;
  start_date: string | null;
  extend_count: number;
}

/* ------------------------------ SQL pieces ------------------------------ */

const METRIC_COLUMNS = `id, project_id, name, unit, direction, baseline, target, current,
  current_measured_at, locked_at, position, notes, created_at, updated_at`;

/** How many trend points each metric carries (the most recent ones). */
const TREND_POINTS_MAX = 24;

/* ------------------------------ Helpers --------------------------------- */

class Params {
  readonly values: SqlParam[] = [];

  add(value: SqlParam): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

function isRate(unit: string, value: number | null | undefined): boolean {
  return unit !== "%" || value === null || value === undefined || (value >= 0 && value <= 1);
}

function assertRates(unit: string, values: (number | null | undefined)[]): void {
  if (values.some((value) => !isRate(unit, value))) throw new Error(SCORECARD_ERRORS.rateRange);
}

/** DOUBLE PRECISION comes back as a number; guard anyway (older drivers return strings). */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toMetric(row: MetricRow): SuccessMetric {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    unit: row.unit,
    direction: row.direction,
    baseline: num(row.baseline),
    target: num(row.target) ?? 0,
    current: num(row.current),
    current_measured_at: row.current_measured_at,
    locked_at: row.locked_at,
    position: row.position,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function withStatus(metric: SuccessMetric, trend: MetricTrendPoint[]): SuccessMetricWithStatus {
  return {
    ...metric,
    is_met: metricIsMet(metric.direction, metric.current, metric.target),
    progress_pct: metricProgress(metric.direction, metric.baseline, metric.current, metric.target),
    trend,
  };
}

function summary(id: string | null, name: string | null, email: string | null, color: string | null, jobTitle: string | null): UserSummary | null {
  if (!id || name === null) return null;
  return { id, name, email: email ?? "", color: color ?? "#64748b", job_title: jobTitle };
}

function parseEvalMetrics(raw: unknown): EvalMetrics {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  const metrics: EvalMetrics = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (typeof entry === "number" && Number.isFinite(entry)) metrics[key] = entry;
    }
  }
  return metrics;
}

/** Snapshot rows for gate decisions and status updates (no ids, no trends). */
export function snapshotMetrics(metrics: readonly SuccessMetricWithStatus[]): MetricSnapshot[] {
  return metrics.map((metric) => ({
    name: metric.name,
    unit: metric.unit,
    direction: metric.direction,
    baseline: metric.baseline,
    target: metric.target,
    current: metric.current,
    is_met: metric.is_met,
  }));
}

/* ------------------------------- Metrics -------------------------------- */

/**
 * Scorecard metrics of a project by position, with met / progress status and
 * the trend of eval-run metrics of the same name (case-insensitive), oldest
 * first (at most TREND_POINTS_MAX recent points).
 */
export async function listMetrics(projectId: string, q: Queryable = db): Promise<SuccessMetricWithStatus[]> {
  const rows = await q.query<MetricRow>(
    `SELECT ${METRIC_COLUMNS} FROM success_metrics WHERE project_id = $1 ORDER BY position ASC, created_at ASC`,
    [projectId],
  );
  if (rows.length === 0) return [];
  const metrics = rows.map(toMetric);
  const keys = [...new Set(metrics.map((metric) => metric.name.toLowerCase()))];

  const trendRows = await q.query<TrendRow>(
    `SELECT lower(kv.key) AS key, (kv.value)::float8 AS value, e.label, e.created_at, e.verdict
       FROM eval_runs e
      CROSS JOIN LATERAL jsonb_each(e.metrics) AS kv(key, value)
      WHERE e.project_id = $1
        AND jsonb_typeof(kv.value) = 'number'
        AND lower(kv.key) = ANY($2::text[])
      ORDER BY e.created_at ASC, e.id ASC`,
    [projectId, keys],
  );
  const trends = new Map<string, MetricTrendPoint[]>();
  for (const row of trendRows) {
    const value = num(row.value);
    if (value === null) continue;
    const list = trends.get(row.key) ?? [];
    list.push({ label: row.label, value, created_at: row.created_at, is_champion: row.verdict === "champion" });
    trends.set(row.key, list);
  }
  return metrics.map((metric) => withStatus(metric, (trends.get(metric.name.toLowerCase()) ?? []).slice(-TREND_POINTS_MAX)));
}

export async function getMetric(id: string, q: Queryable = db): Promise<SuccessMetric | null> {
  const row = await q.queryOne<MetricRow>(`SELECT ${METRIC_COLUMNS} FROM success_metrics WHERE id = $1`, [id]);
  return row ? toMetric(row) : null;
}

/**
 * Adds a metric at the end of the scorecard (at most MAX_SUCCESS_METRICS).
 * Locks the project row so concurrent adds cannot exceed the cap.
 */
export async function createMetric(input: CreateMetricInput): Promise<SuccessMetric> {
  const unit = (input.unit ?? "").trim();
  assertRates(unit, [input.baseline, input.target, input.current]);
  const now = nowISO();
  try {
    return await transaction(async (tx) => {
      const project = await tx.queryOne<{ id: string }>(
        "SELECT id FROM projects WHERE id = $1 FOR NO KEY UPDATE",
        [input.project_id],
      );
      if (!project) throw new Error(SCORECARD_ERRORS.projectNotFound);
      const stats = await tx.queryOne<{ n: number; next: number }>(
        `SELECT COUNT(*)::int AS n, (COALESCE(MAX(position), -1) + 1)::int AS next
           FROM success_metrics WHERE project_id = $1`,
        [project.id],
      );
      if ((stats?.n ?? 0) >= MAX_SUCCESS_METRICS) throw new Error(SCORECARD_ERRORS.tooMany);
      const current = input.current ?? null;
      const row = await tx.queryOne<MetricRow>(
        `INSERT INTO success_metrics
           (id, project_id, name, unit, direction, baseline, target, current, current_measured_at,
            locked_at, position, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11, $12, $12)
         RETURNING ${METRIC_COLUMNS}`,
        [
          newId(),
          project.id,
          input.name.trim(),
          unit,
          input.direction ?? "higher",
          input.baseline ?? null,
          input.target,
          current,
          current === null ? null : now,
          stats?.next ?? 0,
          (input.notes ?? "").trim(),
          now,
        ],
      );
      if (!row) throw new Error("Could not add the metric.");
      return toMetric(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(SCORECARD_ERRORS.duplicateName);
    throw error;
  }
}

/**
 * Updates only the provided keys. After the scorecard is locked, changing the
 * baseline, target or direction needs `patch.reason` (else a user-facing
 * Error); `changed_after_lock` tells the action to log it as such. A new
 * `current` stamps `current_measured_at`.
 */
export async function updateMetric(
  id: string,
  patch: UpdateMetricInput,
): Promise<{ metric: SuccessMetric; changed_after_lock: boolean }> {
  const now = nowISO();
  try {
    return await transaction(async (tx) => {
      const unlocked = await tx.queryOne<{ project_id: string }>("SELECT project_id FROM success_metrics WHERE id = $1", [id]);
      if (!unlocked) throw new Error(SCORECARD_ERRORS.metricNotFound);
      await tx.queryOne("SELECT id FROM projects WHERE id = $1 FOR NO KEY UPDATE", [unlocked.project_id]);
      const row = await tx.queryOne<MetricRow>(
        `SELECT ${METRIC_COLUMNS} FROM success_metrics WHERE id = $1 FOR NO KEY UPDATE`,
        [id],
      );
      if (!row) throw new Error(SCORECARD_ERRORS.metricNotFound);
      const existing = toMetric(row);

      const unit = patch.unit !== undefined ? patch.unit.trim() : existing.unit;
      const baseline = patch.baseline !== undefined ? patch.baseline : existing.baseline;
      const target = patch.target !== undefined ? patch.target : existing.target;
      const current = patch.current !== undefined ? patch.current : existing.current;
      const direction = patch.direction ?? existing.direction;
      assertRates(unit, [baseline, target, current]);

      const goalChanged =
        baseline !== existing.baseline || target !== existing.target || direction !== existing.direction;
      const changedAfterLock = existing.locked_at !== null && goalChanged;
      if (changedAfterLock && (!patch.reason || patch.reason.trim() === "")) {
        throw new Error(SCORECARD_ERRORS.reasonRequired);
      }

      const params = new Params();
      const sets: string[] = [];
      if (patch.name !== undefined && patch.name.trim() !== existing.name) sets.push(`name = ${params.add(patch.name.trim())}`);
      if (unit !== existing.unit) sets.push(`unit = ${params.add(unit)}`);
      if (direction !== existing.direction) sets.push(`direction = ${params.add(direction)}`);
      if (baseline !== existing.baseline) sets.push(`baseline = ${params.add(baseline)}`);
      if (target !== existing.target) sets.push(`target = ${params.add(target)}`);
      if (current !== existing.current) {
        sets.push(`current = ${params.add(current)}`);
        sets.push(`current_measured_at = ${params.add(current === null ? null : now)}`);
      }
      if (patch.notes !== undefined && patch.notes.trim() !== existing.notes) sets.push(`notes = ${params.add(patch.notes.trim())}`);
      if (sets.length === 0) return { metric: existing, changed_after_lock: false };
      sets.push(`updated_at = ${params.add(now)}`);

      const updated = await tx.queryOne<MetricRow>(
        `UPDATE success_metrics SET ${sets.join(", ")} WHERE id = ${params.add(id)} RETURNING ${METRIC_COLUMNS}`,
        params.values,
      );
      if (!updated) throw new Error(SCORECARD_ERRORS.metricNotFound);
      return { metric: toMetric(updated), changed_after_lock: changedAfterLock };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(SCORECARD_ERRORS.duplicateName);
    throw error;
  }
}

export async function deleteMetric(id: string): Promise<{ project_id: string; name: string }> {
  const row = await db.queryOne<{ project_id: string; name: string }>(
    "DELETE FROM success_metrics WHERE id = $1 RETURNING project_id, name",
    [id],
  );
  if (!row) throw new Error(SCORECARD_ERRORS.metricNotFound);
  return row;
}

/**
 * Rewrites positions 0..n: the given ids first (ids of other projects are
 * ignored), then any metric left out, in its current order.
 */
export async function reorderMetrics(projectId: string, orderedIds: string[]): Promise<void> {
  await transaction(async (tx) => {
    const project = await tx.queryOne<{ id: string }>("SELECT id FROM projects WHERE id = $1 FOR NO KEY UPDATE", [projectId]);
    if (!project) throw new Error(SCORECARD_ERRORS.projectNotFound);
    const rows = await tx.query<{ id: string }>(
      "SELECT id FROM success_metrics WHERE project_id = $1 ORDER BY position ASC, created_at ASC FOR NO KEY UPDATE",
      [projectId],
    );
    const known = new Set(rows.map((row) => row.id));
    const seen = new Set<string>();
    const order: string[] = [];
    for (const metricId of orderedIds) {
      if (known.has(metricId) && !seen.has(metricId)) {
        seen.add(metricId);
        order.push(metricId);
      }
    }
    for (const row of rows) if (!seen.has(row.id)) order.push(row.id);
    if (order.length === 0) return;
    await tx.execute(
      `UPDATE success_metrics AS s
          SET position = o.ord - 1
         FROM unnest($2::text[]) WITH ORDINALITY AS o(id, ord)
        WHERE s.id = o.id AND s.project_id = $1 AND s.position <> o.ord - 1`,
      [projectId, order],
    );
  });
}

/** Locks every unlocked metric of the project (before the Pilot starts). Returns how many were locked. */
export async function lockMetrics(projectId: string): Promise<number> {
  const now = nowISO();
  return db.execute(
    "UPDATE success_metrics SET locked_at = $2, updated_at = $2 WHERE project_id = $1 AND locked_at IS NULL",
    [projectId, now],
  );
}

/* --------------------------------- Gates -------------------------------- */

async function getChampion(projectId: string): Promise<EvalRunWithMeta | null> {
  const row = await db.queryOne<ChampionRow>(
    `SELECT e.id, e.project_id, e.milestone_id, e.label, e.change_type, e.model_name, e.prompt_version,
            e.dataset_version, e.metrics, e.verdict, e.external_url, e.notes, e.created_by, e.created_at,
            u.name AS creator_name, u.email AS creator_email, u.color AS creator_color,
            u.job_title AS creator_job_title, m.name AS milestone_name
       FROM eval_runs e
       LEFT JOIN users u ON u.id = e.created_by
       LEFT JOIN milestones m ON m.id = e.milestone_id
      WHERE e.project_id = $1 AND e.verdict = 'champion'
      ORDER BY e.created_at DESC
      LIMIT 1`,
    [projectId],
  );
  if (!row) return null;
  const metrics = parseEvalMetrics(row.metrics);
  const deltas: Record<string, number | null> = {};
  for (const key of Object.keys(metrics)) deltas[key] = 0;
  return {
    id: row.id,
    project_id: row.project_id,
    milestone_id: row.milestone_id,
    label: row.label,
    change_type: row.change_type,
    model_name: row.model_name,
    prompt_version: row.prompt_version,
    dataset_version: row.dataset_version,
    metrics,
    verdict: row.verdict,
    external_url: row.external_url,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
    creator: summary(row.created_by, row.creator_name, row.creator_email, row.creator_color, row.creator_job_title),
    milestone_name: row.milestone_name,
    deltas,
  };
}

async function listOpenHighRisks(projectId: string): Promise<RiskWithMeta[]> {
  const rows = await db.query<RiskRow>(
    `SELECT r.id, r.project_id, r.kind, r.category, r.title, r.description, r.likelihood, r.impact,
            r.owner_id, r.mitigation, r.status, r.review_date, r.due_date, r.created_by, r.created_at,
            r.updated_at, r.closed_at,
            u.name AS owner_name, u.email AS owner_email, u.color AS owner_color, u.job_title AS owner_job_title,
            p.name AS project_name
       FROM risks r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN users u ON u.id = r.owner_id
      WHERE r.project_id = $1
        AND r.status IN ('open', 'mitigating')
        AND r.likelihood IS NOT NULL AND r.impact IS NOT NULL
        AND r.likelihood * r.impact >= $2
      ORDER BY r.likelihood * r.impact DESC, r.review_date ASC NULLS LAST, r.created_at ASC`,
    [projectId, RISK_SCORE_RED],
  );
  return rows.map((row) => {
    const likelihood = num(row.likelihood);
    const impact = num(row.impact);
    const score = riskScore(likelihood, impact);
    return {
      id: row.id,
      project_id: row.project_id,
      kind: row.kind,
      category: row.category,
      title: row.title,
      description: row.description,
      likelihood,
      impact,
      owner_id: row.owner_id,
      mitigation: row.mitigation,
      status: row.status,
      review_date: row.review_date,
      due_date: row.due_date,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      closed_at: row.closed_at,
      owner: summary(row.owner_id, row.owner_name, row.owner_email, row.owner_color, row.owner_job_title),
      project_name: row.project_name,
      score,
      severity: riskSeverity(score),
    };
  });
}

/**
 * GateReviewData plus the count of every open or mitigating RAID item (the
 * dialog's risk summary) and the workspace today (earliest extension date).
 */
export interface GateReview extends GateReviewData {
  open_risk_count: number;
  today: string;
}

/**
 * Everything the GateDialog needs in one call: the phase (stripped unless
 * includeCommercial), its deliverables, the scorecard, the champion eval run,
 * open high risks (score >= RISK_SCORE_RED), whether Extend is still allowed,
 * the phase Go would start and the decision history. null when the phase is gone.
 */
export async function getGateReview(
  milestoneId: string,
  options: ProjectQueryOptions = {},
  today?: string,
): Promise<GateReview | null> {
  const milestone = await getMilestone(milestoneId, options);
  if (!milestone) return null;
  const projectId = milestone.project_id;

  const [project, deliverables, metrics, champion, risks, openRisks, next, history, workspaceToday] = await Promise.all([
    getProjectSummary(projectId),
    listDeliverables(milestone.id),
    listMetrics(projectId),
    getChampion(projectId),
    listOpenHighRisks(projectId),
    db.queryOne<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM risks WHERE project_id = $1 AND status IN ('open', 'mitigating')",
      [projectId],
    ),
    db.queryOne<MilestoneSummary>(
      `SELECT id, project_id, name, kind, status, phase_key, start_date, due_date
         FROM milestones
        WHERE project_id = $1 AND kind = 'phase' AND status = 'planned' AND id <> $2
        ORDER BY position ASC, created_at ASC
        LIMIT 1`,
      [projectId, milestone.id],
    ),
    listGateHistory(milestone.id),
    today ?? getWorkspaceToday(),
  ]);
  if (!project) return null;

  return {
    milestone,
    project,
    deliverables,
    metrics,
    champion,
    open_high_risks: risks,
    can_extend: milestone.extend_count < MAX_GATE_EXTENSIONS,
    next_phase: next,
    history,
    open_risk_count: openRisks?.n ?? 0,
    today: workspaceToday,
  };
}

/** GateDecisionInput plus optional Go conditions ("Go with conditions"), stored with the gate notes. */
export interface GateDecisionRequest extends GateDecisionInput {
  conditions?: string;
}

/** The gate_notes text a decision leaves on the phase (notes, then conditions or the fix list). */
export function composeGateNotes(
  decision: GateDecision,
  input: Pick<GateDecisionRequest, "notes" | "conditions" | "fix_list">,
  extensionNumber: number,
): string {
  const parts = [input.notes.trim()];
  if (decision === "go" && input.conditions && input.conditions.trim()) {
    parts.push(`Conditions:\n${input.conditions.trim()}`);
  }
  if (decision === "extend" && input.fix_list && input.fix_list.trim()) {
    parts.push(`Fix list (extension ${extensionNumber}):\n${input.fix_list.trim()}`);
  }
  return parts.filter((part) => part !== "").join("\n\n");
}

function emptyToNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value.trim() === "" ? null : value.trim();
}

/**
 * Records a gate decision in one transaction guarded by `status = 'gate_review'`
 * (a user-facing Error when the guard fails, e.g. someone else decided first).
 * Locks the project row, then the milestone (FOR NO KEY UPDATE).
 *
 * - Go: status done, completed_at; the next planned phase becomes active
 *   (unless another phase is already active or in review).
 * - Extend: only while extend_count < MAX_GATE_EXTENSIONS; needs a new due
 *   date and a fix list; status active, due_date = new date, extend_count + 1,
 *   the fix list appended to the gate notes.
 * - Stop: status stopped.
 *
 * Always writes the decision, decider, time, notes, sign-off and evidence,
 * then recomputes project progress. Returned milestones are stripped unless
 * includeCommercial.
 */
export async function decideGate(
  milestoneId: string,
  input: GateDecisionRequest,
  userId: string,
  options: ProjectQueryOptions = {},
): Promise<{ milestone: Milestone; next_phase: Milestone | null }> {
  const now = nowISO();
  const decision = input.decision;
  const newDueDate = emptyToNull(input.new_due_date);
  const fixList = (input.fix_list ?? "").trim();

  if (decision === "extend") {
    if (!fixList) throw new Error(SCORECARD_ERRORS.extendNeedsFixes);
    if (!newDueDate) throw new Error(SCORECARD_ERRORS.extendNeedsDate);
  }

  const result = await transaction(async (tx) => {
    const unlocked = await tx.queryOne<{ project_id: string }>("SELECT project_id FROM milestones WHERE id = $1", [milestoneId]);
    if (!unlocked) throw new Error(SCORECARD_ERRORS.phaseNotFound);
    const project = await tx.queryOne<{ id: string }>(
      "SELECT id FROM projects WHERE id = $1 FOR NO KEY UPDATE",
      [unlocked.project_id],
    );
    if (!project) throw new Error(SCORECARD_ERRORS.projectNotFound);
    const existing = await tx.queryOne<GateMilestoneRow>(
      `SELECT id, project_id, kind, status, start_date, extend_count
         FROM milestones WHERE id = $1 AND project_id = $2 FOR NO KEY UPDATE`,
      [milestoneId, project.id],
    );
    if (!existing) throw new Error(SCORECARD_ERRORS.phaseNotFound);
    if (existing.status !== "gate_review") throw new Error(SCORECARD_ERRORS.notInGateReview);

    if (decision === "extend") {
      if (existing.extend_count >= MAX_GATE_EXTENSIONS) throw new Error(SCORECARD_ERRORS.extendUsed);
      if (existing.start_date && newDueDate && newDueDate < existing.start_date) {
        throw new Error(SCORECARD_ERRORS.extendDateOrder);
      }
    }

    const nextStatus: MilestoneStatus = decision === "go" ? "done" : decision === "extend" ? "active" : "stopped";
    const params = new Params();
    const sets = [
      `status = ${params.add(nextStatus)}`,
      `gate_decision = ${params.add(decision)}`,
      `gate_decided_by = ${params.add(userId)}`,
      `gate_decided_at = ${params.add(now)}`,
      `gate_notes = ${params.add(composeGateNotes(decision, input, existing.extend_count + 1))}`,
      `client_signoff_name = ${params.add(emptyToNull(input.client_signoff_name))}`,
      `client_signoff_date = ${params.add(emptyToNull(input.client_signoff_date))}`,
      `evidence_url = ${params.add(emptyToNull(input.evidence_url))}`,
      `updated_at = ${params.add(now)}`,
    ];
    if (decision === "go") sets.push(`completed_at = ${params.add(now)}`);
    if (decision === "extend") {
      sets.push(`due_date = ${params.add(newDueDate)}`);
      sets.push("extend_count = extend_count + 1");
    }
    const updated = await tx.queryOne<{ id: string }>(
      `UPDATE milestones SET ${sets.join(", ")}
        WHERE id = ${params.add(milestoneId)} AND status = 'gate_review'
        RETURNING id`,
      params.values,
    );
    if (!updated) throw new Error(SCORECARD_ERRORS.notInGateReview);

    let nextPhase: Milestone | null = null;
    if (decision === "go") {
      const busy = await tx.queryOne<{ id: string }>(
        `SELECT id FROM milestones
          WHERE project_id = $1 AND kind = 'phase' AND status IN ('active', 'gate_review') AND id <> $2
          LIMIT 1`,
        [project.id, milestoneId],
      );
      if (!busy) nextPhase = await activateNextPhase(project.id, tx, options);
    }
    await recomputeProjectProgress(project.id, tx);
    return { nextPhase };
  });

  const milestone = await getMilestone(milestoneId, options);
  if (!milestone) throw new Error(SCORECARD_ERRORS.phaseNotFound);
  return { milestone, next_phase: result.nextPhase };
}
