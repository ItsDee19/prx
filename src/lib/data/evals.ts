import { db, newId, nowISO, transaction, type Queryable, type SqlParam } from "@/lib/db";
import type {
  CreateEvalRunInput,
  EvalChangeType,
  EvalMetrics,
  EvalRun,
  EvalRunWithMeta,
  EvalVerdict,
  MetricDirection,
  PromoteChampionResult,
  UpdateEvalRunInput,
} from "@/lib/types";
import { workspaceToday } from "@/lib/workspace-time";
import { getWorkspaceTimezone } from "./app-settings";

/* -------------------------------- Types --------------------------------- */

/** CreateEvalRunInput plus the date the run was evaluated (stored as created_at). */
export type CreateEvalRunFullInput = CreateEvalRunInput & {
  /** Workspace date "YYYY-MM-DD"; null/undefined (or today) = now. */
  run_date?: string | null;
};

export type UpdateEvalRunFullInput = UpdateEvalRunInput & {
  /** Moves the run to this workspace date (today = now). */
  run_date?: string | null;
};

/** A scorecard metric as the eval log needs it (unit, direction, target line). */
export interface EvalMetricInfo {
  name: string;
  unit: string;
  direction: MetricDirection;
  baseline: number | null;
  target: number;
  current: number | null;
}

/* ------------------------------ Row shapes ------------------------------ */

interface EvalRunRow {
  id: string;
  project_id: string;
  milestone_id: string | null;
  label: string;
  change_type: EvalChangeType;
  model_name: string;
  prompt_version: string;
  dataset_version: string;
  /** JSONB: node-postgres returns it parsed. */
  metrics: unknown;
  verdict: EvalVerdict;
  external_url: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
}

interface EvalRunMetaRow extends EvalRunRow {
  milestone_name: string | null;
  creator_name: string | null;
  creator_email: string | null;
  creator_color: string | null;
  creator_job_title: string | null;
}

/* ------------------------------ SQL pieces ------------------------------ */

const RUN_COLUMNS = `e.id, e.project_id, e.milestone_id, e.label, e.change_type, e.model_name,
  e.prompt_version, e.dataset_version, e.metrics, e.verdict, e.external_url, e.notes,
  e.created_by, e.created_at`;

const META_SELECT = `
  SELECT ${RUN_COLUMNS},
         m.name AS milestone_name,
         u.name AS creator_name, u.email AS creator_email, u.color AS creator_color,
         u.job_title AS creator_job_title
    FROM eval_runs e
    LEFT JOIN milestones m ON m.id = e.milestone_id
    LEFT JOIN users u ON u.id = e.created_by`;

/** Newest first; ties (same instant) by label then id so the order is stable. */
const ORDER_NEWEST = "e.created_at DESC, e.label ASC, e.id ASC";

/* ------------------------------ Errors ---------------------------------- */

/** User-facing messages thrown by the write functions (actions pass them through). */
export const EVAL_ERRORS = {
  notFound: "This eval run no longer exists.",
  projectNotFound: "This project no longer exists.",
  milestoneMismatch: "Pick a phase of this project.",
  championConflict: "Another run was promoted at the same time. Refresh and try again.",
  championVerdict: "Promote a run to make it the champion.",
  archivedVerdict: "Runs are archived automatically when a new champion is promoted.",
} as const;

/* ------------------------------ Helpers --------------------------------- */

/** Collects bound values and hands out their `$n` placeholders. */
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

/** Only finite numeric entries survive (JSONB written by older code or by hand is not trusted). */
export function sanitizeMetrics(value: unknown): EvalMetrics {
  const out: EvalMetrics = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  for (const [name, metric] of Object.entries(value as Record<string, unknown>)) {
    const number = typeof metric === "number" ? metric : typeof metric === "string" ? Number(metric) : NaN;
    if (name.trim() && Number.isFinite(number)) out[name] = number;
  }
  return out;
}

function toEvalRun(row: EvalRunRow): EvalRun {
  return {
    id: row.id,
    project_id: row.project_id,
    milestone_id: row.milestone_id,
    label: row.label,
    change_type: row.change_type,
    model_name: row.model_name,
    prompt_version: row.prompt_version,
    dataset_version: row.dataset_version,
    metrics: sanitizeMetrics(row.metrics),
    verdict: row.verdict,
    external_url: row.external_url,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

/** Lower-cased metric name -> value (matching is case-insensitive everywhere). */
function lowerMap(metrics: EvalMetrics): Map<string, number> {
  const map = new Map<string, number>();
  for (const [name, value] of Object.entries(metrics)) {
    const key = name.trim().toLowerCase();
    if (!map.has(key)) map.set(key, value);
  }
  return map;
}

/** This run's value minus the champion's, per metric of this run; null without a champion or match. */
export function computeDeltas(metrics: EvalMetrics, champion: EvalMetrics | null): Record<string, number | null> {
  const championValues = champion ? lowerMap(champion) : null;
  const deltas: Record<string, number | null> = {};
  for (const [name, value] of Object.entries(metrics)) {
    const base = championValues?.get(name.trim().toLowerCase());
    deltas[name] = base === undefined ? null : value - base;
  }
  return deltas;
}

function toEvalRunWithMeta(row: EvalRunMetaRow, champion: EvalMetrics | null): EvalRunWithMeta {
  const run = toEvalRun(row);
  return {
    ...run,
    creator: row.created_by
      ? {
          id: row.created_by,
          name: row.creator_name ?? "Former member",
          email: row.creator_email ?? "",
          color: row.creator_color ?? "#64748b",
          job_title: row.creator_job_title,
        }
      : null,
    milestone_name: row.milestone_name,
    deltas: computeDeltas(run.metrics, champion),
  };
}

/** Wall-clock offset (ms) of a timezone at an instant: local time minus UTC. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wall = Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour") % 24, pick("minute"), pick("second"));
  return wall - Math.floor(instantMs / 1000) * 1000;
}

/**
 * created_at for a run evaluated on a workspace date: now when the date is
 * today (keeps "newest first" exact), otherwise noon of that date in the
 * workspace timezone (so dateInTimeZone gives the date back in any zone).
 */
async function runTimestamp(runDate: string | null | undefined): Promise<string> {
  const now = nowISO();
  if (!runDate) return now;
  const timeZone = await getWorkspaceTimezone();
  if (runDate === workspaceToday(timeZone)) return now;
  const noonUtc = Date.parse(`${runDate}T12:00:00.000Z`);
  return new Date(noonUtc - zoneOffsetMs(noonUtc, timeZone)).toISOString();
}

async function assertMilestoneInProject(projectId: string, milestoneId: string | null | undefined, q: Queryable) {
  if (!milestoneId) return;
  const row = await q.queryOne<{ project_id: string }>("SELECT project_id FROM milestones WHERE id = $1", [milestoneId]);
  if (!row || row.project_id !== projectId) throw new Error(EVAL_ERRORS.milestoneMismatch);
}

async function championMetrics(projectId: string, q: Queryable): Promise<EvalMetrics | null> {
  const row = await q.queryOne<{ metrics: unknown }>(
    "SELECT metrics FROM eval_runs WHERE project_id = $1 AND verdict = 'champion' LIMIT 1",
    [projectId],
  );
  return row ? sanitizeMetrics(row.metrics) : null;
}

/* -------------------------------- Reads --------------------------------- */

/** Every run of the project, newest first, with deltas against the current champion. */
export async function listEvalRuns(projectId: string): Promise<EvalRunWithMeta[]> {
  const rows = await db.query<EvalRunMetaRow>(`${META_SELECT} WHERE e.project_id = $1 ORDER BY ${ORDER_NEWEST}`, [
    projectId,
  ]);
  const champion = rows.find((row) => row.verdict === "champion");
  const championValues = champion ? sanitizeMetrics(champion.metrics) : null;
  return rows.map((row) => toEvalRunWithMeta(row, championValues));
}

export async function getEvalRun(id: string): Promise<EvalRunWithMeta | null> {
  const row = await db.queryOne<EvalRunMetaRow>(`${META_SELECT} WHERE e.id = $1`, [id]);
  if (!row) return null;
  const champion = row.verdict === "champion" ? sanitizeMetrics(row.metrics) : await championMetrics(row.project_id, db);
  return toEvalRunWithMeta(row, champion);
}

/** The project's champion run (deltas are all 0), or null. */
export async function getChampionRun(projectId: string): Promise<EvalRunWithMeta | null> {
  const row = await db.queryOne<EvalRunMetaRow>(
    `${META_SELECT} WHERE e.project_id = $1 AND e.verdict = 'champion' LIMIT 1`,
    [projectId],
  );
  return row ? toEvalRunWithMeta(row, sanitizeMetrics(row.metrics)) : null;
}

/**
 * Metric names for the Log run autocomplete: scorecard names first (by
 * position), then names used by earlier runs that the scorecard does not have
 * (case-insensitive), alphabetically.
 */
export async function listMetricNames(projectId: string): Promise<string[]> {
  const [scorecard, runKeys] = await Promise.all([
    db.query<{ name: string }>(
      "SELECT name FROM success_metrics WHERE project_id = $1 ORDER BY position ASC, created_at ASC",
      [projectId],
    ),
    db.query<{ name: string }>(
      `SELECT DISTINCT k.name
         FROM eval_runs e, LATERAL jsonb_object_keys(e.metrics) AS k(name)
        WHERE e.project_id = $1`,
      [projectId],
    ),
  ]);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const { name } of scorecard) {
    const key = name.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  const extra = runKeys
    .map((row) => row.name.trim())
    .filter((name) => name !== "")
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  for (const name of extra) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

/** The project's scorecard metrics (by position) with the fields the eval log uses. */
export async function listEvalMetricInfo(projectId: string): Promise<EvalMetricInfo[]> {
  return db.query<EvalMetricInfo>(
    `SELECT name, unit, direction, baseline, target, current
       FROM success_metrics
      WHERE project_id = $1
      ORDER BY position ASC, created_at ASC`,
    [projectId],
  );
}

/* -------------------------------- Writes -------------------------------- */

/** Logs a run (verdict candidate unless baseline/rejected is given). */
export async function createEvalRun(input: CreateEvalRunFullInput, userId: string): Promise<EvalRun> {
  const project = await db.queryOne<{ id: string }>("SELECT id FROM projects WHERE id = $1", [input.project_id]);
  if (!project) throw new Error(EVAL_ERRORS.projectNotFound);
  await assertMilestoneInProject(input.project_id, input.milestone_id, db);
  const verdict: EvalVerdict = input.verdict ?? "candidate";
  if ((verdict as string) === "champion") throw new Error(EVAL_ERRORS.championVerdict);
  if ((verdict as string) === "archived") throw new Error(EVAL_ERRORS.archivedVerdict);
  const createdAt = await runTimestamp(input.run_date);

  const row = await db.queryOne<EvalRunRow>(
    `INSERT INTO eval_runs AS e (id, project_id, milestone_id, label, change_type, model_name, prompt_version,
                            dataset_version, metrics, verdict, external_url, notes, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14)
     RETURNING ${RUN_COLUMNS}`,
    [
      newId(),
      input.project_id,
      input.milestone_id ?? null,
      input.label.trim(),
      input.change_type ?? "prompt",
      (input.model_name ?? "").trim(),
      (input.prompt_version ?? "").trim(),
      (input.dataset_version ?? "").trim(),
      JSON.stringify(sanitizeMetrics(input.metrics)),
      verdict,
      input.external_url ?? null,
      (input.notes ?? "").trim(),
      userId,
      createdAt,
    ],
  );
  if (!row) throw new Error(EVAL_ERRORS.projectNotFound);
  return toEvalRun(row);
}

/**
 * Updates the provided keys. `verdict` may be baseline, candidate or rejected
 * (setting one on the champion demotes it; promotion goes through
 * promoteChampion). `metrics` replaces the whole map.
 */
export async function updateEvalRun(id: string, patch: UpdateEvalRunFullInput): Promise<EvalRun> {
  const existing = await db.queryOne<EvalRunRow>(`SELECT ${RUN_COLUMNS} FROM eval_runs e WHERE e.id = $1`, [id]);
  if (!existing) throw new Error(EVAL_ERRORS.notFound);
  if (patch.verdict !== undefined) {
    if ((patch.verdict as string) === "champion") throw new Error(EVAL_ERRORS.championVerdict);
    if ((patch.verdict as string) === "archived") throw new Error(EVAL_ERRORS.archivedVerdict);
  }
  if (patch.milestone_id !== undefined) await assertMilestoneInProject(existing.project_id, patch.milestone_id, db);

  const params = new Params();
  const sets: string[] = [];
  const set = (column: string, value: SqlParam, cast = "") => sets.push(`${column} = ${params.add(value)}${cast}`);
  if (patch.label !== undefined) set("label", patch.label.trim());
  if (patch.change_type !== undefined) set("change_type", patch.change_type);
  if (patch.model_name !== undefined) set("model_name", patch.model_name.trim());
  if (patch.prompt_version !== undefined) set("prompt_version", patch.prompt_version.trim());
  if (patch.dataset_version !== undefined) set("dataset_version", patch.dataset_version.trim());
  if (patch.metrics !== undefined) set("metrics", JSON.stringify(sanitizeMetrics(patch.metrics)), "::jsonb");
  if (patch.verdict !== undefined) set("verdict", patch.verdict);
  if (patch.external_url !== undefined) set("external_url", patch.external_url);
  if (patch.notes !== undefined) set("notes", patch.notes.trim());
  if (patch.milestone_id !== undefined) set("milestone_id", patch.milestone_id);
  if (patch.run_date !== undefined) set("created_at", await runTimestamp(patch.run_date));
  if (sets.length === 0) return toEvalRun(existing);

  const row = await db.queryOne<EvalRunRow>(
    `UPDATE eval_runs e SET ${sets.join(", ")} WHERE e.id = ${params.add(id)} RETURNING ${RUN_COLUMNS}`,
    params.values,
  );
  if (!row) throw new Error(EVAL_ERRORS.notFound);
  return toEvalRun(row);
}

export async function deleteEvalRun(id: string): Promise<{ project_id: string; label: string }> {
  const row = await db.queryOne<{ project_id: string; label: string }>(
    "DELETE FROM eval_runs WHERE id = $1 RETURNING project_id, label",
    [id],
  );
  if (!row) throw new Error(EVAL_ERRORS.notFound);
  return row;
}

/**
 * Makes the run the project's champion in one transaction: locks the project
 * row (serialises concurrent promotions), archives the current champion,
 * promotes the run (the partial unique index guarantees one champion) and,
 * with `updateScorecard`, copies its values into `success_metrics.current`
 * for metrics with the same name (case-insensitive).
 */
export async function promoteChampion(
  id: string,
  options: { updateScorecard: boolean },
): Promise<PromoteChampionResult> {
  try {
    return await transaction(async (tx) => {
      const run = await tx.queryOne<EvalRunRow>(`SELECT ${RUN_COLUMNS} FROM eval_runs e WHERE e.id = $1`, [id]);
      if (!run) throw new Error(EVAL_ERRORS.notFound);
      await tx.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [run.project_id]);

      const archived = await tx.query<{ id: string }>(
        `UPDATE eval_runs SET verdict = 'archived'
          WHERE project_id = $1 AND verdict = 'champion' AND id <> $2
          RETURNING id`,
        [run.project_id, id],
      );
      const promoted = await tx.queryOne<EvalRunRow>(
        `UPDATE eval_runs e SET verdict = 'champion' WHERE e.id = $1 RETURNING ${RUN_COLUMNS}`,
        [id],
      );
      if (!promoted) throw new Error(EVAL_ERRORS.notFound);
      const champion = toEvalRun(promoted);

      let metricsUpdated = 0;
      if (options.updateScorecard && Object.keys(champion.metrics).length > 0) {
        const now = nowISO();
        metricsUpdated = await tx.execute(
          `UPDATE success_metrics sm
              SET current = v.value, current_measured_at = $3, updated_at = $3
             FROM (SELECT DISTINCT ON (lower(btrim(key))) lower(btrim(key)) AS name, value::float8 AS value
                     FROM jsonb_each_text($2::jsonb)
                    ORDER BY lower(btrim(key)), key) v
            WHERE sm.project_id = $1 AND lower(btrim(sm.name)) = v.name`,
          [run.project_id, JSON.stringify(champion.metrics), now],
        );
      }

      return { champion, archived_id: archived[0]?.id ?? null, metrics_updated: metricsUpdated };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(EVAL_ERRORS.championConflict);
    throw error;
  }
}
