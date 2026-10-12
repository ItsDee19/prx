"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { MILESTONE_KIND_CONFIG, MILESTONE_STATUS_CONFIG } from "@/lib/constants";
import { logActivity } from "@/lib/data/activity";
import { notifyGateReviewRequested, notifySafely } from "@/lib/data/notifications";
import {
  MILESTONE_ERRORS,
  createMilestone,
  deleteMilestone,
  getMilestone,
  listDeliverables,
  listGateHistory,
  listMilestoneRefs,
  listMilestones,
  reorderMilestones,
  requestGateReview,
  updateMilestone,
} from "@/lib/data/milestones";
import { getProject } from "@/lib/data/projects";
import {
  createMilestoneSchema,
  milestoneIdSchema,
  milestoneStatusSchema,
  reorderMilestonesSchema,
  updateMilestoneSchema,
  type UpdateMilestoneSchemaInput,
} from "@/lib/schemas/milestones";
import type {
  Activity,
  ActionResult,
  CreateMilestoneInput,
  GateRequestedMeta,
  Milestone,
  MilestoneKind,
  MilestoneRef,
  MilestoneStatus,
  MilestoneWithMeta,
  TaskWithMeta,
  UpdateMilestoneInput,
  User,
} from "@/lib/types";
import { fieldErrorsFromIssues } from "@/lib/validation";

const FIX_FIELDS = "Please fix the highlighted fields.";
const COMMERCIAL_ONLY = "Only admins can change commercial fields.";
const NOT_FOUND = "This phase no longer exists.";
const PROJECT_NOT_FOUND = "This project no longer exists.";
const GATE_STOP_REOPEN = "Only an admin or the project owner can reopen a phase stopped at its gate.";
const GATE_CHANGE = "Only an admin or the project owner can change a phase's gate.";

/** Admin-only milestone keys (SPEC.md section 18, commercial rule). */
const COMMERCIAL_KEYS = ["price", "invoice_status"] as const;

/** Data-layer messages that are safe (and useful) to show as they are. */
const USER_FACING_ERRORS: ReadonlySet<string> = new Set(Object.values(MILESTONE_ERRORS));

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

/** True when the raw input carries any admin-only key, even with a null value. */
function hasCommercialKeys(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  return COMMERCIAL_KEYS.some((key) => Object.prototype.hasOwnProperty.call(input, key));
}

/** A phase closed by a Stop gate decision (decideGate). */
function isGateStopped(milestone: Milestone): boolean {
  return milestone.status === "stopped" && milestone.gate_decision === "stop";
}

/**
 * Moving a phase out of a Stop gate decision overrides that decision, and
 * removing a gate skips one, so both are reserved to whoever can decide gates:
 * an admin or the project owner.
 */
async function canOverrideGateStop(user: User, milestone: Milestone): Promise<boolean> {
  if (isAdmin(user)) return true;
  const project = await getProject(milestone.project_id);
  return project !== null && project.owner_id === user.id;
}

/**
 * True when a patch changes a phase's gate in a way only a gate decider (admin
 * or project owner) may: removing a gate (unticking it or turning the phase
 * into a point milestone), or adding one to a phase that is active, in gate
 * review or already decided. Otherwise a member could skip a go/no-go gate.
 */
function isGuardedGateChange(existing: Milestone, patch: UpdateMilestoneInput): boolean {
  const kind = patch.kind ?? existing.kind;
  const requiresGate = kind === "phase" && (patch.requires_gate ?? existing.requires_gate);
  if (requiresGate === existing.requires_gate) return false;
  if (existing.requires_gate) return true;
  return existing.status === "active" || existing.status === "gate_review" || existing.gate_decision !== null;
}

function kindNoun(kind: MilestoneKind): string {
  return MILESTONE_KIND_CONFIG[kind].label.toLowerCase();
}

function statusLabel(status: MilestoneStatus): string {
  return MILESTONE_STATUS_CONFIG[status].label;
}

function humanList(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** Copies only the keys UpdateMilestoneInput allows from the parsed data. */
function toUpdatePatch(data: UpdateMilestoneSchemaInput): UpdateMilestoneInput {
  const patch: UpdateMilestoneInput = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description;
  if (data.kind !== undefined) patch.kind = data.kind;
  if (data.phase_key !== undefined) patch.phase_key = data.phase_key;
  if (data.start_date !== undefined) patch.start_date = data.start_date;
  if (data.due_date !== undefined) patch.due_date = data.due_date;
  if (data.status !== undefined) patch.status = data.status;
  if (data.requires_gate !== undefined) patch.requires_gate = data.requires_gate;
  if (data.price !== undefined) patch.price = data.price;
  if (data.invoice_status !== undefined) patch.invoice_status = data.invoice_status;
  if (data.gate_notes !== undefined) patch.gate_notes = data.gate_notes;
  if (data.client_signoff_name !== undefined) patch.client_signoff_name = data.client_signoff_name;
  if (data.client_signoff_date !== undefined) patch.client_signoff_date = data.client_signoff_date;
  if (data.evidence_url !== undefined) patch.evidence_url = data.evidence_url;
  return patch;
}

function same(a: string | number | boolean | null | undefined, b: string | number | boolean | null | undefined): boolean {
  const norm = (value: string | number | boolean | null | undefined) =>
    value === undefined || value === "" ? null : typeof value === "string" ? value.trim() : value;
  return norm(a) === norm(b);
}

/** Labels of what a patch changes ("dates", "the gate", ...); never amounts. */
function changedLabels(existing: Milestone, patch: UpdateMilestoneInput): string[] {
  const labels: string[] = [];
  if (patch.description !== undefined && !same(patch.description, existing.description)) labels.push("description");
  if (patch.kind !== undefined && patch.kind !== existing.kind) labels.push("kind");
  if (
    (patch.start_date !== undefined && !same(patch.start_date, existing.start_date)) ||
    (patch.due_date !== undefined && !same(patch.due_date, existing.due_date))
  ) {
    labels.push("dates");
  }
  if (patch.requires_gate !== undefined && patch.requires_gate !== existing.requires_gate) labels.push("gate");
  if (patch.phase_key !== undefined && !same(patch.phase_key, existing.phase_key)) labels.push("phase key");
  if (patch.gate_notes !== undefined && !same(patch.gate_notes, existing.gate_notes)) labels.push("gate notes");
  if (
    (patch.client_signoff_name !== undefined && !same(patch.client_signoff_name, existing.client_signoff_name)) ||
    (patch.client_signoff_date !== undefined && !same(patch.client_signoff_date, existing.client_signoff_date))
  ) {
    labels.push("client sign-off");
  }
  if (patch.evidence_url !== undefined && !same(patch.evidence_url, existing.evidence_url)) labels.push("evidence link");
  if (
    (patch.price !== undefined && !same(patch.price, existing.price)) ||
    (patch.invoice_status !== undefined && patch.invoice_status !== existing.invoice_status)
  ) {
    labels.push("commercial terms");
  }
  return labels;
}

/** Name of the phase that became active during the write (status planned -> active), if any. */
function newlyActive(before: MilestoneWithMeta[], after: MilestoneWithMeta[], excludeId: string): string | null {
  const previous = new Map(before.map((m) => [m.id, m.status]));
  const started = after.find(
    (m) => m.id !== excludeId && m.status === "active" && previous.get(m.id) === "planned",
  );
  return started ? started.name : null;
}

/** One activity row for a milestone change (completed / status move / edit). */
async function logMilestoneChange(input: {
  actorId: string;
  before: Milestone;
  after: Milestone;
  patch: UpdateMilestoneInput;
  startedNext: string | null;
}): Promise<void> {
  const { actorId, before, after, patch, startedNext } = input;
  const noun = kindNoun(after.kind);
  const statusChanged = before.status !== after.status;
  const renamed = patch.name !== undefined && !same(patch.name, before.name);
  const others = changedLabels(before, patch);

  if (statusChanged && after.status === "done") {
    await logActivity({
      project_id: after.project_id,
      actor_id: actorId,
      type: "milestone_completed",
      message: startedNext
        ? `completed ${noun} "${after.name}" and started "${startedNext}"`
        : `completed ${noun} "${after.name}"`,
      meta: { milestone_id: after.id, milestone_name: after.name, from: before.status, to: after.status },
    });
    return;
  }
  if (!statusChanged && !renamed && others.length === 0) return;

  let message: string;
  if (statusChanged && !renamed && others.length === 0) {
    message = `moved ${noun} "${after.name}" to ${statusLabel(after.status)}`;
  } else if (renamed && !statusChanged && others.length === 0) {
    message = `renamed ${noun} "${before.name}" to "${after.name}"`;
  } else {
    const parts = [...(renamed ? ["name"] : []), ...(statusChanged ? ["status"] : []), ...others];
    message = `updated the ${humanList(parts)} of ${noun} "${after.name}"`;
  }
  await logActivity({
    project_id: after.project_id,
    actor_id: actorId,
    type: "milestone_updated",
    message,
    meta: {
      milestone_id: after.id,
      milestone_name: after.name,
      ...(statusChanged ? { from: before.status, to: after.status } : {}),
    },
  });
}

/* -------------------------------- Actions -------------------------------- */

export async function createMilestoneAction(input: CreateMilestoneInput): Promise<ActionResult<Milestone>> {
  const user = await requireUser();
  if (!isAdmin(user) && hasCommercialKeys(input)) return { ok: false, error: COMMERCIAL_ONLY };
  const parsed = createMilestoneSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));
  const data = parsed.data;

  try {
    const milestone = await createMilestone(
      {
        project_id: data.project_id,
        name: data.name,
        description: data.description,
        kind: data.kind,
        phase_key: data.phase_key,
        start_date: data.start_date,
        due_date: data.due_date,
        status: data.status,
        requires_gate: data.requires_gate,
        price: data.price,
        invoice_status: data.invoice_status,
      },
      { includeCommercial: isAdmin(user) },
    );
    await logActivity({
      project_id: milestone.project_id,
      actor_id: user.id,
      type: "milestone_created",
      message: `added ${kindNoun(milestone.kind)} "${milestone.name}"`,
      meta: { milestone_id: milestone.id, milestone_name: milestone.name, kind: milestone.kind },
    });
    revalidate();
    return { ok: true, data: milestone };
  } catch (error) {
    return failure(error, "Could not add the phase. Please try again.");
  }
}

export async function updateMilestoneAction(
  id: string,
  input: UpdateMilestoneInput,
): Promise<ActionResult<Milestone>> {
  const user = await requireUser();
  if (!isAdmin(user) && hasCommercialKeys(input)) return { ok: false, error: COMMERCIAL_ONLY };
  const idParsed = milestoneIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: NOT_FOUND };
  const parsed = updateMilestoneSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));

  try {
    const options = { includeCommercial: isAdmin(user) };
    const existing = await getMilestone(idParsed.data, options);
    if (!existing) return { ok: false, error: NOT_FOUND };
    const patch = toUpdatePatch(parsed.data);
    if (
      patch.status !== undefined &&
      patch.status !== existing.status &&
      isGateStopped(existing) &&
      !(await canOverrideGateStop(user, existing))
    ) {
      return { ok: false, error: GATE_STOP_REOPEN };
    }
    if (isGuardedGateChange(existing, patch) && !(await canOverrideGateStop(user, existing))) {
      return { ok: false, error: GATE_CHANGE };
    }

    const becomesDone = patch.status === "done" && existing.status !== "done";
    const before = becomesDone ? await listMilestones(existing.project_id) : [];
    const updated = await updateMilestone(existing.id, patch, options);
    const startedNext = becomesDone
      ? newlyActive(before, await listMilestones(existing.project_id), existing.id)
      : null;

    await logMilestoneChange({ actorId: user.id, before: existing, after: updated, patch, startedNext });
    revalidate();
    return { ok: true, data: updated };
  } catch (error) {
    return failure(error, "Could not save the phase. Please try again.");
  }
}

export async function setMilestoneStatusAction(
  id: string,
  status: MilestoneStatus,
): Promise<ActionResult<Milestone>> {
  const user = await requireUser();
  const idParsed = milestoneIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: NOT_FOUND };
  const parsed = milestoneStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Choose a valid status." };

  try {
    const options = { includeCommercial: isAdmin(user) };
    const existing = await getMilestone(idParsed.data, options);
    if (!existing) return { ok: false, error: NOT_FOUND };
    if (existing.status === parsed.data) return { ok: true, data: existing };
    if (isGateStopped(existing) && !(await canOverrideGateStop(user, existing))) {
      return { ok: false, error: GATE_STOP_REOPEN };
    }

    const patch: UpdateMilestoneInput = { status: parsed.data };
    const becomesDone = parsed.data === "done";
    const before = becomesDone ? await listMilestones(existing.project_id) : [];
    const updated = await updateMilestone(existing.id, patch, options);
    const startedNext = becomesDone
      ? newlyActive(before, await listMilestones(existing.project_id), existing.id)
      : null;

    await logMilestoneChange({ actorId: user.id, before: existing, after: updated, patch, startedNext });
    revalidate();
    return { ok: true, data: updated };
  } catch (error) {
    return failure(error, "Could not change the phase status. Please try again.");
  }
}

export async function deleteMilestoneAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = milestoneIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: NOT_FOUND };

  try {
    const existing = await getMilestone(idParsed.data);
    if (!existing) return { ok: false, error: NOT_FOUND };
    const project = await getProject(existing.project_id);
    if (!project) return { ok: false, error: PROJECT_NOT_FOUND };
    if (!isAdmin(user) && project.owner_id !== user.id) {
      return { ok: false, error: "Only an admin or the project owner can delete phases." };
    }

    const deleted = await deleteMilestone(existing.id);
    await logActivity({
      project_id: deleted.project_id,
      actor_id: user.id,
      type: "milestone_deleted",
      message: `deleted ${kindNoun(existing.kind)} "${deleted.name}"`,
      meta: { milestone_id: existing.id, milestone_name: deleted.name, kind: existing.kind },
    });
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not delete the phase. Please try again.");
  }
}

export async function reorderMilestonesAction(projectId: string, orderedIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = reorderMilestonesSchema.safeParse({ projectId, orderedIds });
  if (!parsed.success) return { ok: false, error: "Invalid order." };

  try {
    const project = await getProject(parsed.data.projectId);
    if (!project) return { ok: false, error: PROJECT_NOT_FOUND };
    const before = (await listMilestoneRefs(project.id)).map((m) => m.id);
    await reorderMilestones(project.id, parsed.data.orderedIds);
    const after = (await listMilestoneRefs(project.id)).map((m) => m.id);

    if (before.join("|") !== after.join("|")) {
      await logActivity({
        project_id: project.id,
        actor_id: user.id,
        type: "milestones_reordered",
        message: "reordered the phases",
        meta: { order: after },
      });
    }
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not reorder the phases. Please try again.");
  }
}

export async function requestGateReviewAction(id: string): Promise<ActionResult<Milestone>> {
  const user = await requireUser();
  const idParsed = milestoneIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: NOT_FOUND };

  try {
    const options = { includeCommercial: isAdmin(user) };
    const existing = await getMilestone(idParsed.data, options);
    if (!existing) return { ok: false, error: NOT_FOUND };

    const milestone = await requestGateReview(existing.id, options);
    const meta: GateRequestedMeta = { milestone_id: milestone.id, milestone_name: milestone.name };
    await logActivity({
      project_id: milestone.project_id,
      actor_id: user.id,
      type: "gate_requested",
      message: `requested a gate review for "${milestone.name}"`,
      meta: { ...meta },
    });
    await notifySafely("requestGateReviewAction", () => notifyGateReviewRequested(milestone, user));
    revalidate();
    return { ok: true, data: milestone };
  } catch (error) {
    return failure(error, "Could not request the gate review. Please try again.");
  }
}

export async function getMilestonePanelAction(id: string): Promise<
  ActionResult<{ milestone: MilestoneWithMeta; deliverables: TaskWithMeta[]; gate_history: Activity[] }>
> {
  const user = await requireUser();
  const idParsed = milestoneIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: NOT_FOUND };

  try {
    const [milestone, deliverables, gateHistory] = await Promise.all([
      getMilestone(idParsed.data, { includeCommercial: isAdmin(user) }),
      listDeliverables(idParsed.data),
      listGateHistory(idParsed.data),
    ]);
    if (!milestone) return { ok: false, error: NOT_FOUND };
    return { ok: true, data: { milestone, deliverables, gate_history: gateHistory } };
  } catch (error) {
    return failure(error, "Could not load the phase. Please try again.");
  }
}

export async function listMilestoneRefsAction(projectId: string): Promise<ActionResult<MilestoneRef[]>> {
  await requireUser();
  const parsed = milestoneIdSchema.safeParse(projectId);
  if (!parsed.success) return { ok: false, error: PROJECT_NOT_FOUND };

  try {
    return { ok: true, data: await listMilestoneRefs(parsed.data) };
  } catch (error) {
    return failure(error, "Could not load the phases. Please try again.");
  }
}
