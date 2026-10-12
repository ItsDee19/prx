"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { RISK_KIND_CONFIG, RISK_STATUS_CONFIG } from "@/lib/constants";
import { logActivity } from "@/lib/data/activity";
import { notify, notifySafely, projectNotificationUrl } from "@/lib/data/notifications";
import { getProject, getProjectSummary } from "@/lib/data/projects";
import {
  RISK_ERRORS,
  closeRisk,
  convertRiskToIssue,
  createRisk,
  deleteRisk,
  getRisk,
  updateRisk,
} from "@/lib/data/risks";
import { createRiskSchema, riskIdSchema, updateRiskSchema, type UpdateRiskSchemaInput } from "@/lib/schemas/risks";
import type { ActionResult, CreateRiskInput, Risk, RiskKind, UpdateRiskInput, User } from "@/lib/types";
import { riskScore, truncate } from "@/lib/utils";
import { fieldErrorsFromIssues } from "@/lib/validation";

const FIX_FIELDS = "Please fix the highlighted fields.";
const DELETE_NOT_ALLOWED = "Only the creator, the project owner or an admin can delete this item.";
const USER_FACING_ERRORS: ReadonlySet<string> = new Set(Object.values(RISK_ERRORS));

function revalidate(): void {
  revalidatePath("/", "layout");
}

function validationFailure(fieldErrors: Record<string, string>): ActionResult<never> {
  const messages = Object.values(fieldErrors);
  return { ok: false, error: messages.length === 1 ? messages[0] : FIX_FIELDS, fieldErrors };
}

function failure(error: unknown, message: string): ActionResult<never> {
  if (error instanceof Error && USER_FACING_ERRORS.has(error.message)) return { ok: false, error: error.message };
  console.error(message, error);
  return { ok: false, error: message };
}

function noun(kind: RiskKind): string {
  return RISK_KIND_CONFIG[kind].label.toLowerCase();
}

function quoted(title: string): string {
  return `"${truncate(title, 80)}"`;
}

function toPatch(data: UpdateRiskSchemaInput): UpdateRiskInput {
  const patch: UpdateRiskInput = {};
  if (data.kind !== undefined) patch.kind = data.kind;
  if (data.category !== undefined) patch.category = data.category;
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description;
  if (data.likelihood !== undefined) patch.likelihood = data.likelihood;
  if (data.impact !== undefined) patch.impact = data.impact;
  if (data.owner_id !== undefined) patch.owner_id = data.owner_id;
  if (data.mitigation !== undefined) patch.mitigation = data.mitigation;
  if (data.status !== undefined) patch.status = data.status;
  if (data.review_date !== undefined) patch.review_date = data.review_date;
  if (data.due_date !== undefined) patch.due_date = data.due_date;
  return patch;
}

/** Notifies `ownerId` (risk_assigned) unless they are the actor (notify drops the actor). */
async function notifyOwner(risk: Risk, actor: User, scope: string): Promise<void> {
  if (!risk.owner_id || risk.owner_id === actor.id) return;
  const ownerId = risk.owner_id;
  await notifySafely(scope, async () => {
    const project = await getProjectSummary(risk.project_id);
    const score = riskScore(risk.likelihood, risk.impact);
    await notify({
      recipients: [ownerId],
      type: "risk_assigned",
      actor_id: actor.id,
      project_id: risk.project_id,
      title: `${actor.name} made you the owner of ${noun(risk.kind)} ${quoted(risk.title)}`,
      body: [project?.name, score !== null ? `Score ${score}` : null].filter(Boolean).join(" · "),
      url: projectNotificationUrl(risk.project_id, { tab: "risks" }),
    });
  });
}

/** Labels of what an update changed (for the activity message). */
function changedParts(before: Risk, after: Risk): string[] {
  const parts: string[] = [];
  if (before.title !== after.title) parts.push("title");
  if (before.kind !== after.kind) parts.push("type");
  if (before.category !== after.category) parts.push("category");
  if (before.description !== after.description) parts.push("description");
  if (before.likelihood !== after.likelihood || before.impact !== after.impact) parts.push("score");
  if (before.owner_id !== after.owner_id) parts.push("owner");
  if (before.mitigation !== after.mitigation) parts.push("mitigation");
  if (before.review_date !== after.review_date || before.due_date !== after.due_date) parts.push("dates");
  return parts;
}

function humanList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Adds a RAID item. Member; logs risk_added; notifies the owner (risk_assigned). */
export async function createRiskAction(input: CreateRiskInput): Promise<ActionResult<Risk>> {
  const user = await requireUser();
  const parsed = createRiskSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));
  const data = parsed.data;

  try {
    const risk = await createRisk(
      {
        project_id: data.project_id,
        kind: data.kind,
        category: data.category,
        title: data.title,
        description: data.description,
        likelihood: data.likelihood ?? null,
        impact: data.impact ?? null,
        owner_id: data.owner_id ?? null,
        mitigation: data.mitigation,
        status: data.status,
        review_date: data.review_date ?? null,
        due_date: data.due_date ?? null,
      },
      user.id,
    );
    await logActivity({
      project_id: risk.project_id,
      actor_id: user.id,
      type: "risk_added",
      message: `added ${noun(risk.kind)} ${quoted(risk.title)}`,
      meta: { risk_id: risk.id, kind: risk.kind, score: riskScore(risk.likelihood, risk.impact) },
    });
    await notifyOwner(risk, user, "createRiskAction");
    revalidate();
    return { ok: true, data: risk };
  } catch (error) {
    return failure(error, "Could not add this item. Please try again.");
  }
}

/**
 * Edits a RAID item. Member. Logs risk_closed when it becomes closed, otherwise
 * risk_updated ("reopened ..." when it leaves closed); notifies a new owner.
 */
export async function updateRiskAction(id: string, input: UpdateRiskInput): Promise<ActionResult<Risk>> {
  const user = await requireUser();
  const idParsed = riskIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: RISK_ERRORS.notFound };
  const parsed = updateRiskSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));

  try {
    const before = await getRisk(idParsed.data);
    if (!before) return { ok: false, error: RISK_ERRORS.notFound };
    const after = await updateRisk(before.id, toPatch(parsed.data));
    const statusChanged = before.status !== after.status;
    const parts = changedParts(before, after);

    if (statusChanged && after.status === "closed") {
      await logActivity({
        project_id: after.project_id,
        actor_id: user.id,
        type: "risk_closed",
        message: `closed ${noun(after.kind)} ${quoted(after.title)}`,
        meta: { risk_id: after.id, from: before.status, to: after.status },
      });
    } else if (statusChanged || parts.length > 0) {
      let message: string;
      if (statusChanged && before.status === "closed") message = `reopened ${noun(after.kind)} ${quoted(after.title)}`;
      else if (statusChanged && parts.length === 0) {
        message = `moved ${noun(after.kind)} ${quoted(after.title)} to ${RISK_STATUS_CONFIG[after.status].label}`;
      } else {
        const all = statusChanged ? ["status", ...parts] : parts;
        message = `updated the ${humanList(all)} of ${noun(after.kind)} ${quoted(after.title)}`;
      }
      await logActivity({
        project_id: after.project_id,
        actor_id: user.id,
        type: "risk_updated",
        message,
        meta: {
          risk_id: after.id,
          ...(statusChanged ? { from: before.status, to: after.status } : {}),
          score: riskScore(after.likelihood, after.impact),
        },
      });
    }
    if (after.owner_id !== before.owner_id) await notifyOwner(after, user, "updateRiskAction");
    revalidate();
    return { ok: true, data: after };
  } catch (error) {
    return failure(error, "Could not save this item. Please try again.");
  }
}

/** A risk that materialised becomes an open issue. Member; logs risk_converted. */
export async function convertRiskToIssueAction(id: string): Promise<ActionResult<Risk>> {
  const user = await requireUser();
  const idParsed = riskIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: RISK_ERRORS.notFound };

  try {
    const before = await getRisk(idParsed.data);
    if (!before) return { ok: false, error: RISK_ERRORS.notFound };
    const risk = await convertRiskToIssue(before.id);
    await logActivity({
      project_id: risk.project_id,
      actor_id: user.id,
      type: "risk_converted",
      message: `converted ${noun(before.kind)} ${quoted(risk.title)} to an issue`,
      meta: { risk_id: risk.id, from_kind: before.kind, to_kind: risk.kind },
    });
    revalidate();
    return { ok: true, data: risk };
  } catch (error) {
    return failure(error, "Could not convert this item. Please try again.");
  }
}

/** Closes a RAID item. Member; logs risk_closed (nothing when it was already closed). */
export async function closeRiskAction(id: string): Promise<ActionResult<Risk>> {
  const user = await requireUser();
  const idParsed = riskIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: RISK_ERRORS.notFound };

  try {
    const before = await getRisk(idParsed.data);
    if (!before) return { ok: false, error: RISK_ERRORS.notFound };
    const risk = await closeRisk(before.id);
    if (before.status !== "closed") {
      await logActivity({
        project_id: risk.project_id,
        actor_id: user.id,
        type: "risk_closed",
        message: `closed ${noun(risk.kind)} ${quoted(risk.title)}`,
        meta: { risk_id: risk.id, from: before.status, to: risk.status },
      });
    }
    revalidate();
    return { ok: true, data: risk };
  } catch (error) {
    return failure(error, "Could not close this item. Please try again.");
  }
}

/** Deletes a RAID item. Creator, admin or project owner; logs risk_deleted. */
export async function deleteRiskAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = riskIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: RISK_ERRORS.notFound };

  try {
    const risk = await getRisk(idParsed.data);
    if (!risk) return { ok: false, error: RISK_ERRORS.notFound };
    let allowed = user.role === "admin" || risk.created_by === user.id;
    if (!allowed) {
      const project = await getProject(risk.project_id);
      allowed = project !== null && project.owner_id === user.id;
    }
    if (!allowed) return { ok: false, error: DELETE_NOT_ALLOWED };
    const { project_id, title } = await deleteRisk(risk.id);
    await logActivity({
      project_id,
      actor_id: user.id,
      type: "risk_deleted",
      message: `deleted ${noun(risk.kind)} ${quoted(title)}`,
      meta: { risk_id: risk.id, kind: risk.kind },
    });
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not delete this item. Please try again.");
  }
}
