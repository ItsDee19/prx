"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canDeleteProject, requireUser } from "@/lib/auth";
import { DEFAULT_NEW_PROJECT_PROGRESS_MODE, PROGRESS_MODE_CONFIG, STATUS_CONFIG } from "@/lib/constants";
import { logActivity } from "@/lib/data/activity";
import { listClientSummaries } from "@/lib/data/clients";
import { deleteBlobs } from "@/lib/data/attachments";
import { listLabels } from "@/lib/data/labels";
import { notifySafely, subscribeProjectPeople } from "@/lib/data/notifications";
import {
  countSubtree,
  createProject,
  deleteProject,
  getProject,
  getProjectMembers,
  getProjectSummary,
  reorderProjects,
  setProjectMembers,
  updateProject,
} from "@/lib/data/projects";
import { getUserById } from "@/lib/data/users";
import {
  PROJECT_COMMERCIAL_FIELDS,
  PROJECT_STATUSES,
  type ActionResult,
  type ClientSummary,
  type CreateProjectFullInput,
  type Currency,
  type Label,
  type Project,
  type ProjectStatus,
  type ProjectSummary,
  type ProjectWithMeta,
  type UpdateProjectFullInput,
  type UserSummary,
} from "@/lib/types";
import { clampProgress } from "@/lib/utils";
import {
  fieldErrorsFromIssues,
  projectInputSchema,
  updateProjectSchema,
  type UpdateProjectSchemaInput,
} from "@/lib/validation";

const FIX_FIELDS = "Please fix the highlighted fields.";
const NOT_FOUND = "This project no longer exists.";
const COMMERCIAL_ONLY = "Only admins can change commercial fields.";

function revalidate(): void {
  revalidatePath("/", "layout");
}

function validationFailure(fieldErrors: Record<string, string>): ActionResult<never> {
  const messages = Object.values(fieldErrors);
  return { ok: false, error: messages.length === 1 ? messages[0] : FIX_FIELDS, fieldErrors };
}

/**
 * Plain `Error`s thrown by the data layer carry user-facing sentences ("Pick a
 * currency before entering amounts.") and are passed through; database errors
 * (which have a `code`) and anything else get the friendly fallback.
 */
function failure(error: unknown, message: string): ActionResult<never> {
  const userFacing =
    error instanceof Error && error.constructor === Error && !("code" in error) && /[.!?]$/.test(error.message);
  if (!userFacing) console.error(message, error);
  return { ok: false, error: userFacing ? (error as Error).message : message };
}

function hasOwn(input: unknown, key: string): boolean {
  return typeof input === "object" && input !== null && Object.prototype.hasOwnProperty.call(input, key);
}

/** SPEC.md section 18: a non-admin sending any admin-only key (even null) is refused outright. */
function sendsCommercialFields(input: unknown): boolean {
  return PROJECT_COMMERCIAL_FIELDS.some((key) => hasOwn(input, key));
}

/** Human-readable labels for the "updated the ..." activity message (amounts are never logged). */
const FIELD_LABELS = {
  name: "name",
  description: "description",
  status: "status",
  priority: "priority",
  owner_id: "owner",
  start_date: "start date",
  due_date: "due date",
  progress: "progress",
  color: "colour",
  client_id: "client",
  service_line: "service line",
  engagement_type: "engagement type",
  currency: "currency",
  delivery_state: "delivery state",
  progress_mode: "progress mode",
  budget_hours: "hours budget",
  budget_period: "budget period",
} as const satisfies Partial<Record<keyof UpdateProjectFullInput, string>>;

type PatchField = keyof typeof FIELD_LABELS;
const PATCH_FIELDS = Object.keys(FIELD_LABELS) as PatchField[];

/** Copies only the keys `UpdateProjectFullInput` allows (drops `parent_id`). */
function toUpdatePatch(data: UpdateProjectSchemaInput): UpdateProjectFullInput {
  const patch: UpdateProjectFullInput = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description;
  if (data.status !== undefined) patch.status = data.status;
  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.owner_id !== undefined) patch.owner_id = data.owner_id;
  if (data.start_date !== undefined) patch.start_date = data.start_date;
  if (data.due_date !== undefined) patch.due_date = data.due_date;
  if (data.progress !== undefined) patch.progress = data.progress;
  if (data.color !== undefined) patch.color = data.color;
  if (data.member_ids !== undefined) patch.member_ids = data.member_ids;
  if (data.client_id !== undefined) patch.client_id = data.client_id;
  if (data.service_line !== undefined) patch.service_line = data.service_line;
  if (data.engagement_type !== undefined) patch.engagement_type = data.engagement_type;
  if (data.currency !== undefined) patch.currency = data.currency;
  if (data.delivery_state !== undefined) patch.delivery_state = data.delivery_state;
  if (data.progress_mode !== undefined) patch.progress_mode = data.progress_mode;
  if (data.budget_hours !== undefined) patch.budget_hours = data.budget_hours;
  if (data.budget_period !== undefined) patch.budget_period = data.budget_period;
  if (data.label_ids !== undefined) patch.label_ids = Array.from(new Set(data.label_ids));
  if (data.contract_value !== undefined) patch.contract_value = data.contract_value;
  if (data.hourly_rate !== undefined) patch.hourly_rate = data.hourly_rate;
  return patch;
}

function normalise(value: string | number | null | undefined): string | number | null {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value.trim() : value;
}

/**
 * Keys and message labels of the fields in `patch` whose value differs from
 * what is stored. `existing` is loaded with includeCommercial for admins (the
 * only callers allowed to send amounts); amounts collapse into "commercial
 * terms" so no figure ever reaches the activity log.
 */
function changedFields(existing: ProjectWithMeta, patch: UpdateProjectFullInput): { keys: string[]; labels: string[] } {
  const nextMode = patch.progress_mode ?? existing.progress_mode;
  const keys: string[] = [];
  const labels: string[] = [];
  for (const key of PATCH_FIELDS) {
    const next = patch[key];
    if (next === undefined) continue;
    // Progress is derived (and the patch value ignored) outside manual mode.
    if (key === "progress" && nextMode !== "manual") continue;
    const current = existing[key];
    if (normalise(key === "progress" ? clampProgress(Number(next)) : next) !== normalise(current)) {
      keys.push(key);
      labels.push(FIELD_LABELS[key]);
    }
  }
  if (patch.label_ids !== undefined) {
    const before = new Set(existing.labels.map((label) => label.id));
    const after = new Set(patch.label_ids);
    if (before.size !== after.size || [...after].some((id) => !before.has(id))) {
      keys.push("labels");
      labels.push("labels");
    }
  }
  const commercial = PROJECT_COMMERCIAL_FIELDS.filter(
    (key) => patch[key] !== undefined && normalise(patch[key]) !== normalise(existing[key]),
  );
  if (commercial.length > 0) {
    keys.push(...commercial);
    labels.push("commercial terms");
  }
  return { keys, labels };
}

function humanList(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** Logs one activity row per added/removed member, sequentially so feed order is stable. */
async function logMemberDiff(
  projectId: string,
  actorId: string,
  before: UserSummary[],
  after: UserSummary[],
): Promise<void> {
  const beforeIds = new Set(before.map((u) => u.id));
  const afterIds = new Set(after.map((u) => u.id));
  for (const user of after) {
    if (!beforeIds.has(user.id)) {
      await logActivity({
        project_id: projectId,
        actor_id: actorId,
        type: "member_added",
        message: `added ${user.name} as a member`,
        meta: { user_id: user.id, name: user.name },
      });
    }
  }
  for (const user of before) {
    if (!afterIds.has(user.id)) {
      await logActivity({
        project_id: projectId,
        actor_id: actorId,
        type: "member_removed",
        message: `removed ${user.name} from the project`,
        meta: { user_id: user.id, name: user.name },
      });
    }
  }
}

async function ownerError(
  ownerId: string | null | undefined,
): Promise<ActionResult<never> | null> {
  if (ownerId && !(await getUserById(ownerId))) {
    return validationFailure({ owner_id: "The selected owner does not exist" });
  }
  return null;
}

/** Field errors for user-facing data-layer messages that belong to one control. */
function fieldFailure(error: unknown, fallback: string): ActionResult<never> {
  const result = failure(error, fallback);
  if (result.ok) return result;
  if (result.error === "The selected client no longer exists.") return { ...result, fieldErrors: { client_id: result.error } };
  if (result.error.startsWith("Pick a currency") || result.error.startsWith("Clear the contract value")) {
    return { ...result, fieldErrors: { currency: result.error } };
  }
  return result;
}

/* -------------------------------- Actions -------------------------------- */

/**
 * Member. Commercial rule: only admins may send `contract_value` /
 * `hourly_rate`. New projects get `progress_mode` "tasks" unless the input
 * picks one; template provenance and tuning days are ignored here (only the
 * templates actions set them).
 */
export async function createProjectAction(
  input: CreateProjectFullInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (user.role !== "admin" && sendsCommercialFields(input)) return { ok: false, error: COMMERCIAL_ONLY };
  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));
  const data = { ...parsed.data };
  // Template provenance and the tuning window come only from the templates actions.
  delete data.template_key;
  delete data.source_project_id;
  delete data.tuning_days;

  try {
    const parent = data.parent_id ? await getProject(data.parent_id) : null;
    if (data.parent_id && !parent) {
      return { ok: false, error: "The parent project no longer exists." };
    }
    const invalidOwner = await ownerError(data.owner_id);
    if (invalidOwner) return invalidOwner;

    const project = await createProject(
      {
        ...data,
        parent_id: parent?.id ?? null,
        progress_mode: data.progress_mode ?? DEFAULT_NEW_PROJECT_PROGRESS_MODE,
      },
      user.id,
    );

    await logActivity({
      project_id: project.id,
      actor_id: user.id,
      type: "project_created",
      message: parent ? "created the sub-project" : "created the project",
      meta: { name: project.name, status: project.status, parent_id: parent?.id ?? null },
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
    await notifySafely("createProjectAction", () => subscribeProjectPeople(project, data.member_ids ?? []));

    revalidate();
    return { ok: true, data: { id: project.id } };
  } catch (error) {
    return fieldFailure(error, "Could not create the project. Please try again.");
  }
}

/**
 * Member. Refuses `go_live_date` / `tuning_days` (setGoLiveDate owns them) and,
 * for non-admins, any commercial key. Returns the project with amounts only
 * for admins.
 */
export async function updateProjectAction(
  id: string,
  input: UpdateProjectFullInput,
): Promise<ActionResult<Project>> {
  const user = await requireUser();
  if (hasOwn(input, "go_live_date") || hasOwn(input, "tuning_days")) {
    return { ok: false, error: "Use Set go-live date." };
  }
  const isAdmin = user.role === "admin";
  if (!isAdmin && sendsCommercialFields(input)) return { ok: false, error: COMMERCIAL_ONLY };
  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));

  try {
    const existing = await getProject(id, { includeCommercial: isAdmin });
    if (!existing) return { ok: false, error: NOT_FOUND };

    const patch = toUpdatePatch(parsed.data);

    // The schema only compares dates present in the patch; check against stored values too.
    const start = patch.start_date !== undefined ? patch.start_date : existing.start_date;
    const due = patch.due_date !== undefined ? patch.due_date : existing.due_date;
    if (start && due && due < start) {
      return validationFailure({ due_date: "Due date must be on or after the start date" });
    }
    const invalidOwner = await ownerError(patch.owner_id);
    if (invalidOwner) return invalidOwner;

    const changed = changedFields(existing, patch);
    const updated = await updateProject(id, patch, { includeCommercial: isAdmin });

    if (patch.status !== undefined && patch.status !== existing.status) {
      await logActivity({
        project_id: id,
        actor_id: user.id,
        type: "status_changed",
        message: `changed status from ${STATUS_CONFIG[existing.status].label} to ${STATUS_CONFIG[updated.status].label}`,
        meta: { from: existing.status, to: updated.status, fields: changed.keys },
      });
    } else if (changed.labels.length > 0) {
      await logActivity({
        project_id: id,
        actor_id: user.id,
        type: "project_updated",
        message: `updated the ${humanList(changed.labels)}`,
        meta: { fields: changed.keys },
      });
    }
    if (patch.member_ids !== undefined) {
      await logMemberDiff(id, user.id, existing.members, await getProjectMembers(id));
    }
    if (patch.owner_id !== undefined || patch.member_ids !== undefined) {
      await notifySafely("updateProjectAction", () =>
        subscribeProjectPeople({ id, owner_id: updated.owner_id }, patch.member_ids ?? []),
      );
    }

    revalidate();
    return { ok: true, data: updated };
  } catch (error) {
    return fieldFailure(error, "Could not save the project. Please try again.");
  }
}

export async function updateProjectStatusAction(
  id: string,
  status: ProjectStatus,
): Promise<ActionResult<Project>> {
  const user = await requireUser();
  const parsed = z.enum(PROJECT_STATUSES).safeParse(status);
  if (!parsed.success) return { ok: false, error: "Choose a valid status." };
  const options = { includeCommercial: user.role === "admin" };

  try {
    const existing = await getProject(id, options);
    if (!existing) return { ok: false, error: NOT_FOUND };
    if (existing.status === parsed.data) return { ok: true, data: existing };

    const updated = await updateProject(id, { status: parsed.data }, options);
    await logActivity({
      project_id: id,
      actor_id: user.id,
      type: "status_changed",
      message: `changed status from ${STATUS_CONFIG[existing.status].label} to ${STATUS_CONFIG[updated.status].label}`,
      meta: { from: existing.status, to: updated.status },
    });

    revalidate();
    return { ok: true, data: updated };
  } catch (error) {
    return failure(error, "Could not update the status. Please try again.");
  }
}

/** Manual progress only: derived modes (tasks, phases, batches) are refused. */
export async function updateProjectProgressAction(
  id: string,
  progress: number,
): Promise<ActionResult<Project>> {
  const user = await requireUser();
  const parsed = z.number({ error: "Progress must be a number" }).min(0).max(100).safeParse(progress);
  if (!parsed.success) return { ok: false, error: "Progress must be a number between 0 and 100." };
  const value = clampProgress(parsed.data);
  const options = { includeCommercial: user.role === "admin" };

  try {
    const existing = await getProject(id, options);
    if (!existing) return { ok: false, error: NOT_FOUND };
    if (existing.progress_mode !== "manual") {
      return {
        ok: false,
        error: `Progress is calculated ${PROGRESS_MODE_CONFIG[existing.progress_mode].label.toLowerCase()}. Switch the project to manual progress to set it by hand.`,
      };
    }
    if (existing.progress === value) return { ok: true, data: existing };

    const updated = await updateProject(id, { progress: value }, options);
    await logActivity({
      project_id: id,
      actor_id: user.id,
      type: "progress_updated",
      message: `updated progress from ${existing.progress}% to ${updated.progress}%`,
      meta: { from: existing.progress, to: updated.progress },
    });

    revalidate();
    return { ok: true, data: updated };
  } catch (error) {
    return failure(error, "Could not update the progress. Please try again.");
  }
}

export async function deleteProjectAction(
  id: string,
): Promise<ActionResult<{ parent_id: string | null }>> {
  const user = await requireUser();

  try {
    const project = await getProject(id);
    if (!project) return { ok: false, error: NOT_FOUND };
    if (!canDeleteProject(user, project)) {
      return {
        ok: false,
        error: "Only an admin, the project creator or its owner can delete this project.",
      };
    }

    const subtree = await countSubtree(id);
    const { blob_urls } = await deleteProject(id);
    // After the commit: remove the subtree's uploaded files from Vercel Blob (never throws).
    await deleteBlobs(blob_urls);
    // Logged on the parent (or with no project for top-level) so it survives the cascade.
    await logActivity({
      project_id: project.parent_id,
      actor_id: user.id,
      type: "project_deleted",
      message: project.parent_id
        ? `deleted sub-project "${project.name}"`
        : `deleted project "${project.name}"`,
      meta: {
        project_id: id,
        name: project.name,
        parent_id: project.parent_id,
        subprojects_removed: subtree.total,
      },
    });

    revalidate();
    return { ok: true, data: { parent_id: project.parent_id } };
  } catch (error) {
    return failure(error, "Could not delete the project. Please try again.");
  }
}

export async function setProjectMembersAction(
  id: string,
  userIds: string[],
): Promise<ActionResult<UserSummary[]>> {
  const user = await requireUser();
  const parsed = z.array(z.string().min(1)).safeParse(userIds);
  if (!parsed.success) return { ok: false, error: "Invalid member list." };

  try {
    const existing = await getProject(id);
    if (!existing) return { ok: false, error: NOT_FOUND };

    const members = await setProjectMembers(id, Array.from(new Set(parsed.data)));
    await logMemberDiff(id, user.id, existing.members, members);
    await notifySafely("setProjectMembersAction", () =>
      subscribeProjectPeople({ id }, members.map((member) => member.id)),
    );

    revalidate();
    return { ok: true, data: members };
  } catch (error) {
    return failure(error, "Could not update the members. Please try again.");
  }
}

export async function reorderProjectsAction(
  parentId: string | null,
  orderedIds: string[],
): Promise<ActionResult> {
  await requireUser();
  const parsed = z
    .object({ parentId: z.string().min(1).nullable(), orderedIds: z.array(z.string().min(1)) })
    .safeParse({ parentId, orderedIds });
  if (!parsed.success) return { ok: false, error: "Invalid order." };

  try {
    const ids = Array.from(new Set(parsed.data.orderedIds));
    if (ids.length > 0) await reorderProjects(parsed.data.parentId, ids);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not reorder the projects. Please try again.");
  }
}

/** Member: what ProjectDialog needs when it opens (clients, label catalogue, whether to show amounts). */
export async function getProjectFormOptionsAction(): Promise<
  ActionResult<{ clients: ClientSummary[]; labels: Label[]; isAdmin: boolean }>
> {
  const user = await requireUser();
  try {
    const [clients, labels] = await Promise.all([listClientSummaries(), listLabels()]);
    return { ok: true, data: { clients, labels, isAdmin: user.role === "admin" } };
  } catch (error) {
    return failure(error, "Could not load the form options. Please try again.");
  }
}

/**
 * ADMIN-ONLY: the stored amounts of one project, so ProjectDialog edits the
 * real values even when its `project` prop was loaded without commercial
 * fields (and never wipes them by sending nulls).
 */
export async function getProjectCommercialAction(
  id: string,
): Promise<ActionResult<{ contract_value: number | null; hourly_rate: number | null; currency: Currency | null }>> {
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false, error: COMMERCIAL_ONLY };
  const parsed = z.string().min(1).safeParse(id);
  if (!parsed.success) return { ok: false, error: NOT_FOUND };
  try {
    const project = await getProject(parsed.data, { includeCommercial: true });
    if (!project) return { ok: false, error: NOT_FOUND };
    return {
      ok: true,
      data: { contract_value: project.contract_value, hourly_rate: project.hourly_rate, currency: project.currency },
    };
  } catch (error) {
    return failure(error, "Could not load the commercial terms. Please try again.");
  }
}

/** Member: a project reference (NewProjectDialogHost titles "New sub-project in {name}"). */
export async function getProjectSummaryAction(id: string): Promise<ActionResult<ProjectSummary>> {
  await requireUser();
  const parsed = z.string().min(1).safeParse(id);
  if (!parsed.success) return { ok: false, error: NOT_FOUND };
  try {
    const summary = await getProjectSummary(parsed.data);
    return summary ? { ok: true, data: summary } : { ok: false, error: NOT_FOUND };
  } catch (error) {
    return failure(error, "Could not load the project. Please try again.");
  }
}
