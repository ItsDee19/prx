import { db, newId, nowISO, transaction, type Queryable, type SqlParam } from "@/lib/db";
import { STATUS_HEADLINE_MAX } from "@/lib/constants";
import type {
  CreateStatusUpdateInput,
  MetricDirection,
  MetricSnapshot,
  RagHealth,
  StatusUpdate,
  StatusUpdateChanges,
  StatusUpdateDraft,
  UpdateStatusUpdateInput,
} from "@/lib/types";
import { RAG_HEALTHS } from "@/lib/types";
import { budgetPeriodRange, computeBudgetBurn, metricIsMet, suggestBudgetRag } from "@/lib/utils";
import { startOfWeekISO } from "@/lib/workspace-time";

/**
 * Weekly status updates with RAG health (SPEC.md sections 16 and 17.6).
 * `projects.health` / `health_updated_at` mirror the latest update (by
 * created_at): every write re-denormalises them in the same transaction, so
 * "Update due" (isUpdateDue) and every health dot stay consistent.
 */

/* ------------------------------ Errors ---------------------------------- */

/** User-facing messages thrown by the write functions (actions pass them through). */
export const STATUS_UPDATE_ERRORS = {
  notFound: "This status update no longer exists.",
  projectNotFound: "This project no longer exists.",
  headline: `Write a headline of 1 to ${STATUS_HEADLINE_MAX} characters.`,
} as const;

/* ------------------------------ Row shapes ------------------------------ */

interface StatusUpdateRow {
  id: string;
  project_id: string;
  author_id: string | null;
  week_of: string;
  health: RagHealth;
  schedule_rag: RagHealth | null;
  budget_rag: RagHealth | null;
  scope_rag: RagHealth | null;
  quality_rag: RagHealth | null;
  headline: string;
  done: string;
  next: string;
  blockers: string;
  client_asks: string;
  internal_notes: string;
  /** JSONB: node-postgres returns it parsed. */
  changes: unknown;
  metrics_snapshot: unknown;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_email: string | null;
  author_color: string | null;
  author_job_title: string | null;
}

interface ProjectStateRow {
  id: string;
  progress: number;
  due_date: string | null;
  budget_hours: number | null;
  budget_period: "total" | "monthly";
  start_date: string | null;
}

const SELECT_UPDATE = `
  SELECT s.id, s.project_id, s.author_id, s.week_of, s.health, s.schedule_rag, s.budget_rag,
         s.scope_rag, s.quality_rag, s.headline, s.done, s.next, s.blockers, s.client_asks,
         s.internal_notes, s.changes, s.metrics_snapshot, s.created_at, s.updated_at,
         u.name AS author_name, u.email AS author_email, u.color AS author_color,
         u.job_title AS author_job_title
    FROM status_updates s
    LEFT JOIN users u ON u.id = s.author_id`;

/** Newest first; id breaks ties between updates posted in the same millisecond. */
const NEWEST_FIRST = "s.created_at DESC, s.id DESC";

/** Default and maximum number of updates listed for a project. */
export const STATUS_UPDATE_LIST_DEFAULT_LIMIT = 52;
const STATUS_UPDATE_LIST_MAX_LIMIT = 200;

/* ------------------------------ Parsing --------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRag(value: unknown): value is RagHealth {
  return typeof value === "string" && (RAG_HEALTHS as readonly string[]).includes(value);
}

/** Tolerant reader: older or hand-edited JSON never breaks the page. */
export function parseStatusUpdateChanges(raw: unknown): StatusUpdateChanges {
  const value = isRecord(raw) ? raw : {};
  const milestones = Array.isArray(value.milestones_done)
    ? value.milestones_done.filter((name): name is string => typeof name === "string")
    : [];
  return {
    since: stringOrNull(value.since),
    tasks_completed: Math.max(0, Math.round(numberOr(value.tasks_completed, 0))),
    milestones_done: milestones,
    progress_from: numberOr(value.progress_from, null),
    progress_to: numberOr(value.progress_to, 0),
    due_date_from: stringOrNull(value.due_date_from),
    due_date_to: stringOrNull(value.due_date_to),
    risks_opened: Math.max(0, Math.round(numberOr(value.risks_opened, 0))),
  };
}

function parseMetricsSnapshot(raw: unknown): MetricSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: MetricSnapshot[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.name !== "string") continue;
    const target = numberOr(item.target, null);
    if (target === null) continue;
    const direction: MetricDirection = item.direction === "lower" ? "lower" : "higher";
    out.push({
      name: item.name,
      unit: typeof item.unit === "string" ? item.unit : "",
      direction,
      baseline: numberOr(item.baseline, null),
      target,
      current: numberOr(item.current, null),
      is_met: typeof item.is_met === "boolean" ? item.is_met : null,
    });
  }
  return out;
}

function toStatusUpdate(row: StatusUpdateRow): StatusUpdate {
  return {
    id: row.id,
    project_id: row.project_id,
    author_id: row.author_id,
    week_of: row.week_of,
    health: row.health,
    schedule_rag: isRag(row.schedule_rag) ? row.schedule_rag : null,
    budget_rag: isRag(row.budget_rag) ? row.budget_rag : null,
    scope_rag: isRag(row.scope_rag) ? row.scope_rag : null,
    quality_rag: isRag(row.quality_rag) ? row.quality_rag : null,
    headline: row.headline,
    done: row.done,
    next: row.next,
    blockers: row.blockers,
    client_asks: row.client_asks,
    internal_notes: row.internal_notes,
    changes: parseStatusUpdateChanges(row.changes),
    metrics_snapshot: parseMetricsSnapshot(row.metrics_snapshot),
    created_at: row.created_at,
    updated_at: row.updated_at,
    author:
      row.author_id && row.author_name !== null
        ? {
            id: row.author_id,
            name: row.author_name,
            email: row.author_email ?? "",
            color: row.author_color ?? "#64748b",
            job_title: row.author_job_title,
          }
        : null,
  };
}

/* ------------------------------ Reads ----------------------------------- */

/** A project's updates, newest first (default STATUS_UPDATE_LIST_DEFAULT_LIMIT, about a year of weeks). */
export async function listStatusUpdates(
  projectId: string,
  limit: number = STATUS_UPDATE_LIST_DEFAULT_LIMIT,
): Promise<StatusUpdate[]> {
  const capped = Math.max(1, Math.min(STATUS_UPDATE_LIST_MAX_LIMIT, Math.floor(limit)));
  const rows = await db.query<StatusUpdateRow>(
    `${SELECT_UPDATE} WHERE s.project_id = $1 ORDER BY ${NEWEST_FIRST} LIMIT $2`,
    [projectId, capped],
  );
  return rows.map(toStatusUpdate);
}

async function getStatusUpdateOn(q: Queryable, id: string): Promise<StatusUpdate | null> {
  const row = await q.queryOne<StatusUpdateRow>(`${SELECT_UPDATE} WHERE s.id = $1`, [id]);
  return row ? toStatusUpdate(row) : null;
}

export async function getStatusUpdate(id: string): Promise<StatusUpdate | null> {
  return getStatusUpdateOn(db, id);
}

async function getLatestOn(q: Queryable, projectId: string): Promise<StatusUpdate | null> {
  const row = await q.queryOne<StatusUpdateRow>(
    `${SELECT_UPDATE} WHERE s.project_id = $1 ORDER BY ${NEWEST_FIRST} LIMIT 1`,
    [projectId],
  );
  return row ? toStatusUpdate(row) : null;
}

export async function getLatestStatusUpdate(projectId: string): Promise<StatusUpdate | null> {
  return getLatestOn(db, projectId);
}

/* --------------------------- Derived content ---------------------------- */

async function loadProjectState(q: Queryable, projectId: string): Promise<ProjectStateRow | null> {
  return q.queryOne<ProjectStateRow>(
    `SELECT id, progress, due_date, budget_hours, budget_period, start_date FROM projects WHERE id = $1`,
    [projectId],
  );
}

/**
 * What changed since `previous` (or since the project started, for the first
 * update): tasks completed, phases/milestones completed, progress and due-date
 * moves, and RAID items opened (decisions are records, not risks, so they are
 * not counted).
 */
async function computeChanges(
  q: Queryable,
  project: ProjectStateRow,
  previous: StatusUpdate | null,
): Promise<StatusUpdateChanges> {
  const since = previous?.created_at ?? null;
  const row = await q.queryOne<{ tasks_completed: number; risks_opened: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM tasks t
         WHERE t.project_id = $1 AND t.status = 'done' AND t.completed_at IS NOT NULL
           AND ($2::text IS NULL OR t.completed_at > $2)) AS tasks_completed,
       (SELECT COUNT(*)::int FROM risks r
         WHERE r.project_id = $1 AND r.kind <> 'decision'
           AND ($2::text IS NULL OR r.created_at > $2)) AS risks_opened`,
    [project.id, since],
  );
  const milestones = await q.query<{ name: string }>(
    `SELECT m.name FROM milestones m
      WHERE m.project_id = $1 AND m.status = 'done' AND m.completed_at IS NOT NULL
        AND ($2::text IS NULL OR m.completed_at > $2)
      ORDER BY m.completed_at ASC, m.position ASC`,
    [project.id, since],
  );
  return {
    since,
    tasks_completed: row?.tasks_completed ?? 0,
    milestones_done: milestones.map((milestone) => milestone.name),
    progress_from: previous ? previous.changes.progress_to : null,
    progress_to: project.progress,
    due_date_from: previous ? previous.changes.due_date_to : null,
    due_date_to: project.due_date,
    risks_opened: row?.risks_opened ?? 0,
  };
}

/** The scorecard as it stands now (rates stay 0-1 fractions). */
async function snapshotMetrics(q: Queryable, projectId: string): Promise<MetricSnapshot[]> {
  const rows = await q.query<{
    name: string;
    unit: string;
    direction: MetricDirection;
    baseline: number | null;
    target: number;
    current: number | null;
  }>(
    `SELECT name, unit, direction, baseline::float8 AS baseline, target::float8 AS target,
            current::float8 AS current
       FROM success_metrics WHERE project_id = $1
      ORDER BY position ASC, created_at ASC`,
    [projectId],
  );
  return rows.map((row) => ({
    name: row.name,
    unit: row.unit,
    direction: row.direction,
    baseline: row.baseline,
    target: row.target,
    current: row.current,
    is_met: metricIsMet(row.direction, row.current, row.target),
  }));
}

/** Budget RAG suggestion from hours burn (time minutes summed directly from time_entries). */
async function suggestBudget(q: Queryable, project: ProjectStateRow, today: string): Promise<RagHealth | null> {
  if (project.budget_hours === null || project.budget_hours <= 0) return null;
  const range = budgetPeriodRange(project.budget_period, today);
  const row = await q.queryOne<{ minutes: number }>(
    `SELECT COALESCE(SUM(minutes), 0)::int AS minutes FROM time_entries
      WHERE project_id = $1
        AND ($2::text IS NULL OR entry_date >= $2)
        AND ($3::text IS NULL OR entry_date <= $3)`,
    [project.id, range.from, range.to],
  );
  const burn = computeBudgetBurn({
    budget_hours: project.budget_hours,
    budget_period: project.budget_period,
    start_date: project.start_date,
    due_date: project.due_date,
    logged_minutes: row?.minutes ?? 0,
    today,
  });
  return suggestBudgetRag(burn);
}

/** Composer preview: week, changes since the latest update, suggested budget RAG. */
export async function getStatusUpdateDraft(projectId: string, today: string): Promise<StatusUpdateDraft> {
  const project = await loadProjectState(db, projectId);
  if (!project) throw new Error(STATUS_UPDATE_ERRORS.projectNotFound);
  const lastUpdate = await getLatestOn(db, projectId);
  const [changes, suggested] = await Promise.all([
    computeChanges(db, project, lastUpdate),
    suggestBudget(db, project, today),
  ]);
  return {
    week_of: startOfWeekISO(today),
    changes,
    suggested_budget_rag: suggested,
    last_update: lastUpdate,
  };
}

/* ------------------------------ Writes ---------------------------------- */

/** Mirrors the latest remaining update onto projects.health / health_updated_at (null when none). */
async function syncProjectHealth(q: Queryable, projectId: string): Promise<void> {
  await q.execute(
    `UPDATE projects
        SET health = (SELECT s.health FROM status_updates s WHERE s.project_id = $1
                       ORDER BY s.created_at DESC, s.id DESC LIMIT 1),
            health_updated_at = (SELECT s.created_at FROM status_updates s WHERE s.project_id = $1
                                  ORDER BY s.created_at DESC, s.id DESC LIMIT 1)
      WHERE id = $1`,
    [projectId],
  );
}

function cleanText(value: string | undefined): string {
  return (value ?? "").trim();
}

function checkHeadline(headline: string): string {
  const trimmed = headline.trim();
  if (trimmed.length < 1 || trimmed.length > STATUS_HEADLINE_MAX) throw new Error(STATUS_UPDATE_ERRORS.headline);
  return trimmed;
}

/**
 * Posts an update: week_of = Monday of the workspace week, the changes since
 * the previous update and a scorecard snapshot are computed in the same
 * transaction that inserts the row and sets projects.health/health_updated_at.
 */
export async function createStatusUpdate(
  input: CreateStatusUpdateInput,
  authorId: string,
  today: string,
): Promise<StatusUpdate> {
  const headline = checkHeadline(input.headline);
  return transaction(async (tx) => {
    // Lock the project row so two updates posted at once compute their changes in order.
    const project = await tx.queryOne<ProjectStateRow>(
      `SELECT id, progress, due_date, budget_hours, budget_period, start_date FROM projects WHERE id = $1 FOR UPDATE`,
      [input.project_id],
    );
    if (!project) throw new Error(STATUS_UPDATE_ERRORS.projectNotFound);
    const previous = await getLatestOn(tx, project.id);
    const changes = await computeChanges(tx, project, previous);
    const metrics = await snapshotMetrics(tx, project.id);
    const id = newId();
    let now = nowISO();
    // Keep created_at strictly increasing per project so "latest" is unambiguous.
    if (previous && now <= previous.created_at) {
      now = new Date(new Date(previous.created_at).getTime() + 1).toISOString();
    }
    await tx.execute(
      `INSERT INTO status_updates (id, project_id, author_id, week_of, health, schedule_rag, budget_rag,
         scope_rag, quality_rag, headline, done, next, blockers, client_asks, internal_notes, changes,
         metrics_snapshot, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18, $18)`,
      [
        id,
        project.id,
        authorId,
        startOfWeekISO(today),
        input.health,
        input.schedule_rag ?? null,
        input.budget_rag ?? null,
        input.scope_rag ?? null,
        input.quality_rag ?? null,
        headline,
        cleanText(input.done),
        cleanText(input.next),
        cleanText(input.blockers),
        cleanText(input.client_asks),
        cleanText(input.internal_notes),
        JSON.stringify(changes),
        JSON.stringify(metrics),
        now,
      ],
    );
    await syncProjectHealth(tx, project.id);
    const created = await getStatusUpdateOn(tx, id);
    if (!created) throw new Error(STATUS_UPDATE_ERRORS.notFound);
    return created;
  });
}

const PATCH_COLUMNS = [
  "health",
  "schedule_rag",
  "budget_rag",
  "scope_rag",
  "quality_rag",
  "headline",
  "done",
  "next",
  "blockers",
  "client_asks",
  "internal_notes",
] as const satisfies readonly (keyof UpdateStatusUpdateInput)[];

const TEXT_COLUMNS: ReadonlySet<string> = new Set(["done", "next", "blockers", "client_asks", "internal_notes"]);

/**
 * Edits the provided fields (changes and the metrics snapshot stay as they
 * were at posting time), then re-denormalises project health.
 */
export async function updateStatusUpdate(id: string, patch: UpdateStatusUpdateInput): Promise<StatusUpdate> {
  const sets: string[] = [];
  const values: SqlParam[] = [];
  for (const column of PATCH_COLUMNS) {
    const value = patch[column];
    if (value === undefined) continue;
    let bound: SqlParam;
    if (column === "headline") bound = checkHeadline(value ?? "");
    else if (column === "health") {
      if (!isRag(value)) continue;
      bound = value;
    } else if (TEXT_COLUMNS.has(column)) bound = cleanText(value ?? "");
    else bound = isRag(value) ? value : null;
    values.push(bound);
    sets.push(`${column} = $${values.length}`);
  }
  return transaction(async (tx) => {
    const existing = await tx.queryOne<{ project_id: string }>(
      "SELECT project_id FROM status_updates WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!existing) throw new Error(STATUS_UPDATE_ERRORS.notFound);
    if (sets.length > 0) {
      values.push(nowISO());
      sets.push(`updated_at = $${values.length}`);
      values.push(id);
      await tx.execute(`UPDATE status_updates SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
      await syncProjectHealth(tx, existing.project_id);
    }
    const updated = await getStatusUpdateOn(tx, id);
    if (!updated) throw new Error(STATUS_UPDATE_ERRORS.notFound);
    return updated;
  });
}

/** Deletes an update; project health falls back to the latest remaining one (or none). */
export async function deleteStatusUpdate(id: string): Promise<{ project_id: string }> {
  return transaction(async (tx) => {
    const row = await tx.queryOne<{ project_id: string }>(
      "DELETE FROM status_updates WHERE id = $1 RETURNING project_id",
      [id],
    );
    if (!row) throw new Error(STATUS_UPDATE_ERRORS.notFound);
    await syncProjectHealth(tx, row.project_id);
    return { project_id: row.project_id };
  });
}
