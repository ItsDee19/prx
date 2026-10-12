import { db, newId, nowISO, transaction, type Queryable, type SqlParam } from "@/lib/db";
import type {
  AgreementMetric,
  BatchStatus,
  BatchUnitType,
  CreateBatchInput,
  DataBatch,
  DataBatchSummary,
  UpdateBatchInput,
} from "@/lib/types";
import { dateInTimeZone, safeTimeZone, startOfWeekISO } from "@/lib/workspace-time";
import { recomputeProjectProgress } from "./tasks";

/* ------------------------------ Row shapes ------------------------------ */

interface BatchRow {
  id: string;
  project_id: string;
  milestone_id: string | null;
  number: number;
  name: string;
  is_calibration: boolean;
  unit_type: BatchUnitType;
  units_target: number;
  units_delivered: number;
  units_accepted: number;
  guideline_version: string;
  gold_accuracy: number | null;
  agreement_metric: AgreementMetric | null;
  agreement_score: number | null;
  quality_threshold: number | null;
  agreement_threshold: number | null;
  status: BatchStatus;
  due_date: string | null;
  delivered_at: string | null;
  accepted_at: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ------------------------------ SQL pieces ------------------------------ */

const BATCH_COLUMNS = `b.id, b.project_id, b.milestone_id, b.number, b.name, b.is_calibration, b.unit_type,
  b.units_target, b.units_delivered, b.units_accepted, b.guideline_version, b.gold_accuracy,
  b.agreement_metric, b.agreement_score, b.quality_threshold, b.agreement_threshold, b.status,
  b.due_date, b.delivered_at, b.accepted_at, b.notes, b.created_by, b.created_at, b.updated_at`;

/** Calibration batch first, then by number. */
const ORDER_BATCHES = "b.is_calibration DESC, b.number ASC, b.created_at ASC";

/* ------------------------------ Errors ---------------------------------- */

/** User-facing messages thrown by the write functions (actions pass them through). */
export const BATCH_ERRORS = {
  notFound: "This batch no longer exists.",
  projectNotFound: "This project no longer exists.",
  milestoneMismatch: "Pick a phase of this project.",
  duplicateNumber: "Another batch already uses this number.",
  secondCalibration: "This project already has a calibration batch.",
  acceptedOverDelivered: "Accepted units cannot exceed delivered units.",
} as const;

/** Statuses after hand-over to review: entering one stamps `delivered_at` (once). */
export const DELIVERED_BATCH_STATUSES: readonly BatchStatus[] = ["in_review", "accepted", "rejected", "rework"];

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

function toBatch(row: BatchRow): DataBatch {
  return {
    id: row.id,
    project_id: row.project_id,
    milestone_id: row.milestone_id,
    number: row.number,
    name: row.name,
    is_calibration: row.is_calibration,
    unit_type: row.unit_type,
    units_target: row.units_target,
    units_delivered: row.units_delivered,
    units_accepted: row.units_accepted,
    guideline_version: row.guideline_version,
    gold_accuracy: row.gold_accuracy,
    agreement_metric: row.agreement_metric,
    agreement_score: row.agreement_score,
    quality_threshold: row.quality_threshold,
    agreement_threshold: row.agreement_threshold,
    status: row.status,
    due_date: row.due_date,
    delivered_at: row.delivered_at,
    accepted_at: row.accepted_at,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * `delivered_at` / `accepted_at` after a status change. Entering a delivered
 * status (in review, accepted, rejected, rework) stamps `delivered_at` when it
 * is empty; moving back to planned or in production clears it. Entering
 * accepted stamps `accepted_at`; leaving accepted clears it.
 */
export function stampBatchDates(
  previous: { status: BatchStatus; delivered_at: string | null; accepted_at: string | null } | null,
  status: BatchStatus,
  now: string,
): { delivered_at: string | null; accepted_at: string | null } {
  const wasAccepted = previous?.status === "accepted";
  const deliveredAt = DELIVERED_BATCH_STATUSES.includes(status) ? (previous?.delivered_at ?? now) : null;
  const acceptedAt = status === "accepted" ? (wasAccepted ? (previous?.accepted_at ?? now) : now) : null;
  return { delivered_at: deliveredAt, accepted_at: acceptedAt };
}

async function assertMilestoneInProject(projectId: string, milestoneId: string | null | undefined, q: Queryable) {
  if (!milestoneId) return;
  const row = await q.queryOne<{ project_id: string }>("SELECT project_id FROM milestones WHERE id = $1", [milestoneId]);
  if (!row || row.project_id !== projectId) throw new Error(BATCH_ERRORS.milestoneMismatch);
}

async function assertNumberFree(projectId: string, number: number, excludeId: string | null, q: Queryable) {
  const other = await q.queryOne<{ id: string }>(
    `SELECT id FROM data_batches WHERE project_id = $1 AND number = $2 AND ($3::text IS NULL OR id <> $3) LIMIT 1`,
    [projectId, number, excludeId],
  );
  if (other) throw new Error(BATCH_ERRORS.duplicateNumber);
}

async function assertSingleCalibration(projectId: string, excludeId: string | null, q: Queryable) {
  const other = await q.queryOne<{ id: string }>(
    `SELECT id FROM data_batches WHERE project_id = $1 AND is_calibration AND ($2::text IS NULL OR id <> $2) LIMIT 1`,
    [projectId, excludeId],
  );
  if (other) throw new Error(BATCH_ERRORS.secondCalibration);
}

/* -------------------------------- Reads --------------------------------- */

/** The project's batches: the calibration batch first, then by number. */
export async function listBatches(projectId: string): Promise<DataBatch[]> {
  const rows = await db.query<BatchRow>(
    `SELECT ${BATCH_COLUMNS} FROM data_batches b WHERE b.project_id = $1 ORDER BY ${ORDER_BATCHES}`,
    [projectId],
  );
  return rows.map(toBatch);
}

export async function getBatch(id: string): Promise<DataBatch | null> {
  const row = await db.queryOne<BatchRow>(`SELECT ${BATCH_COLUMNS} FROM data_batches b WHERE b.id = $1`, [id]);
  return row ? toBatch(row) : null;
}

/** Pure summary over a project's batches (exported for tests and client previews). */
export function summarizeBatches(batches: readonly DataBatch[], timeZone: string): DataBatchSummary {
  const zone = safeTimeZone(timeZone);
  let target = 0;
  let delivered = 0;
  let accepted = 0;
  let goldSum = 0;
  let goldCount = 0;
  for (const batch of batches) {
    target += batch.units_target;
    delivered += batch.units_delivered;
    accepted += batch.units_accepted;
    if (batch.gold_accuracy !== null) {
      goldSum += batch.gold_accuracy;
      goldCount += 1;
    }
  }

  const calibration = batches.find((batch) => batch.is_calibration) ?? null;
  const latestWithThreshold = [...batches]
    .filter((batch) => batch.quality_threshold !== null)
    .sort((a, b) => b.number - a.number || b.created_at.localeCompare(a.created_at))[0];
  const qualityThreshold = calibration?.quality_threshold ?? latestWithThreshold?.quality_threshold ?? null;

  const calibrationAccepted = calibration?.status === "accepted";
  const production = batches.filter((batch) => !batch.is_calibration);
  let productionBeforeCalibration = false;
  if (calibration) {
    if (!calibrationAccepted) {
      productionBeforeCalibration = production.some((batch) => batch.status !== "planned");
    } else if (calibration.accepted_at) {
      const acceptedAt = calibration.accepted_at;
      productionBeforeCalibration = production.some(
        (batch) => batch.delivered_at !== null && batch.delivered_at < acceptedAt,
      );
    }
  }

  const weeks = new Map<string, number>();
  for (const batch of batches) {
    if (batch.status !== "accepted" || !batch.accepted_at || batch.units_accepted <= 0) continue;
    const week = startOfWeekISO(dateInTimeZone(batch.accepted_at, zone));
    weeks.set(week, (weeks.get(week) ?? 0) + batch.units_accepted);
  }

  return {
    batch_count: batches.length,
    units_target: target,
    units_delivered: delivered,
    units_accepted: accepted,
    acceptance_rate: delivered > 0 ? accepted / delivered : null,
    avg_gold_accuracy: goldCount > 0 ? goldSum / goldCount : null,
    quality_threshold: qualityThreshold,
    calibration: { exists: calibration !== null, accepted: calibrationAccepted },
    production_before_calibration: productionBeforeCalibration,
    accepted_per_week: [...weeks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week_start, units]) => ({ week_start, units })),
  };
}

/**
 * Totals, acceptance rate (accepted / delivered), mean gold accuracy, the
 * calibration gate state and accepted units per week (Monday of the
 * workspace-timezone date of `accepted_at`).
 */
export async function getBatchSummary(projectId: string, timeZone: string): Promise<DataBatchSummary> {
  return summarizeBatches(await listBatches(projectId), timeZone);
}

/* -------------------------------- Writes -------------------------------- */

/**
 * Adds a batch. `number` defaults to 0 for a calibration batch when free,
 * otherwise max(number) + 1. Recomputes project progress in the transaction.
 */
export async function createBatch(input: CreateBatchInput, userId: string): Promise<DataBatch> {
  const delivered = input.units_delivered ?? 0;
  const accepted = input.units_accepted ?? 0;
  if (accepted > delivered) throw new Error(BATCH_ERRORS.acceptedOverDelivered);
  const status = input.status ?? "planned";
  const now = nowISO();
  const stamps = stampBatchDates(null, status, now);

  try {
    return await transaction(async (tx) => {
      const project = await tx.queryOne<{ id: string }>("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [
        input.project_id,
      ]);
      if (!project) throw new Error(BATCH_ERRORS.projectNotFound);
      await assertMilestoneInProject(input.project_id, input.milestone_id, tx);
      if (input.is_calibration) await assertSingleCalibration(input.project_id, null, tx);

      let number = input.number;
      if (number === undefined) {
        const row = await tx.queryOne<{ max: number | null; zero_taken: boolean }>(
          `SELECT MAX(number)::int AS max, COALESCE(bool_or(number = 0), FALSE) AS zero_taken
             FROM data_batches WHERE project_id = $1`,
          [input.project_id],
        );
        number = input.is_calibration && !row?.zero_taken ? 0 : (row?.max ?? 0) + 1;
      } else {
        await assertNumberFree(input.project_id, number, null, tx);
      }

      const inserted = await tx.queryOne<BatchRow>(
        `INSERT INTO data_batches AS b (id, project_id, milestone_id, number, name, is_calibration, unit_type,
           units_target, units_delivered, units_accepted, guideline_version, gold_accuracy, agreement_metric,
           agreement_score, quality_threshold, agreement_threshold, status, due_date, delivered_at, accepted_at,
           notes, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                 $21, $22, $23, $23)
         RETURNING ${BATCH_COLUMNS}`,
        [
          newId(),
          input.project_id,
          input.milestone_id ?? null,
          number,
          (input.name ?? "").trim(),
          input.is_calibration ?? false,
          input.unit_type ?? "records",
          input.units_target,
          delivered,
          accepted,
          (input.guideline_version ?? "").trim(),
          input.gold_accuracy ?? null,
          input.agreement_metric ?? null,
          input.agreement_score ?? null,
          input.quality_threshold ?? null,
          input.agreement_threshold ?? null,
          status,
          input.due_date ?? null,
          stamps.delivered_at,
          stamps.accepted_at,
          (input.notes ?? "").trim(),
          userId,
          now,
        ],
      );
      if (!inserted) throw new Error(BATCH_ERRORS.projectNotFound);
      await recomputeProjectProgress(input.project_id, tx);
      return toBatch(inserted);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(BATCH_ERRORS.duplicateNumber);
    throw error;
  }
}

/**
 * Updates the provided keys; a status change stamps `delivered_at` /
 * `accepted_at` (stampBatchDates). Accepted units may never exceed delivered
 * units after the patch. Recomputes project progress in the transaction.
 */
export async function updateBatch(id: string, patch: UpdateBatchInput): Promise<DataBatch> {
  try {
    return await transaction(async (tx) => {
      const existingRow = await tx.queryOne<BatchRow>(
        `SELECT ${BATCH_COLUMNS} FROM data_batches b WHERE b.id = $1 FOR UPDATE`,
        [id],
      );
      if (!existingRow) throw new Error(BATCH_ERRORS.notFound);
      const existing = toBatch(existingRow);

      const delivered = patch.units_delivered ?? existing.units_delivered;
      const accepted = patch.units_accepted ?? existing.units_accepted;
      if (accepted > delivered) throw new Error(BATCH_ERRORS.acceptedOverDelivered);
      if (patch.milestone_id !== undefined) await assertMilestoneInProject(existing.project_id, patch.milestone_id, tx);
      if (patch.number !== undefined && patch.number !== existing.number) {
        await assertNumberFree(existing.project_id, patch.number, existing.id, tx);
      }
      if (patch.is_calibration === true && !existing.is_calibration) {
        await assertSingleCalibration(existing.project_id, existing.id, tx);
      }

      const params = new Params();
      const sets: string[] = [];
      const set = (column: string, value: SqlParam) => sets.push(`${column} = ${params.add(value)}`);
      if (patch.milestone_id !== undefined) set("milestone_id", patch.milestone_id);
      if (patch.number !== undefined) set("number", patch.number);
      if (patch.name !== undefined) set("name", patch.name.trim());
      if (patch.is_calibration !== undefined) set("is_calibration", patch.is_calibration);
      if (patch.unit_type !== undefined) set("unit_type", patch.unit_type);
      if (patch.units_target !== undefined) set("units_target", patch.units_target);
      if (patch.units_delivered !== undefined) set("units_delivered", patch.units_delivered);
      if (patch.units_accepted !== undefined) set("units_accepted", patch.units_accepted);
      if (patch.guideline_version !== undefined) set("guideline_version", patch.guideline_version.trim());
      if (patch.gold_accuracy !== undefined) set("gold_accuracy", patch.gold_accuracy);
      if (patch.agreement_metric !== undefined) set("agreement_metric", patch.agreement_metric);
      if (patch.agreement_score !== undefined) set("agreement_score", patch.agreement_score);
      if (patch.quality_threshold !== undefined) set("quality_threshold", patch.quality_threshold);
      if (patch.agreement_threshold !== undefined) set("agreement_threshold", patch.agreement_threshold);
      if (patch.due_date !== undefined) set("due_date", patch.due_date);
      if (patch.notes !== undefined) set("notes", patch.notes.trim());
      const now = nowISO();
      if (patch.status !== undefined && patch.status !== existing.status) {
        const stamps = stampBatchDates(existing, patch.status, now);
        set("status", patch.status);
        set("delivered_at", stamps.delivered_at);
        set("accepted_at", stamps.accepted_at);
      }
      if (sets.length === 0) return existing;
      set("updated_at", now);

      const row = await tx.queryOne<BatchRow>(
        `UPDATE data_batches b SET ${sets.join(", ")} WHERE b.id = ${params.add(id)} RETURNING ${BATCH_COLUMNS}`,
        params.values,
      );
      if (!row) throw new Error(BATCH_ERRORS.notFound);
      await recomputeProjectProgress(existing.project_id, tx);
      return toBatch(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(BATCH_ERRORS.duplicateNumber);
    throw error;
  }
}

export async function deleteBatch(id: string): Promise<{ project_id: string; number: number }> {
  return transaction(async (tx) => {
    const row = await tx.queryOne<{ project_id: string; number: number }>(
      "DELETE FROM data_batches WHERE id = $1 RETURNING project_id, number",
      [id],
    );
    if (!row) throw new Error(BATCH_ERRORS.notFound);
    await recomputeProjectProgress(row.project_id, tx);
    return row;
  });
}
