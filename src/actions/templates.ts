"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data/activity";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { notifySafely, subscribeProjectPeople } from "@/lib/data/notifications";
import { getProject } from "@/lib/data/projects";
import {
  TEMPLATE_ERRORS,
  captureTemplateFromProject,
  convertToPilot,
  createCustomTemplate,
  createProjectFromTemplate,
  deleteCustomTemplate,
  getConversionState,
  listTemplateOptions,
  proposeRetainer,
  updateCustomTemplate,
  type ConversionCreation,
  type TemplateConversionState,
  type TemplateCreation,
} from "@/lib/data/templates";
import { getUserById } from "@/lib/data/users";
import {
  convertToPilotOptionsSchema,
  projectIdSchema,
  proposeRetainerOptionsSchema,
  saveAsTemplateSchema,
  templateIdSchema,
  templateKeySchema,
  updateCustomTemplateSchema,
  type ConvertToPilotOptions,
  type ProposeRetainerOptions,
  type SaveAsTemplateInput,
} from "@/lib/schemas/templates";
import type { TemplateOption } from "@/lib/templates";
import {
  PROJECT_COMMERCIAL_FIELDS,
  type ActionResult,
  type CreateProjectFullInput,
  type ProjectTemplate,
  type TemplatePayload,
  type UpdateProjectTemplateInput,
  type User,
} from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { fieldErrorsFromIssues, projectInputSchema } from "@/lib/validation";

const FIX_FIELDS = "Please fix the highlighted fields.";
const COMMERCIAL_ONLY = "Only admins can change commercial fields.";
const ADMIN_ONLY = "Only admins can change custom templates.";

function revalidate(): void {
  revalidatePath("/", "layout");
}

function validationFailure(fieldErrors: Record<string, string>): ActionResult<never> {
  const messages = Object.values(fieldErrors);
  return { ok: false, error: messages.length === 1 ? messages[0] : FIX_FIELDS, fieldErrors };
}

/**
 * Plain `Error`s from the data layer carry user-facing sentences (template
 * errors, "Pick a currency before entering amounts.") and are passed
 * through; database and validation errors get the friendly fallback.
 */
function failure(error: unknown, message: string): ActionResult<never> {
  const userFacing =
    error instanceof Error && error.constructor === Error && !("code" in error) && /[.!?]$/.test(error.message);
  if (!userFacing) console.error(message, error);
  return { ok: false, error: userFacing ? (error as Error).message : message };
}

/** Field errors for user-facing messages that belong to one control of the project form. */
function projectFailure(error: unknown, fallback: string): ActionResult<never> {
  const result = failure(error, fallback);
  if (result.ok) return result;
  if (result.error === "The selected client no longer exists.") return { ...result, fieldErrors: { client_id: result.error } };
  if (result.error.startsWith("Pick a currency")) return { ...result, fieldErrors: { currency: result.error } };
  return result;
}

function hasOwn(input: unknown, key: string): boolean {
  return typeof input === "object" && input !== null && Object.prototype.hasOwnProperty.call(input, key);
}

/** SPEC.md section 18: a non-admin sending any admin-only key (even null) is refused outright. */
function sendsCommercialFields(input: unknown): boolean {
  return PROJECT_COMMERCIAL_FIELDS.some((key) => hasOwn(input, key));
}

function appliedSummary(creation: TemplateCreation): string {
  const parts = [
    creation.applied.milestones > 0 ? pluralize(creation.applied.milestones, "phase") : null,
    creation.applied.tasks > 0 ? pluralize(creation.applied.tasks, "task") : null,
    creation.applied.metrics > 0 ? pluralize(creation.applied.metrics, "metric") : null,
    creation.applied.risks > 0 ? pluralize(creation.applied.risks, "risk") : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/** `template_applied` on the new project (messages never carry amounts). */
async function logTemplateApplied(creation: TemplateCreation, actorId: string): Promise<void> {
  await logActivity({
    project_id: creation.project.id,
    actor_id: actorId,
    type: "template_applied",
    message: `applied the ${creation.template.name} template${appliedSummary(creation)}`,
    meta: {
      template_key: creation.template.key,
      template_name: creation.template.name,
      start_date: creation.start_date,
      ...creation.applied,
    },
  });
}

/** project_created (+ subproject_created on the parent) + template_applied, then watchers. */
async function recordCreation(
  creation: TemplateCreation,
  user: User,
  scope: string,
  parent: { id: string } | null,
  message: string,
): Promise<void> {
  const project = creation.project;
  await logActivity({
    project_id: project.id,
    actor_id: user.id,
    type: "project_created",
    message,
    meta: {
      name: project.name,
      status: project.status,
      parent_id: parent?.id ?? null,
      template_key: creation.template.key,
      source_project_id: project.source_project_id,
    },
  });
  if (parent) {
    await logActivity({
      project_id: parent.id,
      actor_id: user.id,
      type: "subproject_created",
      message: `added sub-project "${project.name}"`,
      meta: { subproject_id: project.id, name: project.name },
    });
  }
  await logTemplateApplied(creation, user.id);
  // Owner, members and creator watch the new project (template tasks start unassigned).
  await notifySafely(scope, () => subscribeProjectPeople(project, creation.member_ids));
}

async function logConversion(creation: ConversionCreation, user: User, kind: "pilot" | "retainer"): Promise<void> {
  await logActivity({
    project_id: creation.source.id,
    actor_id: user.id,
    type: "project_converted",
    message:
      kind === "pilot"
        ? `converted the assessment into the pilot "${creation.project.name}"`
        : `proposed the retainer "${creation.project.name}"`,
    meta: {
      kind,
      target_project_id: creation.project.id,
      target_name: creation.project.name,
      template_key: creation.template.key,
    },
  });
}

/* -------------------------------- Actions -------------------------------- */

/** Member: built-in options then custom templates by name (the "Start from" step). */
export async function listTemplateOptionsAction(): Promise<ActionResult<TemplateOption[]>> {
  await requireUser();
  try {
    return { ok: true, data: await listTemplateOptions() };
  } catch (error) {
    return failure(error, "Could not load the templates. Please try again.");
  }
}

/**
 * Member. Commercial rule as for createProjectAction. Starts on
 * `input.start_date` (workspace today when empty); an empty due date becomes
 * the schedule's build end; the template fills progress mode, engagement
 * type, service line, delivery state, budget period and tuning days the input
 * leaves empty. One transaction creates the project and applies the plan.
 */
export async function createProjectFromTemplateAction(
  input: CreateProjectFullInput,
  templateKey: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  if (!isAdmin && sendsCommercialFields(input)) return { ok: false, error: COMMERCIAL_ONLY };
  const key = templateKeySchema.safeParse(templateKey);
  if (!key.success) return { ok: false, error: "Choose a template." };
  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));
  const data = { ...parsed.data };
  // Provenance and the tuning window come from the template, never from the client.
  delete data.template_key;
  delete data.source_project_id;
  delete data.tuning_days;

  try {
    const parent = data.parent_id ? await getProject(data.parent_id) : null;
    if (data.parent_id && !parent) return { ok: false, error: "The parent project no longer exists." };
    if (data.owner_id && !(await getUserById(data.owner_id))) {
      return validationFailure({ owner_id: "The selected owner does not exist" });
    }
    const today = await getWorkspaceToday();
    const creation = await createProjectFromTemplate(
      { ...data, parent_id: parent?.id ?? null },
      key.data,
      user.id,
      today,
      { includeCommercial: isAdmin },
    );
    await recordCreation(
      creation,
      user,
      "createProjectFromTemplateAction",
      parent,
      parent ? "created the sub-project" : "created the project",
    );
    revalidate();
    return { ok: true, data: { id: creation.project.id } };
  } catch (error) {
    return projectFailure(error, "Could not create the project. Please try again.");
  }
}

/** Member: what Save as template would capture (the dialog's preview). */
export async function previewProjectTemplateAction(projectId: string): Promise<ActionResult<TemplatePayload>> {
  await requireUser();
  const id = projectIdSchema.safeParse(projectId);
  if (!id.success) return { ok: false, error: TEMPLATE_ERRORS.projectNotFound };
  try {
    return { ok: true, data: await captureTemplateFromProject(id.data) };
  } catch (error) {
    return failure(error, "Could not read the project plan. Please try again.");
  }
}

/** Member. Captures phases, tasks, metrics, open risks and labels; no activity (configuration). */
export async function saveProjectAsTemplateAction(
  projectId: string,
  input: SaveAsTemplateInput,
): Promise<ActionResult<ProjectTemplate>> {
  const user = await requireUser();
  const id = projectIdSchema.safeParse(projectId);
  if (!id.success) return { ok: false, error: TEMPLATE_ERRORS.projectNotFound };
  const parsed = saveAsTemplateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));

  try {
    const project = await getProject(id.data);
    if (!project) return { ok: false, error: TEMPLATE_ERRORS.projectNotFound };
    const payload = await captureTemplateFromProject(project.id);
    const template = await createCustomTemplate(
      {
        name: parsed.data.name,
        description: parsed.data.description ?? "",
        service_line: parsed.data.service_line !== undefined ? parsed.data.service_line : project.service_line,
        payload,
        source_project_id: project.id,
      },
      user.id,
    );
    revalidate();
    return { ok: true, data: template };
  } catch (error) {
    const result = failure(error, "Could not save the template. Please try again.");
    if (!result.ok && result.error === TEMPLATE_ERRORS.duplicateName) return { ...result, fieldErrors: { name: result.error } };
    return result;
  }
}

/** Admin: rename, describe or re-tag a custom template; no activity (configuration). */
export async function updateCustomTemplateAction(
  id: string,
  input: UpdateProjectTemplateInput,
): Promise<ActionResult<ProjectTemplate>> {
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false, error: ADMIN_ONLY };
  const templateId = templateIdSchema.safeParse(id);
  if (!templateId.success) return { ok: false, error: TEMPLATE_ERRORS.notFound };
  const parsed = updateCustomTemplateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));

  try {
    const patch: UpdateProjectTemplateInput = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.description !== undefined) patch.description = parsed.data.description;
    if (parsed.data.service_line !== undefined) patch.service_line = parsed.data.service_line;
    const template = await updateCustomTemplate(templateId.data, patch);
    revalidate();
    return { ok: true, data: template };
  } catch (error) {
    const result = failure(error, "Could not save the template. Please try again.");
    if (!result.ok && result.error === TEMPLATE_ERRORS.duplicateName) return { ...result, fieldErrors: { name: result.error } };
    return result;
  }
}

/** Admin; projects created from it keep existing. No activity (configuration). */
export async function deleteCustomTemplateAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false, error: ADMIN_ONLY };
  const templateId = templateIdSchema.safeParse(id);
  if (!templateId.success) return { ok: false, error: TEMPLATE_ERRORS.notFound };
  try {
    await deleteCustomTemplate(templateId.data);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not delete the template. Please try again.");
  }
}

/**
 * Member: whether Convert to pilot / Propose retainer apply, what was already
 * created from the project, and the dialogs' defaults (`today` is the
 * workspace today).
 */
export async function getTemplateConversionStateAction(
  projectId: string,
): Promise<ActionResult<TemplateConversionState & { today: string }>> {
  await requireUser();
  const id = projectIdSchema.safeParse(projectId);
  if (!id.success) return { ok: false, error: TEMPLATE_ERRORS.projectNotFound };
  try {
    const today = await getWorkspaceToday();
    const state = await getConversionState(id.data, today);
    return state ? { ok: true, data: { ...state, today } } : { ok: false, error: TEMPLATE_ERRORS.projectNotFound };
  } catch (error) {
    return failure(error, "Could not load the project. Please try again.");
  }
}

/**
 * Member. Only for a consulting / assessment project whose Plan phase is
 * done: a new AI delivery project for the same client with the assessment's
 * labels, metrics and members, linked back through `source_project_id`.
 * `options` (optional) carries the dialog's name, start date and service line.
 */
export async function convertToPilotAction(
  projectId: string,
  options?: ConvertToPilotOptions,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const id = projectIdSchema.safeParse(projectId);
  if (!id.success) return { ok: false, error: TEMPLATE_ERRORS.projectNotFound };
  const choices = convertToPilotOptionsSchema.safeParse(options ?? {});
  if (!choices.success) return validationFailure(fieldErrorsFromIssues(choices.error.issues));

  try {
    const today = await getWorkspaceToday();
    const creation = await convertToPilot(id.data, user.id, today, choices.data, {
      includeCommercial: user.role === "admin",
    });
    await recordCreation(
      creation,
      user,
      "convertToPilotAction",
      null,
      `created the pilot from the assessment "${creation.source.name}"`,
    );
    await logConversion(creation, user, "pilot");
    revalidate();
    return { ok: true, data: { id: creation.project.id } };
  } catch (error) {
    return failure(error, "Could not create the pilot. Please try again.");
  }
}

/**
 * Member. A Retainer project for the same client (labels and members copied,
 * `source_project_id` set), starting when the source's tuning window closes.
 * Refused for an engagement that is already a retainer. `options`
 * (optional) carries the dialog's name, start date and monthly hours.
 */
export async function proposeRetainerAction(
  projectId: string,
  options?: ProposeRetainerOptions,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const id = projectIdSchema.safeParse(projectId);
  if (!id.success) return { ok: false, error: TEMPLATE_ERRORS.projectNotFound };
  const choices = proposeRetainerOptionsSchema.safeParse(options ?? {});
  if (!choices.success) return validationFailure(fieldErrorsFromIssues(choices.error.issues));

  try {
    const today = await getWorkspaceToday();
    const creation = await proposeRetainer(id.data, user.id, today, choices.data, {
      includeCommercial: user.role === "admin",
    });
    await recordCreation(
      creation,
      user,
      "proposeRetainerAction",
      null,
      `created the retainer proposal after "${creation.source.name}"`,
    );
    await logConversion(creation, user, "retainer");
    revalidate();
    return { ok: true, data: { id: creation.project.id } };
  } catch (error) {
    return failure(error, "Could not create the retainer. Please try again.");
  }
}
