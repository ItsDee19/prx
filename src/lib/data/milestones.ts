import { db, newId, nowISO, transaction, type Queryable, type SqlParam } from "@/lib/db";
import type {
  Activity,
  ActivityType,
  CreateMilestoneInput,
  Currency,
  Milestone,
  MilestoneKind,
  MilestoneRef,
  MilestoneStatus,
  MilestoneWithMeta,
  ProjectQueryOptions,
  TaskWithMeta,
  UpdateMilestoneInput,
  UserSummary,
} from "@/lib/types";
import { listTasks, recomputeProjectProgress } from "./tasks";

/* ------------------------------ Row shapes ------------------------------ */

/** A raw `milestones` row maps 1:1 onto `Milestone`. */
type MilestoneRow = Milestone;

interface MilestoneMetaRow extends MilestoneRow {
  task_count: number;
  task_done_count: number;
  deliverable_count: number;
  deliverable_done_count: number;
  decider_name: string | null;
  decider_email: string | null;
  decider_color: string | null;
  decider_job_title: string | null;
}

interface GateActivityRow {
  id: string;
  project_id: string | null;
  task_id: string | null;
  task_key: string | null;
  task_title: string | null;
  actor_id: string | null;
  type: ActivityType;
  message: string;
  /** JSONB column: node-postgres returns it already parsed. */
  meta: unknown;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_color: string | null;
  actor_job_title: string | null;
  project_name: string | null;
}

/* ------------------------------ SQL pieces ------------------------------ */

const MILESTONE_COLUMNS = `m.id, m.project_id, m.name, m.description, m.kind, m.phase_key, m.position,
  m.start_date, m.due_date, m.status, m.requires_gate, m.gate_decision, m.gate_decided_by,
  m.gate_decided_at, m.gate_notes, m.extend_count, m.client_signoff_name, m.client_signoff_date,
  m.evidence_url, m.price, m.invoice_status, m.completed_at, m.created_at, m.updated_at`;

/**
 * Hydrated select: task and deliverable counts (non-cancelled tasks with the
 * milestone_id, any depth) through one LATERAL aggregate, plus the gate decider.
 */
const META_SELECT = `
  SELECT ${MILESTONE_COLUMNS},
         COALESCE(tc.task_count, 0)::int AS task_count,
         COALESCE(tc.task_done_count, 0)::int AS task_done_count,
         COALESCE(tc.deliverable_count, 0)::int AS deliverable_count,
         COALESCE(tc.deliverable_done_count, 0)::int AS deliverable_done_count,
         d.name AS decider_name, d.email AS decider_email, d.color AS decider_color,
         d.job_title AS decider_job_title
    FROM milestones m
    LEFT JOIN users d ON d.id = m.gate_decided_by
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE t.status <> 'cancelled')::int AS task_count,
             COUNT(*) FILTER (WHERE t.status = 'done')::int AS task_done_count,
             COUNT(*) FILTER (WHERE t.is_deliverable AND t.status <> 'cancelled')::int AS deliverable_count,
             COUNT(*) FILTER (WHERE t.is_deliverable AND t.status = 'done')::int AS deliverable_done_count
        FROM tasks t
       WHERE t.milestone_id = m.id
    ) tc ON TRUE`;

const ORDER_BY_POSITION = "m.position ASC, m.created_at ASC";

/** Same shape as listProjectActivity (activity.task_id has no FK, so the task join is optional). */
const GATE_ACTIVITY_SELECT = `
  SELECT a.id, a.project_id, a.task_id, a.actor_id, a.type, a.message, a.meta, a.created_at,
         u.name AS actor_name, u.email AS actor_email, u.color AS actor_color,
         u.job_title AS actor_job_title,
         p.name AS project_name,
         CASE WHEN t.id IS NULL THEN NULL ELSE 'PRX-' || t.number END AS task_key,
         t.title AS task_title
    FROM activity a
    LEFT JOIN users u ON u.id = a.actor_id
    LEFT JOIN projects p ON p.id = a.project_id
    LEFT JOIN tasks t ON t.id = a.task_id`;

const GATE_ACTIVITY_TYPES: readonly ActivityType[] = ["gate_requested", "gate_decided"];

/* ------------------------------ Errors ---------------------------------- */

/** User-facing messages thrown by the write functions (actions pass them through). */
export const MILESTONE_ERRORS = {
  notFound: "This phase no longer exists.",
  projectNotFound: "This project no longer exists.",
  priceNeedsCurrency: "Set the project's currency before adding phase prices.",
  gateReviewViaRequest: "Use Request gate review to send a phase to its gate.",
  gatedDone: "A gated phase completes through its gate decision. Request a gate review instead.",
  inGateReview:
    "This phase is waiting for its gate decision. Record the decision, or withdraw the gate review first.",
  gateLocked: "Decide the gate before changing this phase's kind or gate.",
  dateOrder: "The due date must be on or after the start date.",
  requestGuard: "Only an active phase with a gate can go to gate review.",
  gatedStop: "A gated phase stops through its gate decision. Request a gate review instead.",
  activeKindChange:
    "Mark this phase done or move it back to planned before turning it into a point milestone.",
  pointNeverActive: "A point milestone is either planned or reached; it never becomes active.",
  anotherActive: "Another phase is in progress. Mark it done or move it back to planned first.",
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

function emptyToNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value.trim() === "" ? null : value.trim();
}

/**
 * Exactly the `Milestone` fields of a row. `price` and `invoice_status` are
 * admin-only and come back null unless `includeCommercial` is true.
 */
function toMilestone(row: MilestoneRow, includeCommercial: boolean): Milestone {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    phase_key: row.phase_key,
    position: row.position,
    start_date: row.start_date,
    due_date: row.due_date,
    status: row.status,
    requires_gate: row.requires_gate,
    gate_decision: row.gate_decision,
    gate_decided_by: row.gate_decided_by,
    gate_decided_at: row.gate_decided_at,
    gate_notes: row.gate_notes,
    extend_count: row.extend_count,
    client_signoff_name: row.client_signoff_name,
    client_signoff_date: row.client_signoff_date,
    evidence_url: row.evidence_url,
    price: includeCommercial ? row.price : null,
    invoice_status: includeCommercial ? row.invoice_status : null,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** round(100 * done / total); 100 once the milestone is done; 0 without tasks. */
function milestoneProgress(row: MilestoneMetaRow): number {
  if (row.status === "done") return 100;
  if (row.task_count <= 0) return 0;
  return Math.min(100, Math.round((row.task_done_count / row.task_count) * 100));
}

function toMilestoneWithMeta(row: MilestoneMetaRow, includeCommercial: boolean): MilestoneWithMeta {
  const decider: UserSummary | null =
    row.gate_decided_by && row.decider_name !== null
      ? {
          id: row.gate_decided_by,
          name: row.decider_name,
          email: row.decider_email ?? "",
          color: row.decider_color ?? "#64748b",
          job_title: row.decider_job_title,
        }
      : null;
  return {
    ...toMilestone(row, includeCommercial),
    task_count: row.task_count,
    task_done_count: row.task_done_count,
    deliverable_count: row.deliverable_count,
    deliverable_done_count: row.deliverable_done_count,
    progress: milestoneProgress(row),
    gate_decider: decider,
  };
}

function parseMeta(raw: unknown): Record<string, unknown> {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toActivity(row: GateActivityRow): Activity {
  return {
    id: row.id,
    project_id: row.project_id,
    actor_id: row.actor_id,
    type: row.type,
    message: row.message,
    meta: parseMeta(row.meta),
    created_at: row.created_at,
    actor:
      row.actor_id && row.actor_name !== null
        ? {
            id: row.actor_id,
            name: row.actor_name,
            email: row.actor_email ?? "",
            color: row.actor_color ?? "#64748b",
            job_title: row.actor_job_title,
          }
        : null,
    project_name: row.project_name,
    task_id: row.task_id,
    task_key: row.task_key,
    task_title: row.task_title,
  };
}

/** Locks the project row (serialises phase writes with currency changes and progress writes). */
async function lockProject(projectId: string, q: Queryable): Promise<{ id: string; currency: Currency | null } | null> {
  return q.queryOne<{ id: string; currency: Currency | null }>(
    "SELECT id, currency FROM projects WHERE id = $1 FOR UPDATE",
    [projectId],
  );
}

/**
 * Row lock taken by getMilestoneRow. Writers always lock the project row
 * first and the milestone second (the same order as createTask, whose
 * milestone_id FK insert takes KEY SHARE on the milestone). "nokey" (FOR NO
 * KEY UPDATE) is enough for any UPDATE, since no write changes milestones.id,
 * and it does not conflict with those KEY SHARE locks; DELETE needs "update".
 */
type MilestoneLock = "none" | "nokey" | "update";

const LOCK_CLAUSE: Record<MilestoneLock, string> = {
  none: "",
  nokey: " FOR NO KEY UPDATE",
  update: " FOR UPDATE",
};

async function getMilestoneRow(id: string, q: Queryable, lock: MilestoneLock): Promise<MilestoneRow | null> {
  return q.queryOne<MilestoneRow>(
    `SELECT ${MILESTONE_COLUMNS} FROM milestones m WHERE m.id = $1${LOCK_CLAUSE[lock]}`,
    [id],
  );
}

/**
 * Locks the milestone's project, then the milestone itself (see MilestoneLock).
 * The project id is read without a lock first; the milestone is re-read under
 * its lock, so a row deleted (or moved) in between reports "not found".
 */
async function lockProjectThenMilestone(
  id: string,
  q: Queryable,
  lock: Exclude<MilestoneLock, "none">,
): Promise<{ existing: MilestoneRow; project: { id: string; currency: Currency | null } }> {
  const unlocked = await getMilestoneRow(id, q, "none");
  if (!unlocked) throw new Error(MILESTONE_ERRORS.notFound);
  const project = await lockProject(unlocked.project_id, q);
  if (!project) throw new Error(MILESTONE_ERRORS.projectNotFound);
  const existing = await getMilestoneRow(id, q, lock);
  if (!existing || existing.project_id !== project.id) throw new Error(MILESTONE_ERRORS.notFound);
  return { existing, project };
}

function assertDateOrder(start: string | null, due: string | null): void {
  if (start && due && due < start) throw new Error(MILESTONE_ERRORS.dateOrder);
}

/* ------------------------------- Queries -------------------------------- */

/** Every milestone of a project by position, hydrated with counts and progress. */
export async function listMilestones(
  projectId: string,
  options: ProjectQueryOptions = {},
  q: Queryable = db,
): Promise<MilestoneWithMeta[]> {
  const rows = await q.query<MilestoneMetaRow>(
    `${META_SELECT} WHERE m.project_id = $1 ORDER BY ${ORDER_BY_POSITION}`,
    [projectId],
  );
  const includeCommercial = options.includeCommercial === true;
  return rows.map((row) => toMilestoneWithMeta(row, includeCommercial));
}

/** Id, name and kind of every milestone of a project by position (filters, grouping, pickers). */
export async function listMilestoneRefs(projectId: string): Promise<MilestoneRef[]> {
  return db.query<MilestoneRef>(
    `SELECT m.id, m.name, m.kind FROM milestones m WHERE m.project_id = $1 ORDER BY ${ORDER_BY_POSITION}`,
    [projectId],
  );
}

export async function getMilestone(
  id: string,
  options: ProjectQueryOptions = {},
): Promise<MilestoneWithMeta | null> {
  const row = await db.queryOne<MilestoneMetaRow>(`${META_SELECT} WHERE m.id = $1`, [id]);
  return row ? toMilestoneWithMeta(row, options.includeCommercial === true) : null;
}

/** Deliverable tasks of a milestone (the phase's deliverables checklist), in creation order. */
export async function listDeliverables(milestoneId: string): Promise<TaskWithMeta[]> {
  return listTasks({ milestoneId, isDeliverable: true, sort: "number" });
}

/**
 * Gate history of a phase: its `gate_requested` / `gate_decided` activity
 * entries (meta.milestone_id = the phase), newest first.
 */
export async function listGateHistory(milestoneId: string): Promise<Activity[]> {
  const rows = await db.query<GateActivityRow>(
    `${GATE_ACTIVITY_SELECT}
      WHERE a.project_id = (SELECT ms.project_id FROM milestones ms WHERE ms.id = $1)
        AND a.type = ANY($2::text[])
        AND a.meta->>'milestone_id' = $1
      ORDER BY a.created_at DESC, a.id DESC`,
    [milestoneId, GATE_ACTIVITY_TYPES],
  );
  return rows.map(toActivity);
}

/* ------------------------------- Mutations ------------------------------ */

/**
 * Activates the first planned phase (kind 'phase', by position). Point
 * milestones are never activated. Returns the activated row (stripped unless
 * includeCommercial) or null when no planned phase is left.
 */
export async function activateNextPhase(
  projectId: string,
  q: Queryable = db,
  options: ProjectQueryOptions = {},
): Promise<Milestone | null> {
  const row = await q.queryOne<MilestoneRow>(
    `UPDATE milestones AS m
        SET status = 'active', updated_at = $2
      WHERE m.id = (
        SELECT n.id FROM milestones n
         WHERE n.project_id = $1 AND n.kind = 'phase' AND n.status = 'planned'
         ORDER BY n.position ASC, n.created_at ASC
         LIMIT 1
      )
      RETURNING ${MILESTONE_COLUMNS}`,
    [projectId, nowISO()],
  );
  return row ? toMilestone(row, options.includeCommercial === true) : null;
}

/**
 * Adds a phase or point milestone at the end of the project's list. A price
 * needs the project's currency; gated phases cannot be created as done and
 * nothing is created in gate review (requestGateReview owns that move).
 */
export async function createMilestone(
  input: CreateMilestoneInput,
  options: ProjectQueryOptions = {},
): Promise<Milestone> {
  const now = nowISO();
  const kind: MilestoneKind = input.kind ?? "phase";
  const status: MilestoneStatus = input.status ?? "planned";
  const requiresGate = kind === "phase" && input.requires_gate === true;
  const price = input.price ?? null;
  const startDate = emptyToNull(input.start_date);
  const dueDate = emptyToNull(input.due_date);

  if (status === "gate_review") throw new Error(MILESTONE_ERRORS.gateReviewViaRequest);
  if (status === "done" && requiresGate) throw new Error(MILESTONE_ERRORS.gatedDone);
  assertDateOrder(startDate, dueDate);

  return transaction(async (tx) => {
    const project = await lockProject(input.project_id, tx);
    if (!project) throw new Error(MILESTONE_ERRORS.projectNotFound);
    if (price !== null && project.currency === null) throw new Error(MILESTONE_ERRORS.priceNeedsCurrency);

    const positionRow = await tx.queryOne<{ next: number }>(
      "SELECT (COALESCE(MAX(position), -1) + 1)::int AS next FROM milestones WHERE project_id = $1",
      [project.id],
    );

    const columns = [
      "id",
      "project_id",
      "name",
      "description",
      "kind",
      "phase_key",
      "position",
      "start_date",
      "due_date",
      "status",
      "requires_gate",
      "price",
      "completed_at",
      "created_at",
      "updated_at",
    ];
    const values: SqlParam[] = [
      newId(),
      project.id,
      input.name.trim(),
      (input.description ?? "").trim(),
      kind,
      emptyToNull(input.phase_key),
      positionRow?.next ?? 0,
      startDate,
      dueDate,
      status,
      requiresGate,
      price,
      status === "done" ? now : null,
      now,
      now,
    ];
    if (input.invoice_status !== undefined) {
      columns.push("invoice_status");
      values.push(input.invoice_status);
    }

    const row = await tx.queryOne<MilestoneRow>(
      `INSERT INTO milestones AS m (${columns.join(", ")})
       VALUES (${values.map((_, index) => `$${index + 1}`).join(", ")})
       RETURNING ${MILESTONE_COLUMNS}`,
      values,
    );
    if (!row) throw new Error("Could not create the milestone.");

    if (kind === "phase") await recomputeProjectProgress(project.id, tx);
    return toMilestone(row, options.includeCommercial === true);
  });
}

/**
 * Updates only the provided keys. Maintains `completed_at`; refuses
 * `status: "gate_review"` (use requestGateReview), any status change out of
 * gate review other than withdrawing it to active (decideGate records Go or
 * Stop), `status: "done"` on a gated phase unless its gate decision was
 * "go", and `status: "stopped"` on a gated phase (decideGate owns Stop);
 * point milestones never carry a gate and are never active (an active phase
 * cannot become one). A phase becomes active only while no other phase is
 * active or in gate review. Locks the project, then the milestone (FOR NO
 * KEY UPDATE), like every other phase writer. When a phase becomes done and
 * no other phase is active or in gate review, the next planned phase is
 * activated in the same transaction. Recomputes project progress when a phase
 * status or kind changes. Returns the row stripped unless includeCommercial.
 */
export async function updateMilestone(
  id: string,
  patch: UpdateMilestoneInput,
  options: ProjectQueryOptions = {},
): Promise<Milestone> {
  const now = nowISO();

  return transaction(async (tx) => {
    const { existing, project } = await lockProjectThenMilestone(id, tx, "nokey");

    const kind: MilestoneKind = patch.kind ?? existing.kind;
    const requiresGate = kind === "phase" && (patch.requires_gate ?? existing.requires_gate);
    const status: MilestoneStatus = patch.status ?? existing.status;
    const statusChanged = status !== existing.status;
    const kindChanged = kind !== existing.kind;

    if (statusChanged && status === "gate_review") throw new Error(MILESTONE_ERRORS.gateReviewViaRequest);
    // Only decideGate closes a gate review (done or stopped, with the decision record); the one
    // status change allowed here is withdrawing the review back to active.
    if (statusChanged && existing.status === "gate_review" && status !== "active") {
      throw new Error(MILESTONE_ERRORS.inGateReview);
    }
    if (existing.status === "gate_review" && (kindChanged || requiresGate !== existing.requires_gate)) {
      throw new Error(MILESTONE_ERRORS.gateLocked);
    }
    if (statusChanged && status === "done" && requiresGate && existing.gate_decision !== "go") {
      throw new Error(MILESTONE_ERRORS.gatedDone);
    }
    // decideGate owns Stop on a gated phase (it records the decision).
    if (statusChanged && status === "stopped" && requiresGate) throw new Error(MILESTONE_ERRORS.gatedStop);
    // Point milestones are planned or done, never the current phase.
    if (kind === "milestone" && status === "active") {
      if (kindChanged && !statusChanged) throw new Error(MILESTONE_ERRORS.activeKindChange);
      if (statusChanged) throw new Error(MILESTONE_ERRORS.pointNeverActive);
    }
    // One current phase at a time: starting or reopening a phase waits for the active one.
    if (kind === "phase" && status === "active" && (statusChanged || kindChanged)) {
      const other = await tx.queryOne<{ id: string }>(
        `SELECT id FROM milestones
          WHERE project_id = $1 AND kind = 'phase' AND status IN ('active', 'gate_review') AND id <> $2
          LIMIT 1`,
        [existing.project_id, id],
      );
      if (other) throw new Error(MILESTONE_ERRORS.anotherActive);
    }
    if (patch.price !== undefined && patch.price !== null && project.currency === null) {
      throw new Error(MILESTONE_ERRORS.priceNeedsCurrency);
    }
    const startDate = patch.start_date !== undefined ? emptyToNull(patch.start_date) : existing.start_date;
    const dueDate = patch.due_date !== undefined ? emptyToNull(patch.due_date) : existing.due_date;
    assertDateOrder(startDate, dueDate);

    const sets: string[] = [];
    const params = new Params();
    if (patch.name !== undefined) sets.push(`name = ${params.add(patch.name.trim())}`);
    if (patch.description !== undefined) sets.push(`description = ${params.add(patch.description.trim())}`);
    if (kindChanged) sets.push(`kind = ${params.add(kind)}`);
    if (patch.phase_key !== undefined) sets.push(`phase_key = ${params.add(emptyToNull(patch.phase_key))}`);
    if (patch.start_date !== undefined) sets.push(`start_date = ${params.add(startDate)}`);
    if (patch.due_date !== undefined) sets.push(`due_date = ${params.add(dueDate)}`);
    if (requiresGate !== existing.requires_gate) sets.push(`requires_gate = ${params.add(requiresGate)}`);
    if (statusChanged) {
      sets.push(`status = ${params.add(status)}`);
      // completed_at mirrors the status: stamped on entry to done, cleared on exit.
      if (status === "done") sets.push(`completed_at = ${params.add(now)}`);
      else if (existing.status === "done") sets.push("completed_at = NULL");
    }
    if (patch.price !== undefined) sets.push(`price = ${params.add(patch.price)}`);
    if (patch.invoice_status !== undefined) sets.push(`invoice_status = ${params.add(patch.invoice_status)}`);
    if (patch.gate_notes !== undefined) sets.push(`gate_notes = ${params.add(patch.gate_notes.trim())}`);
    if (patch.client_signoff_name !== undefined) {
      sets.push(`client_signoff_name = ${params.add(emptyToNull(patch.client_signoff_name))}`);
    }
    if (patch.client_signoff_date !== undefined) {
      sets.push(`client_signoff_date = ${params.add(emptyToNull(patch.client_signoff_date))}`);
    }
    if (patch.evidence_url !== undefined) {
      sets.push(`evidence_url = ${params.add(emptyToNull(patch.evidence_url))}`);
    }
    if (sets.length === 0) return toMilestone(existing, options.includeCommercial === true);
    sets.push(`updated_at = ${params.add(now)}`);

    const row = await tx.queryOne<MilestoneRow>(
      `UPDATE milestones AS m SET ${sets.join(", ")} WHERE m.id = ${params.add(id)}
       RETURNING ${MILESTONE_COLUMNS}`,
      params.values,
    );
    if (!row) throw new Error(MILESTONE_ERRORS.notFound);

    if (statusChanged && status === "done" && kind === "phase") {
      const busy = await tx.queryOne<{ id: string }>(
        `SELECT id FROM milestones
          WHERE project_id = $1 AND kind = 'phase' AND status IN ('active', 'gate_review') AND id <> $2
          LIMIT 1`,
        [existing.project_id, id],
      );
      if (!busy) await activateNextPhase(existing.project_id, tx, options);
    }
    if ((statusChanged || kindChanged) && (kind === "phase" || existing.kind === "phase")) {
      await recomputeProjectProgress(existing.project_id, tx);
    }
    return toMilestone(row, options.includeCommercial === true);
  });
}

/** Deletes a milestone; its tasks stay (milestone_id SET NULL). Recomputes project progress. */
export async function deleteMilestone(id: string): Promise<{ project_id: string; name: string }> {
  return transaction(async (tx) => {
    const { existing } = await lockProjectThenMilestone(id, tx, "update");
    await tx.execute("DELETE FROM milestones WHERE id = $1", [id]);
    if (existing.kind === "phase") await recomputeProjectProgress(existing.project_id, tx);
    return { project_id: existing.project_id, name: existing.name };
  });
}

/**
 * Rewrites positions 0..n: the given ids first (ids of other projects are
 * ignored), then any milestone left out, in its current order.
 */
export async function reorderMilestones(projectId: string, orderedIds: string[]): Promise<void> {
  await transaction(async (tx) => {
    // Project first, like every phase writer (updateMilestone may also touch a sibling row).
    if (!(await lockProject(projectId, tx))) throw new Error(MILESTONE_ERRORS.projectNotFound);
    const rows = await tx.query<{ id: string }>(
      `SELECT m.id FROM milestones m WHERE m.project_id = $1 ORDER BY ${ORDER_BY_POSITION} FOR NO KEY UPDATE`,
      [projectId],
    );
    const current = rows.map((row) => row.id);
    const known = new Set(current);
    const seen = new Set<string>();
    const order: string[] = [];
    for (const milestoneId of orderedIds) {
      if (known.has(milestoneId) && !seen.has(milestoneId)) {
        seen.add(milestoneId);
        order.push(milestoneId);
      }
    }
    for (const milestoneId of current) if (!seen.has(milestoneId)) order.push(milestoneId);
    if (order.length === 0) return;
    await tx.execute(
      `UPDATE milestones AS m
          SET position = o.ord - 1
         FROM unnest($2::text[]) WITH ORDINALITY AS o(id, ord)
        WHERE m.id = o.id AND m.project_id = $1 AND m.position <> o.ord - 1`,
      [projectId, order],
    );
  });
}

/**
 * Moves an active gated phase to gate review (guarded UPDATE, so two people
 * cannot both request it). Throws a user-facing Error when the guard fails.
 */
export async function requestGateReview(id: string, options: ProjectQueryOptions = {}): Promise<Milestone> {
  const row = await db.queryOne<MilestoneRow>(
    `UPDATE milestones AS m
        SET status = 'gate_review', updated_at = $2
      WHERE m.id = $1 AND m.status = 'active' AND m.requires_gate AND m.kind = 'phase'
      RETURNING ${MILESTONE_COLUMNS}`,
    [id, nowISO()],
  );
  if (!row) throw new Error(MILESTONE_ERRORS.requestGuard);
  return toMilestone(row, options.includeCommercial === true);
}
