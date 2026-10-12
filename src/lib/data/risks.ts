import { db, newId, nowISO, transaction, type Queryable, type SqlParam } from "@/lib/db";
import { OPEN_RISK_STATUSES, RISK_SCALE, RISK_SCORE_AMBER, RISK_SCORE_RED } from "@/lib/constants";
import type {
  CreateRiskInput,
  Risk,
  RiskCategory,
  RiskFilters,
  RiskHeatCell,
  RiskKind,
  RiskStatus,
  RiskWithMeta,
  UpdateRiskInput,
} from "@/lib/types";
import { riskScore, riskSeverity } from "@/lib/utils";

/**
 * RAID log: risks, assumptions, issues, dependencies and decisions (SPEC.md
 * sections 16 and 17.6). Score = likelihood x impact (`riskScore`), severity
 * from the score (`riskSeverity`: >= 15 red, >= 8 amber). "Open" means
 * OPEN_RISK_STATUSES (open + mitigating); `closed_at` follows the status.
 */

/* ------------------------------ Errors ---------------------------------- */

/** User-facing messages thrown by the write functions (actions pass them through). */
export const RISK_ERRORS = {
  notFound: "This RAID item no longer exists.",
  projectNotFound: "This project no longer exists.",
  ownerNotFound: "Pick an active team member as the owner.",
  alreadyIssue: "This item is already an issue.",
  title: "Write a title for this item.",
} as const;

/* ------------------------------ Row shapes ------------------------------ */

interface RiskRow {
  id: string;
  project_id: string;
  kind: RiskKind;
  category: RiskCategory;
  title: string;
  description: string;
  likelihood: number | null;
  impact: number | null;
  owner_id: string | null;
  mitigation: string;
  status: RiskStatus;
  review_date: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

interface RiskMetaRow extends RiskRow {
  project_name: string;
  owner_name: string | null;
  owner_email: string | null;
  owner_color: string | null;
  owner_job_title: string | null;
}

const RISK_COLUMNS = `r.id, r.project_id, r.kind, r.category, r.title, r.description,
  r.likelihood::int AS likelihood, r.impact::int AS impact, r.owner_id, r.mitigation, r.status,
  r.review_date, r.due_date, r.created_by, r.created_at, r.updated_at, r.closed_at`;

const SELECT_META = `
  SELECT ${RISK_COLUMNS},
         p.name AS project_name,
         u.name AS owner_name, u.email AS owner_email, u.color AS owner_color,
         u.job_title AS owner_job_title
    FROM risks r
    JOIN projects p ON p.id = r.project_id
    LEFT JOIN users u ON u.id = r.owner_id`;

/** Severity bucket mirroring riskSeverity(): 3 red, 2 amber, 1 green, 0 unscored. */
const SEVERITY_BUCKET = `CASE
    WHEN r.likelihood IS NULL OR r.impact IS NULL THEN 0
    WHEN r.likelihood * r.impact >= ${RISK_SCORE_RED} THEN 3
    WHEN r.likelihood * r.impact >= ${RISK_SCORE_AMBER} THEN 2
    ELSE 1 END`;

/** Default order: severity desc, then review date asc (nulls last), then score desc, newest first. */
const DEFAULT_ORDER = `${SEVERITY_BUCKET} DESC, r.review_date ASC NULLS LAST,
  (r.likelihood * r.impact) DESC NULLS LAST, r.created_at DESC, r.id ASC`;

/* ------------------------------ Mapping --------------------------------- */

function toRisk(row: RiskRow): Risk {
  return {
    id: row.id,
    project_id: row.project_id,
    kind: row.kind,
    category: row.category,
    title: row.title,
    description: row.description,
    likelihood: row.likelihood,
    impact: row.impact,
    owner_id: row.owner_id,
    mitigation: row.mitigation,
    status: row.status,
    review_date: row.review_date,
    due_date: row.due_date,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    closed_at: row.closed_at,
  };
}

function toRiskWithMeta(row: RiskMetaRow): RiskWithMeta {
  const score = riskScore(row.likelihood, row.impact);
  return {
    ...toRisk(row),
    project_name: row.project_name,
    owner:
      row.owner_id && row.owner_name !== null
        ? {
            id: row.owner_id,
            name: row.owner_name,
            email: row.owner_email ?? "",
            color: row.owner_color ?? "#64748b",
            job_title: row.owner_job_title,
          }
        : null,
    score,
    severity: riskSeverity(score),
  };
}

/** Collects bound values and hands out their `$n` placeholders. */
class Params {
  readonly values: SqlParam[] = [];

  add(value: SqlParam): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function scaleOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const rounded = Math.round(value);
  return rounded >= 1 && rounded <= 5 ? rounded : null;
}

function dateOrNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value.trim() === "" ? null : value.trim();
}

/* ------------------------------ Reads ----------------------------------- */

/** RAID items matching the filters, by severity desc then review date asc. */
export async function listRisks(filters: RiskFilters = {}, q: Queryable = db): Promise<RiskWithMeta[]> {
  const params = new Params();
  const where: string[] = [];
  if (filters.projectId) where.push(`r.project_id = ${params.add(filters.projectId)}`);
  const kinds = asArray(filters.kind);
  if (kinds.length > 0) where.push(`r.kind = ANY(${params.add(kinds)}::text[])`);
  const statuses = asArray(filters.status);
  if (statuses.length > 0) where.push(`r.status = ANY(${params.add(statuses)}::text[])`);
  if (filters.category) where.push(`r.category = ${params.add(filters.category)}`);
  if (filters.ownerId) where.push(`r.owner_id = ${params.add(filters.ownerId)}`);
  if (filters.likelihood !== undefined) where.push(`r.likelihood = ${params.add(filters.likelihood)}`);
  if (filters.impact !== undefined) where.push(`r.impact = ${params.add(filters.impact)}`);
  if (filters.minScore !== undefined) {
    where.push(`r.likelihood * r.impact >= ${params.add(filters.minScore)}`);
  }
  if (filters.reviewDueBy) {
    where.push(`r.status = ANY(${params.add(OPEN_RISK_STATUSES)}::text[])`);
    where.push(`r.review_date IS NOT NULL AND r.review_date <= ${params.add(filters.reviewDueBy)}`);
  }
  let sql = SELECT_META;
  if (where.length > 0) sql += ` WHERE ${where.join(" AND ")}`;
  sql += ` ORDER BY ${DEFAULT_ORDER}`;
  if (filters.limit !== undefined && filters.limit > 0) sql += ` LIMIT ${params.add(Math.floor(filters.limit))}`;
  const rows = await q.query<RiskMetaRow>(sql, params.values);
  return rows.map(toRiskWithMeta);
}

export async function getRisk(id: string, q: Queryable = db): Promise<RiskWithMeta | null> {
  const row = await q.queryOne<RiskMetaRow>(`${SELECT_META} WHERE r.id = $1`, [id]);
  return row ? toRiskWithMeta(row) : null;
}

async function getRiskRow(q: Queryable, id: string, forUpdate = false): Promise<Risk | null> {
  const row = await q.queryOne<RiskRow>(
    `SELECT ${RISK_COLUMNS} FROM risks r WHERE r.id = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [id],
  );
  return row ? toRisk(row) : null;
}

/**
 * Likelihood x impact grid of the project's open/mitigating items that have
 * both values: always 25 cells, likelihood 5 (top row) to 1, impact 1 to 5.
 */
export async function getRiskHeatmap(projectId: string): Promise<RiskHeatCell[]> {
  const rows = await db.query<{ likelihood: number; impact: number; count: number }>(
    `SELECT r.likelihood::int AS likelihood, r.impact::int AS impact, COUNT(*)::int AS count
       FROM risks r
      WHERE r.project_id = $1 AND r.status = ANY($2::text[])
        AND r.likelihood IS NOT NULL AND r.impact IS NOT NULL
      GROUP BY r.likelihood, r.impact`,
    [projectId, OPEN_RISK_STATUSES],
  );
  const counts = new Map(rows.map((row) => [`${row.likelihood}:${row.impact}`, row.count]));
  const cells: RiskHeatCell[] = [];
  for (const likelihood of [...RISK_SCALE].reverse()) {
    for (const impact of RISK_SCALE) {
      cells.push({ likelihood, impact, count: counts.get(`${likelihood}:${impact}`) ?? 0 });
    }
  }
  return cells;
}

/**
 * Open/mitigating items whose review date has passed (review_date < today),
 * across all projects or for one owner (Home: "overdue risk reviews").
 */
export async function countOverdueRiskReviews(today: string, ownerId?: string): Promise<number> {
  const row = await db.queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM risks r
      WHERE r.status = ANY($1::text[]) AND r.review_date IS NOT NULL AND r.review_date < $2
        AND ($3::text IS NULL OR r.owner_id = $3)`,
    [OPEN_RISK_STATUSES, today, ownerId ?? null],
  );
  return row?.count ?? 0;
}

/* ------------------------------ Writes ---------------------------------- */

async function assertActiveOwner(q: Queryable, ownerId: string | null): Promise<void> {
  if (ownerId === null) return;
  const row = await q.queryOne<{ id: string }>("SELECT id FROM users WHERE id = $1 AND is_active = TRUE", [ownerId]);
  if (!row) throw new Error(RISK_ERRORS.ownerNotFound);
}

export async function createRisk(input: CreateRiskInput, userId: string): Promise<Risk> {
  const title = input.title.trim();
  if (!title) throw new Error(RISK_ERRORS.title);
  const ownerId = input.owner_id ?? null;
  const status: RiskStatus = input.status ?? "open";
  return transaction(async (tx) => {
    const project = await tx.queryOne<{ id: string }>("SELECT id FROM projects WHERE id = $1", [input.project_id]);
    if (!project) throw new Error(RISK_ERRORS.projectNotFound);
    await assertActiveOwner(tx, ownerId);
    const id = newId();
    const now = nowISO();
    await tx.execute(
      `INSERT INTO risks (id, project_id, kind, category, title, description, likelihood, impact, owner_id,
         mitigation, status, review_date, due_date, created_by, created_at, updated_at, closed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, $16)`,
      [
        id,
        project.id,
        input.kind ?? "risk",
        input.category ?? "other",
        title,
        (input.description ?? "").trim(),
        scaleOrNull(input.likelihood),
        scaleOrNull(input.impact),
        ownerId,
        (input.mitigation ?? "").trim(),
        status,
        dateOrNull(input.review_date),
        dateOrNull(input.due_date),
        userId,
        now,
        status === "closed" ? now : null,
      ],
    );
    const created = await getRiskRow(tx, id);
    if (!created) throw new Error(RISK_ERRORS.notFound);
    return created;
  });
}

/**
 * Updates the provided fields. `closed_at` is set when the status becomes
 * closed and cleared when it leaves closed (reopen).
 */
export async function updateRisk(id: string, patch: UpdateRiskInput): Promise<Risk> {
  return transaction(async (tx) => {
    const existing = await getRiskRow(tx, id, true);
    if (!existing) throw new Error(RISK_ERRORS.notFound);
    const params = new Params();
    const sets: string[] = [];
    const set = (column: string, value: SqlParam) => sets.push(`${column} = ${params.add(value)}`);

    if (patch.kind !== undefined) set("kind", patch.kind);
    if (patch.category !== undefined) set("category", patch.category);
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title) throw new Error(RISK_ERRORS.title);
      set("title", title);
    }
    if (patch.description !== undefined) set("description", patch.description.trim());
    if (patch.likelihood !== undefined) set("likelihood", scaleOrNull(patch.likelihood));
    if (patch.impact !== undefined) set("impact", scaleOrNull(patch.impact));
    if (patch.owner_id !== undefined) {
      const ownerId = patch.owner_id ?? null;
      if (ownerId !== existing.owner_id) await assertActiveOwner(tx, ownerId);
      set("owner_id", ownerId);
    }
    if (patch.mitigation !== undefined) set("mitigation", patch.mitigation.trim());
    if (patch.review_date !== undefined) set("review_date", dateOrNull(patch.review_date));
    if (patch.due_date !== undefined) set("due_date", dateOrNull(patch.due_date));
    const now = nowISO();
    if (patch.status !== undefined && patch.status !== existing.status) {
      set("status", patch.status);
      if (patch.status === "closed") set("closed_at", now);
      else if (existing.status === "closed") set("closed_at", null);
    }

    if (sets.length > 0) {
      set("updated_at", now);
      await tx.execute(`UPDATE risks SET ${sets.join(", ")} WHERE id = ${params.add(id)}`, params.values);
    }
    const updated = await getRiskRow(tx, id);
    if (!updated) throw new Error(RISK_ERRORS.notFound);
    return updated;
  });
}

/** A risk (or assumption/dependency) that materialised: kind issue, status open. */
export async function convertRiskToIssue(id: string): Promise<Risk> {
  return transaction(async (tx) => {
    const existing = await getRiskRow(tx, id, true);
    if (!existing) throw new Error(RISK_ERRORS.notFound);
    if (existing.kind === "issue") throw new Error(RISK_ERRORS.alreadyIssue);
    await tx.execute(
      `UPDATE risks SET kind = 'issue', status = 'open', closed_at = NULL, updated_at = $2 WHERE id = $1`,
      [id, nowISO()],
    );
    const updated = await getRiskRow(tx, id);
    if (!updated) throw new Error(RISK_ERRORS.notFound);
    return updated;
  });
}

/** Closes an item (closed_at = now). Closing an already closed item keeps its closed_at. */
export async function closeRisk(id: string): Promise<Risk> {
  return transaction(async (tx) => {
    const existing = await getRiskRow(tx, id, true);
    if (!existing) throw new Error(RISK_ERRORS.notFound);
    if (existing.status !== "closed") {
      const now = nowISO();
      await tx.execute(
        `UPDATE risks SET status = 'closed', closed_at = $2, updated_at = $2 WHERE id = $1`,
        [id, now],
      );
    }
    const updated = await getRiskRow(tx, id);
    if (!updated) throw new Error(RISK_ERRORS.notFound);
    return updated;
  });
}

export async function deleteRisk(id: string): Promise<{ project_id: string; title: string }> {
  const row = await db.queryOne<{ project_id: string; title: string }>(
    "DELETE FROM risks WHERE id = $1 RETURNING project_id, title",
    [id],
  );
  if (!row) throw new Error(RISK_ERRORS.notFound);
  return { project_id: row.project_id, title: row.title };
}
