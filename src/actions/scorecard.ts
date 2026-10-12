"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { GATE_DECISION_CONFIG } from "@/lib/constants";
import { logActivity } from "@/lib/data/activity";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { MILESTONE_ERRORS, getMilestone } from "@/lib/data/milestones";
import { notifySafely, notifyWatchers, projectNotificationUrl } from "@/lib/data/notifications";
import { getProject, getProjectSummary } from "@/lib/data/projects";
import {
  SCORECARD_ERRORS,
  createMetric,
  decideGate,
  deleteMetric,
  getGateReview,
  getMetric,
  listMetrics,
  lockMetrics,
  reorderMetrics,
  snapshotMetrics,
  updateMetric,
  type GateDecisionRequest,
  type GateReview,
} from "@/lib/data/scorecard";
import {
  createMetricSchema,
  gateDecisionSchema,
  metricIdSchema,
  reorderMetricsSchema,
  scorecardProjectIdSchema,
  updateMetricSchema,
} from "@/lib/schemas/scorecard";
import type {
  ActionResult,
  CreateMetricInput,
  GateDecidedMeta,
  Milestone,
  SuccessMetric,
  UpdateMetricInput,
  User,
} from "@/lib/types";
import { formatDate, formatMetricValue } from "@/lib/utils";
import { fieldErrorsFromIssues } from "@/lib/validation";

const FIX_FIELDS = "Please fix the highlighted fields.";
const METRIC_NOT_FOUND = "This metric no longer exists.";
const PROJECT_NOT_FOUND = "This project no longer exists.";
const PHASE_NOT_FOUND = "This phase no longer exists.";
const DECIDE_FORBIDDEN = "Only an admin or the project owner can decide a gate.";
const EXTEND_DATE_PAST = "The new due date cannot be in the past.";

/** Data-layer messages that are safe (and useful) to show as they are. */
const USER_FACING_ERRORS: ReadonlySet<string> = new Set<string>([
  ...Object.values(SCORECARD_ERRORS),
  ...Object.values(MILESTONE_ERRORS),
]);

function revalidate(): void {
  revalidatePath("/", "layout");
}

function isAdmin(user: User): boolean {
  return user.role === "admin";
}

function validationFailure(fieldErrors: Record<string, string>): ActionResult<never> {
  const messages = Object.values(fieldErrors);
  return { ok: false, error: messages.length === 1 ? messages[0] : FIX_FIELDS, fieldErrors };
}

function failure(error: unknown, message: string): ActionResult<never> {
  if (error instanceof Error && USER_FACING_ERRORS.has(error.message)) {
    return { ok: false, error: error.message };
  }
  console.error(message, error);
  return { ok: false, error: message };
}

/** Which goal fields a patch changes ("baseline", "target", "direction"), for the activity message. */
function goalChanges(before: SuccessMetric, after: SuccessMetric): string[] {
  const fields: string[] = [];
  if (before.baseline !== after.baseline) fields.push("baseline");
  if (before.target !== after.target) fields.push("target");
  if (before.direction !== after.direction) fields.push("direction");
  return fields;
}

function humanList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* -------------------------------- Metrics -------------------------------- */

export async function createMetricAction(input: CreateMetricInput): Promise<ActionResult<SuccessMetric>> {
  const user = await requireUser();
  const parsed = createMetricSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));
  const data = parsed.data;

  try {
    const project = await getProjectSummary(data.project_id);
    if (!project) return { ok: false, error: PROJECT_NOT_FOUND };
    const metric = await createMetric({
      project_id: project.id,
      name: data.name,
      unit: data.unit,
      direction: data.direction,
      baseline: data.baseline,
      target: data.target,
      current: data.current,
      notes: data.notes,
    });
    await logActivity({
      project_id: metric.project_id,
      actor_id: user.id,
      type: "metric_added",
      message: `added metric "${metric.name}" to the scorecard`,
      meta: { metric_id: metric.id, metric_name: metric.name },
    });
    revalidate();
    return { ok: true, data: metric };
  } catch (error) {
    return failure(error, "Could not add the metric. Please try again.");
  }
}

export async function updateMetricAction(id: string, input: UpdateMetricInput): Promise<ActionResult<SuccessMetric>> {
  const user = await requireUser();
  const idParsed = metricIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: METRIC_NOT_FOUND };
  const parsed = updateMetricSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));
  const data = parsed.data;

  try {
    const existing = await getMetric(idParsed.data);
    if (!existing) return { ok: false, error: METRIC_NOT_FOUND };
    const patch: UpdateMetricInput = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.unit !== undefined) patch.unit = data.unit;
    if (data.direction !== undefined) patch.direction = data.direction;
    if (data.baseline !== undefined) patch.baseline = data.baseline;
    if (data.target !== undefined) patch.target = data.target;
    if (data.current !== undefined) patch.current = data.current;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.reason !== undefined) patch.reason = data.reason;

    const { metric, changed_after_lock: changedAfterLock } = await updateMetric(existing.id, patch);
    if (metric.updated_at !== existing.updated_at) {
      const goals = goalChanges(existing, metric);
      const changes: Record<string, { from: number | string | null; to: number | string | null }> = {};
      if (existing.baseline !== metric.baseline) changes.baseline = { from: existing.baseline, to: metric.baseline };
      if (existing.target !== metric.target) changes.target = { from: existing.target, to: metric.target };
      if (existing.direction !== metric.direction) changes.direction = { from: existing.direction, to: metric.direction };
      if (existing.current !== metric.current) changes.current = { from: existing.current, to: metric.current };

      if (changedAfterLock) {
        const reason = (data.reason ?? "").trim();
        await logActivity({
          project_id: metric.project_id,
          actor_id: user.id,
          type: "metric_changed_after_lock",
          message: `changed the ${humanList(goals)} of "${metric.name}" after the scorecard was locked: ${reason}`,
          meta: { metric_id: metric.id, metric_name: metric.name, reason, fields: goals, changes },
        });
      } else {
        const currentOnly = Object.keys(changes).length === 1 && changes.current !== undefined && existing.name === metric.name;
        await logActivity({
          project_id: metric.project_id,
          actor_id: user.id,
          type: "metric_updated",
          message: currentOnly
            ? `updated "${metric.name}" to ${formatMetricValue(metric.current, metric.unit)}`
            : existing.name !== metric.name
              ? `renamed metric "${existing.name}" to "${metric.name}"`
              : `updated metric "${metric.name}"`,
          meta: { metric_id: metric.id, metric_name: metric.name, changes },
        });
      }
      revalidate();
    }
    return { ok: true, data: metric };
  } catch (error) {
    return failure(error, "Could not update the metric. Please try again.");
  }
}

export async function deleteMetricAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = metricIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: METRIC_NOT_FOUND };

  try {
    const deleted = await deleteMetric(idParsed.data);
    await logActivity({
      project_id: deleted.project_id,
      actor_id: user.id,
      type: "metric_deleted",
      message: `removed metric "${deleted.name}" from the scorecard`,
      meta: { metric_id: idParsed.data, metric_name: deleted.name },
    });
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not delete the metric. Please try again.");
  }
}

/** Ordering only: no activity (SPEC §23.1). */
export async function reorderMetricsAction(projectId: string, orderedIds: string[]): Promise<ActionResult> {
  await requireUser();
  const parsed = reorderMetricsSchema.safeParse({ projectId, orderedIds });
  if (!parsed.success) return { ok: false, error: "Could not reorder the metrics." };

  try {
    await reorderMetrics(parsed.data.projectId, parsed.data.orderedIds);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not reorder the metrics. Please try again.");
  }
}

export async function lockMetricsAction(projectId: string): Promise<ActionResult<number>> {
  const user = await requireUser();
  const parsed = scorecardProjectIdSchema.safeParse(projectId);
  if (!parsed.success) return { ok: false, error: PROJECT_NOT_FOUND };

  try {
    const project = await getProjectSummary(parsed.data);
    if (!project) return { ok: false, error: PROJECT_NOT_FOUND };
    const locked = await lockMetrics(project.id);
    if (locked > 0) {
      await logActivity({
        project_id: project.id,
        actor_id: user.id,
        type: "metrics_locked",
        message: `locked the scorecard (${locked} ${locked === 1 ? "metric" : "metrics"})`,
        meta: { count: locked },
      });
      revalidate();
    }
    return { ok: true, data: locked };
  } catch (error) {
    return failure(error, "Could not lock the scorecard. Please try again.");
  }
}

/* --------------------------------- Gates --------------------------------- */

export async function getGateReviewAction(milestoneId: string): Promise<ActionResult<GateReview>> {
  const user = await requireUser();
  const idParsed = metricIdSchema.safeParse(milestoneId);
  if (!idParsed.success) return { ok: false, error: PHASE_NOT_FOUND };

  try {
    const review = await getGateReview(idParsed.data, { includeCommercial: isAdmin(user) });
    if (!review) return { ok: false, error: PHASE_NOT_FOUND };
    return { ok: true, data: review };
  } catch (error) {
    return failure(error, "Could not load the gate review. Please try again.");
  }
}

/**
 * Admin or project owner. Records Go / Extend once / Stop, logs `gate_decided`
 * (meta: GateDecidedMeta with the milestone id, plus notes and conditions)
 * and notifies the project's owner, members and watchers.
 */
export async function decideGateAction(
  milestoneId: string,
  input: GateDecisionRequest,
): Promise<ActionResult<{ milestone: Milestone; next_phase: Milestone | null }>> {
  const user = await requireUser();
  const idParsed = metricIdSchema.safeParse(milestoneId);
  if (!idParsed.success) return { ok: false, error: PHASE_NOT_FOUND };
  const parsed = gateDecisionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));
  const data = parsed.data;

  try {
    const options = { includeCommercial: isAdmin(user) };
    const existing = await getMilestone(idParsed.data, options);
    if (!existing) return { ok: false, error: PHASE_NOT_FOUND };
    const project = await getProject(existing.project_id);
    if (!project) return { ok: false, error: PROJECT_NOT_FOUND };
    if (!isAdmin(user) && project.owner_id !== user.id) return { ok: false, error: DECIDE_FORBIDDEN };

    if (data.decision === "extend" && data.new_due_date) {
      const today = await getWorkspaceToday();
      if (data.new_due_date < today) {
        return { ok: false, error: EXTEND_DATE_PAST, fieldErrors: { new_due_date: EXTEND_DATE_PAST } };
      }
    }

    const request: GateDecisionRequest = {
      decision: data.decision,
      notes: data.notes,
      conditions: data.decision === "go" ? data.conditions : undefined,
      fix_list: data.decision === "extend" ? data.fix_list : undefined,
      new_due_date: data.decision === "extend" ? (data.new_due_date ?? null) : null,
      client_signoff_name: data.client_signoff_name ?? null,
      client_signoff_date: data.client_signoff_date ?? null,
      evidence_url: data.evidence_url ?? null,
    };
    const result = await decideGate(existing.id, request, user.id, options);
    const { milestone, next_phase: nextPhase } = result;

    const metrics = snapshotMetrics(await listMetrics(project.id));
    const meta: GateDecidedMeta & { notes: string; conditions: string | null; next_phase_id: string | null } = {
      milestone_id: milestone.id,
      milestone_name: milestone.name,
      decision: data.decision,
      extend_count: milestone.extend_count,
      new_due_date: data.decision === "extend" ? milestone.due_date : null,
      fix_list: data.decision === "extend" ? (data.fix_list ?? "").trim() || null : null,
      metrics,
      signoff: { name: milestone.client_signoff_name, date: milestone.client_signoff_date },
      evidence_url: milestone.evidence_url,
      notes: data.notes.trim(),
      conditions: data.decision === "go" ? (data.conditions ?? "").trim() || null : null,
      next_phase_id: nextPhase ? nextPhase.id : null,
    };
    const label = GATE_DECISION_CONFIG[data.decision].label;
    const withConditions = meta.conditions ? " with conditions" : "";
    await logActivity({
      project_id: project.id,
      actor_id: user.id,
      type: "gate_decided",
      message: nextPhase
        ? `decided ${label}${withConditions} on "${milestone.name}" and started "${nextPhase.name}"`
        : `decided ${label}${withConditions} on "${milestone.name}"`,
      meta: { ...meta },
    });

    await notifySafely("decideGateAction", () =>
      notifyWatchers({
        entity: { type: "project", id: project.id },
        extraRecipients: [project.owner_id, ...project.members.map((member) => member.id)].filter(
          (value): value is string => value !== null,
        ),
        type: "gate_decided",
        actor_id: user.id,
        project_id: project.id,
        title: `${user.name} decided ${label}${withConditions} on ${milestone.name}`,
        body:
          data.decision === "go"
            ? nextPhase
              ? `${project.name} moves on to ${nextPhase.name}.`
              : `${project.name} passed the ${milestone.name} gate.`
            : data.decision === "extend"
              ? `${project.name}: ${milestone.name} is extended${milestone.due_date ? ` to ${formatDate(milestone.due_date)}` : ""}.`
              : `${project.name} stopped at the ${milestone.name} gate.`,
        url: projectNotificationUrl(project.id),
      }),
    );

    revalidate();
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "Could not record the gate decision. Please try again.");
  }
}
