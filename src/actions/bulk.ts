"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { requireUser } from "@/lib/auth";
import { CLOSED_TASK_STATUSES, PRIORITY_CONFIG, STATUS_CONFIG, TASK_STATUS_CONFIG } from "@/lib/constants";
import { transaction } from "@/lib/db";
import { logActivity } from "@/lib/data/activity";
import { deleteBlobs } from "@/lib/data/attachments";
import { listLabels } from "@/lib/data/labels";
import { getMilestone } from "@/lib/data/milestones";
import { autoSubscribe, notify, notifySafely, taskNotificationUrl } from "@/lib/data/notifications";
import { bulkUpdateProjects, listProjects } from "@/lib/data/projects";
import {
  bulkDeleteTasks,
  bulkUpdateTasks,
  listTaskAccess,
  listTasks,
  listTasksBlockedBy,
  type TaskAccess,
} from "@/lib/data/tasks";
import { getUserById } from "@/lib/data/users";
import { bulkIdsSchema, bulkProjectPatchSchema, bulkTaskPatchSchema } from "@/lib/schemas/bulk";
import type { ActionResult, BulkProjectPatch, BulkResult, BulkTaskPatch, TaskRef, User } from "@/lib/types";
import { formatDate, pluralize, taskKey, truncate } from "@/lib/utils";
import { fieldErrorsFromIssues } from "@/lib/validation";

/*
 * Bulk task and project edits (SPEC §18.4). Each call:
 *   1. re-loads every selected row and re-checks permissions per row,
 *   2. applies the patch in one transaction (data layer),
 *   3. logs ONE summarising activity entry per touched project,
 *   4. sends ONE grouped notification per recipient (assigned, blocker_cleared)
 *      and auto-subscribes new assignees,
 *   5. deletes uploaded blobs after the commit (bulk delete).
 * Commercial fields are never part of a bulk patch (§18 commercial rule).
 */

const COMMERCIAL_ONLY = "Only admins can change commercial fields.";
const COMMERCIAL_KEYS = ["contract_value", "hourly_rate", "price", "invoice_status", "usd_inr_rate", "cost_rate"] as const;
/** Keys listed in a notification body before "and N more". */
const KEYS_IN_BODY = 5;

function revalidate(): void {
  revalidatePath("/", "layout");
}

function invalid<T>(issues: z.core.$ZodIssue[], fallback: string): ActionResult<T> {
  const fieldErrors = fieldErrorsFromIssues(issues);
  const first = Object.values(fieldErrors)[0];
  return { ok: false, error: first ?? fallback, fieldErrors };
}

function failure<T>(scope: string, error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof Error && error.constructor === Error && !("code" in error) && /[.!?]$/.test(error.message)) {
    return { ok: false, error: error.message };
  }
  console.error(`${scope} failed`, error);
  return { ok: false, error: fallback };
}

/** A non-admin sending any admin-only key (even null) is refused; admins can't bulk-edit them either. */
function commercialError(user: User, patch: unknown): string | null {
  if (typeof patch !== "object" || patch === null) return null;
  const sends = COMMERCIAL_KEYS.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
  if (!sends) return null;
  return user.role === "admin" ? "Commercial fields can't be changed in bulk." : COMMERCIAL_ONLY;
}

function quotedList(names: string[]): string {
  const quoted = names.map((name) => `"${truncate(name, 40)}"`);
  if (quoted.length <= 1) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
}

/** "PRX-1, PRX-2, PRX-3 and 4 more". */
function keyList(keys: string[]): string {
  if (keys.length <= KEYS_IN_BODY) {
    if (keys.length <= 1) return keys.join("");
    return `${keys.slice(0, -1).join(", ")} and ${keys[keys.length - 1]}`;
  }
  return `${keys.slice(0, KEYS_IN_BODY).join(", ")} and ${keys.length - KEYS_IN_BODY} more`;
}

/** Resolves label ids to names; unknown ids are a user-facing error. */
async function labelNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const labels = await listLabels();
  const names = new Map(labels.map((label) => [label.id, label.name]));
  if (ids.some((id) => !names.has(id))) throw new Error("One of those labels no longer exists. Refresh and try again.");
  return names;
}

async function activeUserName(id: string, role: "assignee" | "owner"): Promise<string> {
  const person = await getUserById(id);
  if (!person || !person.is_active) {
    throw new Error(role === "assignee" ? "Pick an active team member as the assignee." : "Pick an active team member as the owner.");
  }
  return person.name;
}

function labelParts(patch: { add_label_ids?: string[]; remove_label_ids?: string[] }, names: Map<string, string>): string[] {
  const parts: string[] = [];
  const add = (patch.add_label_ids ?? []).map((id) => names.get(id) ?? "label");
  const remove = (patch.remove_label_ids ?? []).map((id) => names.get(id) ?? "label");
  if (add.length > 0) parts.push(`added ${add.length === 1 ? "the label" : "the labels"} ${quotedList(add)}`);
  if (remove.length > 0) parts.push(`removed ${remove.length === 1 ? "the label" : "the labels"} ${quotedList(remove)}`);
  return parts;
}

/** "status to Done, assignee to Asha, added the label "RAG"" (no amounts, ever). */
async function describeTaskPatch(patch: BulkTaskPatch): Promise<{ parts: string[]; fields: string[] }> {
  const parts: string[] = [];
  const fields: string[] = [];
  if (patch.status !== undefined) {
    parts.push(`status to ${TASK_STATUS_CONFIG[patch.status].label}`);
    fields.push("status");
  }
  if (patch.assignee_id !== undefined) {
    parts.push(patch.assignee_id ? `assignee to ${await activeUserName(patch.assignee_id, "assignee")}` : "assignee cleared");
    fields.push("assignee_id");
  }
  if (patch.priority !== undefined) {
    parts.push(`priority to ${PRIORITY_CONFIG[patch.priority].label}`);
    fields.push("priority");
  }
  if (patch.milestone_id !== undefined) {
    if (patch.milestone_id) {
      const milestone = await getMilestone(patch.milestone_id);
      if (!milestone) throw new Error("That phase no longer exists.");
      parts.push(`phase to ${truncate(milestone.name, 60)}`);
    } else {
      parts.push("phase cleared");
    }
    fields.push("milestone_id");
  }
  if (patch.due_date !== undefined) {
    parts.push(patch.due_date ? `due date to ${formatDate(patch.due_date)}` : "due date cleared");
    fields.push("due_date");
  }
  const names = await labelNames([...(patch.add_label_ids ?? []), ...(patch.remove_label_ids ?? [])]);
  const labels = labelParts(patch, names);
  if (labels.length > 0) {
    parts.push(...labels);
    fields.push("labels");
  }
  return { parts, fields };
}

async function describeProjectPatch(patch: BulkProjectPatch): Promise<{ parts: string[]; fields: string[] }> {
  const parts: string[] = [];
  const fields: string[] = [];
  if (patch.status !== undefined) {
    parts.push(`status to ${STATUS_CONFIG[patch.status].label}`);
    fields.push("status");
  }
  if (patch.owner_id !== undefined) {
    parts.push(patch.owner_id ? `owner to ${await activeUserName(patch.owner_id, "owner")}` : "owner cleared");
    fields.push("owner_id");
  }
  if (patch.priority !== undefined) {
    parts.push(`priority to ${PRIORITY_CONFIG[patch.priority].label}`);
    fields.push("priority");
  }
  const names = await labelNames([...(patch.add_label_ids ?? []), ...(patch.remove_label_ids ?? [])]);
  const labels = labelParts(patch, names);
  if (labels.length > 0) {
    parts.push(...labels);
    fields.push("labels");
  }
  return { parts, fields };
}

function toBulkPatch(data: z.infer<typeof bulkTaskPatchSchema>): BulkTaskPatch {
  const patch: BulkTaskPatch = {};
  if (data.status !== undefined) patch.status = data.status;
  if (data.assignee_id !== undefined) patch.assignee_id = data.assignee_id as string | null;
  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.milestone_id !== undefined) patch.milestone_id = data.milestone_id as string | null;
  if (data.due_date !== undefined) patch.due_date = data.due_date as string | null;
  if (data.add_label_ids && data.add_label_ids.length > 0) patch.add_label_ids = data.add_label_ids;
  if (data.remove_label_ids && data.remove_label_ids.length > 0) patch.remove_label_ids = data.remove_label_ids;
  return patch;
}

function toProjectPatch(data: z.infer<typeof bulkProjectPatchSchema>): BulkProjectPatch {
  const patch: BulkProjectPatch = {};
  if (data.status !== undefined) patch.status = data.status;
  if (data.owner_id !== undefined) patch.owner_id = data.owner_id as string | null;
  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.add_label_ids && data.add_label_ids.length > 0) patch.add_label_ids = data.add_label_ids;
  if (data.remove_label_ids && data.remove_label_ids.length > 0) patch.remove_label_ids = data.remove_label_ids;
  return patch;
}

/** Task ids of `result` grouped by project, in result order. */
function taskIdsByProject(taskIds: string[], access: Map<string, TaskAccess>): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const id of taskIds) {
    const row = access.get(id);
    if (!row) continue;
    const list = grouped.get(row.project_id) ?? [];
    list.push(id);
    grouped.set(row.project_id, list);
  }
  return grouped;
}

/**
 * One `assigned` notification to the new assignee for every task they
 * received, and explicit subscriptions to those tasks.
 */
async function notifyBulkAssigned(
  actor: User,
  assigneeId: string,
  taskIds: string[],
  access: Map<string, TaskAccess>,
): Promise<void> {
  const rows = taskIds.flatMap((id) => {
    const row = access.get(id);
    return row ? [row] : [];
  });
  if (rows.length === 0) return;

  await transaction(async (tx) => {
    for (const row of rows) await autoSubscribe({ type: "task", id: row.task_id }, [assigneeId], tx);
  });
  if (assigneeId === actor.id) return;

  const projects = new Set(rows.map((row) => row.project_id));
  const single = rows.length === 1 ? rows[0] : null;
  await notify({
    recipients: [assigneeId],
    type: "assigned",
    actor_id: actor.id,
    project_id: projects.size === 1 ? rows[0].project_id : null,
    task_id: single ? single.task_id : null,
    title: single
      ? `${actor.name} assigned you ${taskKey(single.number)}`
      : `${actor.name} assigned you ${pluralize(rows.length, "task")}`,
    body: single ? single.title : keyList(rows.map((row) => taskKey(row.number))),
    url: single ? taskNotificationUrl(single.number) : "/tasks",
  });
}

/**
 * `blocker_cleared`, grouped per recipient: every open task blocked by one of
 * the tasks that just became done tells its assignee once, however many of
 * their tasks were unblocked.
 */
async function notifyBulkBlockersCleared(actor: User, completedIds: string[], access: Map<string, TaskAccess>): Promise<void> {
  if (completedIds.length === 0) return;
  const completed = new Set(completedIds);
  const blockedLists = await Promise.all(completedIds.map((id) => listTasksBlockedBy(id)));

  /** blocked task id -> keys of the blockers completed in this call. */
  const blockers = new Map<string, Set<string>>();
  const refs = new Map<string, TaskRef>();
  blockedLists.forEach((list, index) => {
    const doneRow = access.get(completedIds[index]);
    if (!doneRow) return;
    for (const ref of list) {
      if (completed.has(ref.id) || CLOSED_TASK_STATUSES.includes(ref.status)) continue;
      refs.set(ref.id, ref);
      const set = blockers.get(ref.id) ?? new Set<string>();
      set.add(taskKey(doneRow.number));
      blockers.set(ref.id, set);
    }
  });
  if (refs.size === 0) return;

  const blockedTasks = await listTasks({ ids: [...refs.keys()] });
  const byAssignee = new Map<string, typeof blockedTasks>();
  for (const task of blockedTasks) {
    if (!task.assignee_id || CLOSED_TASK_STATUSES.includes(task.status)) continue;
    const list = byAssignee.get(task.assignee_id) ?? [];
    list.push(task);
    byAssignee.set(task.assignee_id, list);
  }

  for (const [assigneeId, tasks] of byAssignee) {
    const doneKeys = [...new Set(tasks.flatMap((task) => [...(blockers.get(task.id) ?? [])]))];
    const single = tasks.length === 1 ? tasks[0] : null;
    const projects = new Set(tasks.map((task) => task.project_id));
    const verb = doneKeys.length === 1 ? "is" : "are";
    await notify({
      recipients: [assigneeId],
      type: "blocker_cleared",
      actor_id: actor.id,
      project_id: projects.size === 1 ? tasks[0].project_id : null,
      task_id: single ? single.id : null,
      title: single
        ? `${keyList(doneKeys)} ${verb} done, so it no longer blocks ${single.key}`
        : `${keyList(doneKeys)} ${verb} done, so ${tasks.length} of your tasks are no longer blocked`,
      body: single ? single.title : keyList(tasks.map((task) => task.key)),
      url: single ? taskNotificationUrl(single.number) : "/tasks",
    });
  }
}

/* -------------------------------- Tasks --------------------------------- */

/**
 * Member: one patch for up to MAX_BULK_IDS tasks (status, assignee, priority,
 * phase, due date, labels added / removed). Tasks deleted since the selection
 * are skipped; when none remain the call fails.
 */
export async function bulkUpdateTasksAction(ids: string[], patch: BulkTaskPatch): Promise<ActionResult<BulkResult>> {
  const user = await requireUser();
  const commercial = commercialError(user, patch);
  if (commercial) return { ok: false, error: commercial };
  const idsParsed = bulkIdsSchema.safeParse(ids);
  if (!idsParsed.success) return invalid(idsParsed.error.issues, "Select at least one task.");
  const parsed = bulkTaskPatchSchema.safeParse(patch);
  if (!parsed.success) return invalid(parsed.error.issues, "Choose a change to apply.");

  try {
    const rows = await listTaskAccess(idsParsed.data);
    if (rows.length === 0) return { ok: false, error: "These tasks no longer exist." };
    const access = new Map(rows.map((row) => [row.task_id, row]));
    const clean = toBulkPatch(parsed.data);
    const { parts, fields } = await describeTaskPatch(clean);

    const result = await bulkUpdateTasks(
      rows.map((row) => row.task_id),
      clean,
    );

    if (result.updated > 0) {
      const grouped = taskIdsByProject(result.task_ids, access);
      await transaction(async (tx) => {
        for (const [projectId, taskIds] of grouped) {
          await logActivity(
            {
              project_id: projectId,
              actor_id: user.id,
              type: "tasks_bulk_updated",
              message: `updated ${pluralize(taskIds.length, "task")}: ${parts.join(", ")}`,
              meta: {
                task_ids: taskIds,
                task_keys: taskIds.map((id) => taskKey(access.get(id)?.number ?? 0)),
                fields,
                count: taskIds.length,
              },
            },
            tx,
          );
        }
      });

      const assigneeId = clean.assignee_id;
      if (assigneeId && result.newly_assigned_ids.length > 0) {
        await notifySafely("bulkUpdateTasksAction", () =>
          notifyBulkAssigned(user, assigneeId, result.newly_assigned_ids, access),
        );
      }
      if (result.completed_ids.length > 0) {
        await notifySafely("bulkUpdateTasksAction", () => notifyBulkBlockersCleared(user, result.completed_ids, access));
      }
    }

    revalidate();
    return { ok: true, data: result };
  } catch (error) {
    return failure("bulkUpdateTasksAction", error, "Could not update the tasks. Please try again.");
  }
}

/**
 * Deletes up to MAX_BULK_IDS tasks (with their subtasks). Every task must be
 * deletable by the viewer (admin, its reporter or the project owner), else
 * nothing is deleted. Uploaded files are removed from Blob after the commit.
 */
export async function bulkDeleteTasksAction(ids: string[]): Promise<ActionResult<BulkResult>> {
  const user = await requireUser();
  const idsParsed = bulkIdsSchema.safeParse(ids);
  if (!idsParsed.success) return invalid(idsParsed.error.issues, "Select at least one task.");

  try {
    const rows = await listTaskAccess(idsParsed.data);
    if (rows.length === 0) return { ok: false, error: "These tasks no longer exist." };
    if (user.role !== "admin") {
      const blocked = rows.filter((row) => row.created_by !== user.id && row.project_owner_id !== user.id);
      if (blocked.length > 0) {
        const keys = keyList(blocked.map((row) => taskKey(row.number)));
        return {
          ok: false,
          error: `You can't delete ${keys}. Only admins, a task's reporter or the project owner can delete it. Nothing was deleted.`,
        };
      }
    }
    const access = new Map(rows.map((row) => [row.task_id, row]));

    const { blob_urls: blobUrls, ...result } = await bulkDeleteTasks(rows.map((row) => row.task_id));
    // After the commit: remove the cascade's uploaded files (never throws).
    await deleteBlobs(blobUrls);

    if (result.updated > 0) {
      const grouped = taskIdsByProject(result.task_ids, access);
      await transaction(async (tx) => {
        for (const [projectId, taskIds] of grouped) {
          const keys = taskIds.map((id) => taskKey(access.get(id)?.number ?? 0));
          await logActivity(
            {
              project_id: projectId,
              actor_id: user.id,
              type: "tasks_bulk_deleted",
              message: `deleted ${pluralize(taskIds.length, "task")}`,
              meta: { task_ids: taskIds, task_keys: keys, count: taskIds.length },
            },
            tx,
          );
        }
      });
    }

    revalidate();
    return { ok: true, data: result };
  } catch (error) {
    return failure("bulkDeleteTasksAction", error, "Could not delete the tasks. Please try again.");
  }
}

/* ------------------------------- Projects ------------------------------- */

/**
 * Member: status, owner, priority and labels for up to MAX_BULK_IDS projects.
 * One `project_updated` entry per changed project; a new owner is subscribed.
 */
export async function bulkUpdateProjectsAction(
  ids: string[],
  patch: BulkProjectPatch,
): Promise<ActionResult<BulkResult>> {
  const user = await requireUser();
  const commercial = commercialError(user, patch);
  if (commercial) return { ok: false, error: commercial };
  const idsParsed = bulkIdsSchema.safeParse(ids);
  if (!idsParsed.success) return invalid(idsParsed.error.issues, "Select at least one project.");
  const parsed = bulkProjectPatchSchema.safeParse(patch);
  if (!parsed.success) return invalid(parsed.error.issues, "Choose a change to apply.");

  try {
    // Re-load the rows (never trust client ids): projects deleted since the selection are skipped.
    const existing = await listProjects({ ids: idsParsed.data });
    if (existing.length === 0) return { ok: false, error: "These projects no longer exist." };
    const clean = toProjectPatch(parsed.data);
    const { parts, fields } = await describeProjectPatch(clean);
    const before = new Map(existing.map((project) => [project.id, project]));

    const result = await bulkUpdateProjects(
      existing.map((project) => project.id),
      clean,
    );

    if (result.updated > 0) {
      await transaction(async (tx) => {
        for (const projectId of result.project_ids) {
          const previous = before.get(projectId);
          await logActivity(
            {
              project_id: projectId,
              actor_id: user.id,
              type: "project_updated",
              message: `updated in bulk: ${parts.join(", ")}`,
              meta: {
                bulk: true,
                fields,
                ...(clean.status !== undefined && previous ? { from: previous.status, to: clean.status } : {}),
              },
            },
            tx,
          );
        }
        const ownerId = clean.owner_id;
        if (ownerId) {
          for (const projectId of result.project_ids) {
            await autoSubscribe({ type: "project", id: projectId }, [ownerId], tx);
          }
        }
      });
    }

    revalidate();
    return { ok: true, data: result };
  } catch (error) {
    return failure("bulkUpdateProjectsAction", error, "Could not update the projects. Please try again.");
  }
}
