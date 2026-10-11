"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canDeleteProject, requireUser } from "@/lib/auth";
import { STATUS_CONFIG } from "@/lib/constants";
import { logActivity } from "@/lib/data/activity";
import {
  countSubtree,
  createProject,
  deleteProject,
  getProject,
  getProjectMembers,
  reorderProjects,
  setProjectMembers,
  updateProject,
} from "@/lib/data/projects";
import { getUserById } from "@/lib/data/users";
import {
  PROJECT_STATUSES,
  type ActionResult,
  type CreateProjectInput,
  type Project,
  type ProjectStatus,
  type UpdateProjectInput,
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

function revalidate(): void {
  revalidatePath("/", "layout");
}

function validationFailure(fieldErrors: Record<string, string>): ActionResult<never> {
  const messages = Object.values(fieldErrors);
  return { ok: false, error: messages.length === 1 ? messages[0] : FIX_FIELDS, fieldErrors };
}

function failure(error: unknown, message: string): ActionResult<never> {
  console.error(message, error);
  return { ok: false, error: message };
}

/** Human-readable labels for the "updated the ..." activity message. */
const FIELD_LABELS: Record<Exclude<keyof UpdateProjectInput, "member_ids">, string> = {
  name: "name",
  description: "description",
  status: "status",
  priority: "priority",
  owner_id: "owner",
  start_date: "start date",
  due_date: "due date",
  progress: "progress",
  color: "colour",
};

type PatchField = keyof typeof FIELD_LABELS;
const PATCH_FIELDS = Object.keys(FIELD_LABELS) as PatchField[];

/** Copies only the keys `UpdateProjectInput` allows (drops `parent_id`). */
function toUpdatePatch(data: UpdateProjectSchemaInput): UpdateProjectInput {
  const patch: UpdateProjectInput = {};
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
  return patch;
}

function normalise(value: string | number | null | undefined): string | number | null {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value.trim() : value;
}

/** Fields in `patch` whose value differs from what is stored. */
function changedFields(existing: Project, patch: UpdateProjectInput): PatchField[] {
  return PATCH_FIELDS.filter((key) => {
    const next = patch[key];
    if (next === undefined) return false;
    const current = existing[key];
    return normalise(key === "progress" ? clampProgress(Number(next)) : next) !== normalise(current);
  });
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

/* -------------------------------- Actions -------------------------------- */

export async function createProjectAction(
  input: CreateProjectInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));
  const data = parsed.data;

  try {
    const parent = data.parent_id ? await getProject(data.parent_id) : null;
    if (data.parent_id && !parent) {
      return { ok: false, error: "The parent project no longer exists." };
    }
    const invalidOwner = await ownerError(data.owner_id);
    if (invalidOwner) return invalidOwner;

    const project = await createProject({ ...data, parent_id: parent?.id ?? null }, user.id);

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

    revalidate();
    return { ok: true, data: { id: project.id } };
  } catch (error) {
    return failure(error, "Could not create the project. Please try again.");
  }
}

export async function updateProjectAction(
  id: string,
  input: UpdateProjectInput,
): Promise<ActionResult<Project>> {
  const user = await requireUser();
  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));

  try {
    const existing = await getProject(id);
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
    const updated = await updateProject(id, patch);

    if (patch.status !== undefined && patch.status !== existing.status) {
      await logActivity({
        project_id: id,
        actor_id: user.id,
        type: "status_changed",
        message: `changed status from ${STATUS_CONFIG[existing.status].label} to ${STATUS_CONFIG[updated.status].label}`,
        meta: { from: existing.status, to: updated.status, fields: changed },
      });
    } else if (changed.length > 0) {
      await logActivity({
        project_id: id,
        actor_id: user.id,
        type: "project_updated",
        message: `updated the ${humanList(changed.map((key) => FIELD_LABELS[key]))}`,
        meta: { fields: changed },
      });
    }
    if (patch.member_ids !== undefined) {
      await logMemberDiff(id, user.id, existing.members, await getProjectMembers(id));
    }

    revalidate();
    return { ok: true, data: updated };
  } catch (error) {
    return failure(error, "Could not save the project. Please try again.");
  }
}

export async function updateProjectStatusAction(
  id: string,
  status: ProjectStatus,
): Promise<ActionResult<Project>> {
  const user = await requireUser();
  const parsed = z.enum(PROJECT_STATUSES).safeParse(status);
  if (!parsed.success) return { ok: false, error: "Choose a valid status." };

  try {
    const existing = await getProject(id);
    if (!existing) return { ok: false, error: NOT_FOUND };
    if (existing.status === parsed.data) return { ok: true, data: existing };

    const updated = await updateProject(id, { status: parsed.data });
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

export async function updateProjectProgressAction(
  id: string,
  progress: number,
): Promise<ActionResult<Project>> {
  const user = await requireUser();
  const parsed = z.number({ error: "Progress must be a number" }).min(0).max(100).safeParse(progress);
  if (!parsed.success) return { ok: false, error: "Progress must be a number between 0 and 100." };
  const value = clampProgress(parsed.data);

  try {
    const existing = await getProject(id);
    if (!existing) return { ok: false, error: NOT_FOUND };
    if (existing.progress === value) return { ok: true, data: existing };

    const updated = await updateProject(id, { progress: value });
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
    await deleteProject(id);
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
