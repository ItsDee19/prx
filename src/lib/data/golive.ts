import { db, nowISO, transaction, type Queryable } from "@/lib/db";
import { HANDOVER_PHASE_KEY, MAX_TUNING_DAYS, TUNING_ALERT_DAYS } from "@/lib/constants";
import type { DeliveryState, GoLiveSummary, MilestoneKind, MilestoneStatus, Project, ProjectQueryOptions } from "@/lib/types";
import { addDaysISO, diffDaysISO, tuningEndDate } from "@/lib/workspace-time";
import { activateNextPhase } from "./milestones";
import { getProject } from "./projects";
import { recomputeProjectProgress } from "./tasks";

/*
 * Go-live and the post-go-live tuning window (SPEC §17.6, W4 scorecard).
 * setGoLiveDate is the only write path for projects.go_live_date.
 *
 * Every writer locks the project row first and then the milestones it touches
 * (both FOR NO KEY UPDATE), the same order as every other phase writer, so a
 * gate decision, a phase edit and a go-live change on one project serialise.
 */

/** phase_key of the point milestone that marks the production launch. */
export const GO_LIVE_PHASE_KEY = "go_live";

export const GOLIVE_ERRORS = {
  projectNotFound: "This project no longer exists.",
  tuningDays: `Tuning windows are between 0 and ${MAX_TUNING_DAYS} days.`,
  needsGoLive: "Set the go-live date before closing tuning.",
  alreadyClosed: "Tuning is already closed for this project.",
} as const;

interface ProjectLockRow {
  id: string;
  delivery_state: DeliveryState;
  tuning_days: number;
  go_live_date: string | null;
  tuning_closed_at: string | null;
}

interface PhaseLockRow {
  id: string;
  kind: MilestoneKind;
  phase_key: string | null;
  status: MilestoneStatus;
  requires_gate: boolean;
  gate_decision: string | null;
  start_date: string | null;
  due_date: string | null;
}

interface SummaryRow {
  id: string;
  go_live_date: string | null;
  tuning_days: number;
  tuning_closed_at: string | null;
  scale_id: string | null;
  handover_total: number;
  handover_done: number;
}

async function lockProject(projectId: string, q: Queryable): Promise<ProjectLockRow> {
  const row = await q.queryOne<ProjectLockRow>(
    `SELECT id, delivery_state, tuning_days, go_live_date, tuning_closed_at
       FROM projects WHERE id = $1 FOR NO KEY UPDATE`,
    [projectId],
  );
  if (!row) throw new Error(GOLIVE_ERRORS.projectNotFound);
  return row;
}

/** The go-live milestone and the handover (scale) phase of a project, locked, first by position. */
async function lockLaunchPhases(
  projectId: string,
  q: Queryable,
): Promise<{ goLive: PhaseLockRow | null; scale: PhaseLockRow | null }> {
  const rows = await q.query<PhaseLockRow>(
    `SELECT id, kind, phase_key, status, requires_gate, gate_decision, start_date, due_date
       FROM milestones
      WHERE project_id = $1 AND phase_key = ANY($2::text[])
      ORDER BY position ASC, created_at ASC
      FOR NO KEY UPDATE`,
    [projectId, [GO_LIVE_PHASE_KEY, HANDOVER_PHASE_KEY]],
  );
  return {
    goLive: rows.find((row) => row.phase_key === GO_LIVE_PHASE_KEY) ?? null,
    scale: rows.find((row) => row.phase_key === HANDOVER_PHASE_KEY && row.kind === "phase") ?? null,
  };
}

async function otherPhaseInProgress(projectId: string, exceptId: string, q: Queryable): Promise<boolean> {
  const row = await q.queryOne<{ id: string }>(
    `SELECT id FROM milestones
      WHERE project_id = $1 AND kind = 'phase' AND status IN ('active', 'gate_review') AND id <> $2
      LIMIT 1`,
    [projectId, exceptId],
  );
  return row !== null;
}

async function reload(projectId: string, options: ProjectQueryOptions): Promise<Project> {
  const project = await getProject(projectId, options);
  if (!project) throw new Error(GOLIVE_ERRORS.projectNotFound);
  return project;
}

/**
 * Go-live countdown and handover progress of a project. The handover
 * checklist is the non-cancelled deliverables of the `scale` phase.
 */
export async function getGoLiveSummary(projectId: string, today: string): Promise<GoLiveSummary> {
  const row = await db.queryOne<SummaryRow>(
    `SELECT p.id, p.go_live_date, p.tuning_days, p.tuning_closed_at, s.id AS scale_id,
            COALESCE(h.total, 0)::int AS handover_total, COALESCE(h.done, 0)::int AS handover_done
       FROM projects p
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
      WHERE p.id = $1`,
    [projectId, HANDOVER_PHASE_KEY],
  );
  if (!row) throw new Error(GOLIVE_ERRORS.projectNotFound);

  const end = tuningEndDate(row.go_live_date, row.tuning_days);
  const daysLeft = end ? diffDaysISO(today, end) : null;
  const open = row.go_live_date !== null && row.tuning_closed_at === null;
  return {
    project_id: row.id,
    go_live_date: row.go_live_date,
    tuning_days: row.tuning_days,
    tuning_end_date: end,
    days_elapsed: row.go_live_date ? diffDaysISO(row.go_live_date, today) : null,
    days_left: daysLeft,
    tuning_closed_at: row.tuning_closed_at,
    handover_total: row.handover_total,
    handover_done: row.handover_done,
    scale_milestone_id: row.scale_id,
    can_propose_retainer: open && daysLeft !== null && daysLeft <= TUNING_ALERT_DAYS,
  };
}

/**
 * Sets or clears the go-live date in one transaction.
 *
 * With a date: `go_live_date` (and `tuning_days` only when given),
 * `delivery_state = 'production'` unless already `handed_over`; the
 * `go_live` milestone (if any, and not stopped or waiting on a gate) becomes
 * done with `due_date = date`; a `planned` `scale` phase gets
 * `start_date = date`, `due_date = date + max(tuning_days, 1) - 1` and becomes
 * active (it stays planned while another phase is still in progress, so the
 * project never has two current phases; that phase's Go activates it).
 * Progress is recomputed.
 *
 * With null: clears `go_live_date` and moves `production` back to `pilot`;
 * milestones are left as they are.
 *
 * Returns the project stripped unless includeCommercial.
 */
export async function setGoLiveDate(
  projectId: string,
  date: string | null,
  tuningDays?: number,
  options: ProjectQueryOptions = {},
): Promise<Project> {
  if (tuningDays !== undefined && (!Number.isInteger(tuningDays) || tuningDays < 0 || tuningDays > MAX_TUNING_DAYS)) {
    throw new Error(GOLIVE_ERRORS.tuningDays);
  }
  const now = nowISO();

  await transaction(async (tx) => {
    const project = await lockProject(projectId, tx);

    if (date === null) {
      await tx.execute(
        `UPDATE projects
            SET go_live_date = NULL,
                delivery_state = CASE WHEN delivery_state = 'production' THEN 'pilot' ELSE delivery_state END,
                tuning_days = COALESCE($2::int, tuning_days),
                updated_at = $3
          WHERE id = $1`,
        [project.id, tuningDays ?? null, now],
      );
      return;
    }

    const days = tuningDays ?? project.tuning_days;
    await tx.execute(
      `UPDATE projects
          SET go_live_date = $2,
              tuning_days = $3,
              delivery_state = CASE WHEN delivery_state = 'handed_over' THEN delivery_state ELSE 'production' END,
              updated_at = $4
        WHERE id = $1`,
      [project.id, date, days, now],
    );

    const { goLive, scale } = await lockLaunchPhases(project.id, tx);
    let phasesChanged = false;

    if (goLive && goLive.status !== "stopped" && (!goLive.requires_gate || goLive.gate_decision === "go")) {
      await tx.execute(
        `UPDATE milestones
            SET status = 'done',
                due_date = $2,
                start_date = CASE WHEN start_date IS NOT NULL AND start_date > $2 THEN $2 ELSE start_date END,
                completed_at = CASE WHEN status = 'done' AND completed_at IS NOT NULL THEN completed_at ELSE $3 END,
                updated_at = $3
          WHERE id = $1`,
        [goLive.id, date, now],
      );
      phasesChanged = phasesChanged || goLive.status !== "done";
    }

    if (scale && scale.status === "planned") {
      const busy = await otherPhaseInProgress(project.id, scale.id, tx);
      await tx.execute(
        `UPDATE milestones
            SET start_date = $2, due_date = $3, status = $4, updated_at = $5
          WHERE id = $1`,
        [scale.id, date, addDaysISO(date, Math.max(days, 1) - 1), busy ? "planned" : "active", now],
      );
      phasesChanged = phasesChanged || !busy;
    }

    if (phasesChanged) await recomputeProjectProgress(project.id, tx);
  });

  return reload(projectId, options);
}

/**
 * Closes the tuning window: `tuning_closed_at = now`, `delivery_state =
 * 'handed_over'`. An active, ungated handover (scale) phase is completed with
 * it (and the next planned phase, if any, starts). The action checks the
 * handover checklist first. Returns the project stripped unless includeCommercial.
 */
export async function closeTuning(projectId: string, options: ProjectQueryOptions = {}): Promise<Project> {
  const now = nowISO();

  await transaction(async (tx) => {
    const project = await lockProject(projectId, tx);
    if (!project.go_live_date) throw new Error(GOLIVE_ERRORS.needsGoLive);
    if (project.tuning_closed_at) throw new Error(GOLIVE_ERRORS.alreadyClosed);

    const closed = await tx.execute(
      `UPDATE projects
          SET tuning_closed_at = $2, delivery_state = 'handed_over', updated_at = $2
        WHERE id = $1 AND tuning_closed_at IS NULL`,
      [project.id, now],
    );
    if (closed === 0) throw new Error(GOLIVE_ERRORS.alreadyClosed);

    const { scale } = await lockLaunchPhases(project.id, tx);
    if (scale && scale.status === "active" && !scale.requires_gate) {
      await tx.execute(
        "UPDATE milestones SET status = 'done', completed_at = $2, updated_at = $2 WHERE id = $1 AND status = 'active'",
        [scale.id, now],
      );
      if (!(await otherPhaseInProgress(project.id, scale.id, tx))) await activateNextPhase(project.id, tx, options);
      await recomputeProjectProgress(project.id, tx);
    }
  });

  return reload(projectId, options);
}
