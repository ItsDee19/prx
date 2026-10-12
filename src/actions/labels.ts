"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data/activity";
import { createLabel, deleteLabel, getLabel, listLabels, setProjectLabels, updateLabel } from "@/lib/data/labels";
import { getProject } from "@/lib/data/projects";
import { createLabelSchema, labelIdSchema, labelIdsSchema, updateLabelSchema } from "@/lib/schemas/labels";
import type { ActionResult, CreateLabelInput, Label, LabelSummary, UpdateLabelInput } from "@/lib/types";
import { fieldErrorsFromIssues } from "@/lib/validation";

/**
 * Label catalogue and project label assignments. Catalogue edits are
 * workspace configuration (no activity); assigning labels to a project logs
 * `project_updated`.
 */

const ADMIN_ONLY = "Only admins can rename, recolour or delete labels.";

function revalidate(): void {
  revalidatePath("/", "layout");
}

function invalid(fieldErrors: Record<string, string>): ActionResult<never> {
  const messages = Object.values(fieldErrors);
  return { ok: false, error: messages.length === 1 ? messages[0] : "Please fix the highlighted fields.", fieldErrors };
}

/**
 * Plain `Error`s thrown by the data layer carry user-facing sentences and are
 * passed through; database errors (which have a `code`) and anything else get
 * the friendly fallback.
 */
function failure(error: unknown, fallback: string): ActionResult<never> {
  const userFacing =
    error instanceof Error && error.constructor === Error && !("code" in error) && /[.!?]$/.test(error.message);
  if (!userFacing) console.error(fallback, error);
  return { ok: false, error: userFacing ? (error as Error).message : fallback };
}

/** Member: any signed-in user can add to the catalogue (returns the existing label for a duplicate name). */
export async function createLabelAction(input: CreateLabelInput): Promise<ActionResult<Label>> {
  const user = await requireUser();
  const parsed = createLabelSchema.safeParse(input);
  if (!parsed.success) return invalid(fieldErrorsFromIssues(parsed.error.issues));
  try {
    const label = await createLabel(parsed.data, user.id);
    revalidate();
    return { ok: true, data: label };
  } catch (error) {
    return failure(error, "Could not create the label. Please try again.");
  }
}

/** Admin: rename, recolour or regroup. */
export async function updateLabelAction(id: string, input: UpdateLabelInput): Promise<ActionResult<Label>> {
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false, error: ADMIN_ONLY };
  const parsedId = labelIdSchema.safeParse(id);
  const parsed = updateLabelSchema.safeParse(input);
  if (!parsedId.success) return { ok: false, error: "This label no longer exists." };
  if (!parsed.success) return invalid(fieldErrorsFromIssues(parsed.error.issues));
  try {
    const label = await updateLabel(parsedId.data, parsed.data);
    revalidate();
    return { ok: true, data: label };
  } catch (error) {
    return failure(error, "Could not save the label. Please try again.");
  }
}

/** Admin: removes the label everywhere it is used. */
export async function deleteLabelAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false, error: ADMIN_ONLY };
  const parsedId = labelIdSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "This label no longer exists." };
  try {
    if (!(await getLabel(parsedId.data))) return { ok: false, error: "This label no longer exists." };
    await deleteLabel(parsedId.data);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not delete the label. Please try again.");
  }
}

/** Member: replaces a project's labels; logs "updated the labels" when the set changes. */
export async function setProjectLabelsAction(projectId: string, labelIds: string[]): Promise<ActionResult<LabelSummary[]>> {
  const user = await requireUser();
  const parsed = labelIdsSchema.safeParse(labelIds);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid labels." };
  try {
    const project = await getProject(projectId);
    if (!project) return { ok: false, error: "This project no longer exists." };
    const before = new Set(project.labels.map((label) => label.id));
    const labels = await setProjectLabels(project.id, Array.from(new Set(parsed.data)));
    const after = new Set(labels.map((label) => label.id));
    const changed = before.size !== after.size || [...after].some((id) => !before.has(id));
    if (changed) {
      await logActivity({
        project_id: project.id,
        actor_id: user.id,
        type: "project_updated",
        message: "updated the labels",
        meta: { fields: ["labels"], label_ids: [...after] },
      });
    }
    revalidate();
    return { ok: true, data: labels };
  } catch (error) {
    return failure(error, "Could not update the labels. Please try again.");
  }
}

/** Member: the catalogue for pickers that open lazily. */
export async function listLabelsAction(): Promise<ActionResult<Label[]>> {
  await requireUser();
  try {
    return { ok: true, data: await listLabels() };
  } catch (error) {
    return failure(error, "Could not load the labels. Please try again.");
  }
}
