"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { BATCH_STATUS_CONFIG } from "@/lib/constants";
import { logActivity } from "@/lib/data/activity";
import { BATCH_ERRORS, createBatch, deleteBatch, getBatch, updateBatch } from "@/lib/data/batches";
import { getProject } from "@/lib/data/projects";
import {
  batchIdSchema,
  createBatchSchema,
  updateBatchSchema,
  type UpdateBatchSchemaOutput,
} from "@/lib/schemas/batches";
import type { ActionResult, CreateBatchInput, DataBatch, UpdateBatchInput, User } from "@/lib/types";
import { fieldErrorsFromIssues } from "@/lib/validation";

const FIX_FIELDS = "Please fix the highlighted fields.";
const DELETE_FORBIDDEN = "Only the project owner or an admin can delete a batch.";

/** Data-layer messages that are safe (and useful) to show as they are. */
const USER_FACING_ERRORS: ReadonlySet<string> = new Set(Object.values(BATCH_ERRORS));

function revalidate(): void {
  revalidatePath("/", "layout");
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

/** "Batch 3", "calibration batch 0", plus the name when it has one. */
function batchLabel(batch: Pick<DataBatch, "number" | "name" | "is_calibration">): string {
  const base = batch.is_calibration ? `calibration batch ${batch.number}` : `Batch ${batch.number}`;
  return batch.name ? `${base} "${batch.name}"` : base;
}

/** Copies only the keys UpdateBatchInput allows from the parsed data. */
function toUpdatePatch(data: UpdateBatchSchemaOutput): UpdateBatchInput {
  const patch: UpdateBatchInput = {};
  if (data.milestone_id !== undefined) patch.milestone_id = data.milestone_id;
  if (data.number !== undefined) patch.number = data.number;
  if (data.name !== undefined) patch.name = data.name;
  if (data.is_calibration !== undefined) patch.is_calibration = data.is_calibration;
  if (data.unit_type !== undefined) patch.unit_type = data.unit_type;
  if (data.units_target !== undefined) patch.units_target = data.units_target;
  if (data.units_delivered !== undefined) patch.units_delivered = data.units_delivered;
  if (data.units_accepted !== undefined) patch.units_accepted = data.units_accepted;
  if (data.guideline_version !== undefined) patch.guideline_version = data.guideline_version;
  if (data.gold_accuracy !== undefined) patch.gold_accuracy = data.gold_accuracy;
  if (data.agreement_metric !== undefined) patch.agreement_metric = data.agreement_metric;
  if (data.agreement_score !== undefined) patch.agreement_score = data.agreement_score;
  if (data.quality_threshold !== undefined) patch.quality_threshold = data.quality_threshold;
  if (data.agreement_threshold !== undefined) patch.agreement_threshold = data.agreement_threshold;
  if (data.status !== undefined) patch.status = data.status;
  if (data.due_date !== undefined) patch.due_date = data.due_date;
  if (data.notes !== undefined) patch.notes = data.notes;
  return patch;
}

function patchChanges(existing: DataBatch, patch: UpdateBatchInput): boolean {
  return (Object.keys(patch) as (keyof UpdateBatchInput)[]).some((key) => patch[key] !== existing[key]);
}

/** Labels of what changed besides the status ("units", "quality", ...). */
function changedParts(existing: DataBatch, updated: DataBatch): string[] {
  const parts: string[] = [];
  if (
    existing.units_target !== updated.units_target ||
    existing.units_delivered !== updated.units_delivered ||
    existing.units_accepted !== updated.units_accepted ||
    existing.unit_type !== updated.unit_type
  ) {
    parts.push("units");
  }
  if (
    existing.gold_accuracy !== updated.gold_accuracy ||
    existing.quality_threshold !== updated.quality_threshold ||
    existing.agreement_metric !== updated.agreement_metric ||
    existing.agreement_score !== updated.agreement_score ||
    existing.agreement_threshold !== updated.agreement_threshold
  ) {
    parts.push("quality");
  }
  if (existing.due_date !== updated.due_date) parts.push("due date");
  if (
    existing.name !== updated.name ||
    existing.number !== updated.number ||
    existing.is_calibration !== updated.is_calibration ||
    existing.guideline_version !== updated.guideline_version ||
    existing.notes !== updated.notes ||
    existing.milestone_id !== updated.milestone_id
  ) {
    parts.push("details");
  }
  return parts;
}

function humanList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

async function canDeleteBatch(user: User, batch: DataBatch): Promise<boolean> {
  if (user.role === "admin") return true;
  const project = await getProject(batch.project_id);
  return project !== null && project.owner_id === user.id;
}

/* -------------------------------- Actions -------------------------------- */

/** Member. Logs `batch_added`. */
export async function createBatchAction(input: CreateBatchInput): Promise<ActionResult<DataBatch>> {
  const user = await requireUser();
  const parsed = createBatchSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));
  const data = parsed.data;

  try {
    const batch = await createBatch(
      {
        project_id: data.project_id,
        milestone_id: data.milestone_id,
        number: data.number,
        name: data.name,
        is_calibration: data.is_calibration,
        unit_type: data.unit_type,
        units_target: data.units_target,
        units_delivered: data.units_delivered,
        units_accepted: data.units_accepted,
        guideline_version: data.guideline_version,
        gold_accuracy: data.gold_accuracy,
        agreement_metric: data.agreement_metric,
        agreement_score: data.agreement_score,
        quality_threshold: data.quality_threshold,
        agreement_threshold: data.agreement_threshold,
        status: data.status,
        due_date: data.due_date,
        notes: data.notes,
      },
      user.id,
    );
    await logActivity({
      project_id: batch.project_id,
      actor_id: user.id,
      type: "batch_added",
      message: `added ${batchLabel(batch)}`,
      meta: { batch_id: batch.id, number: batch.number, is_calibration: batch.is_calibration },
    });
    revalidate();
    return { ok: true, data: batch };
  } catch (error) {
    return failure(error, "Could not add the batch. Please try again.");
  }
}

/** Member. Logs `batch_updated`. */
export async function updateBatchAction(id: string, input: UpdateBatchInput): Promise<ActionResult<DataBatch>> {
  const user = await requireUser();
  const idParsed = batchIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: BATCH_ERRORS.notFound };
  const parsed = updateBatchSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));

  try {
    const existing = await getBatch(idParsed.data);
    if (!existing) return { ok: false, error: BATCH_ERRORS.notFound };
    const patch = toUpdatePatch(parsed.data);
    if (!patchChanges(existing, patch)) return { ok: true, data: existing };
    const updated = await updateBatch(existing.id, patch);

    const statusChanged = updated.status !== existing.status;
    const parts = changedParts(existing, updated);
    const label = batchLabel(updated);
    const statusLabel = BATCH_STATUS_CONFIG[updated.status].label;
    let message: string;
    if (statusChanged && parts.length === 0) message = `moved ${label} to ${statusLabel}`;
    else if (statusChanged) message = `moved ${label} to ${statusLabel} and updated its ${humanList(parts)}`;
    else message = `updated the ${humanList(parts.length > 0 ? parts : ["details"])} of ${label}`;

    await logActivity({
      project_id: updated.project_id,
      actor_id: user.id,
      type: "batch_updated",
      message,
      meta: {
        batch_id: updated.id,
        number: updated.number,
        ...(statusChanged ? { from: existing.status, to: updated.status } : {}),
      },
    });
    revalidate();
    return { ok: true, data: updated };
  } catch (error) {
    return failure(error, "Could not save the batch. Please try again.");
  }
}

/** Admin or project owner. Logs `batch_deleted`. */
export async function deleteBatchAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = batchIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: BATCH_ERRORS.notFound };

  try {
    const existing = await getBatch(idParsed.data);
    if (!existing) return { ok: false, error: BATCH_ERRORS.notFound };
    if (!(await canDeleteBatch(user, existing))) return { ok: false, error: DELETE_FORBIDDEN };
    const deleted = await deleteBatch(existing.id);
    await logActivity({
      project_id: deleted.project_id,
      actor_id: user.id,
      type: "batch_deleted",
      message: `deleted ${batchLabel(existing)}`,
      meta: { batch_id: existing.id, number: deleted.number, is_calibration: existing.is_calibration },
    });
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not delete the batch. Please try again.");
  }
}
