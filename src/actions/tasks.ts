"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { requireUser } from "@/lib/auth";
import { OPEN_TASK_STATUSES, TASK_STATUS_CONFIG } from "@/lib/constants";
import { logActivity } from "@/lib/data/activity";
import { deleteBlobs } from "@/lib/data/attachments";
import { notifySafely, notifyTaskChanged, notifyTaskCreated } from "@/lib/data/notifications";
import {
  addChecklistItem,
  createTask,
  deleteChecklistItem,
  deleteTask,
  getTask,
  getTaskAccess,
  getTaskByNumber,
  getTaskDetail,
  listTasks,
  moveTask,
  reorderChecklist,
  setBlockedBy,
  setTaskLabels,
  updateChecklistItem,
  updateTask,
} from "@/lib/data/tasks";
import {
  blockedByIdsSchema,
  checklistTitleSchema,
  createTaskSchema,
  moveTaskSchema,
  reorderChecklistSchema,
  searchTaskRefsSchema,
  taskIdSchema,
  taskLabelIdsSchema,
  taskStatusSchema,
  updateChecklistItemSchema,
  updateTaskSchema,
} from "@/lib/schemas/tasks";
import type {
  ActionResult,
  CreateTaskInput,
  LabelSummary,
  MoveTaskInput,
  TaskChecklistItem,
  TaskDetail,
  TaskRef,
  TaskStatus,
  TaskWithMeta,
  UpdateTaskInput,
} from "@/lib/types";
import { parseTaskKey, truncate } from "@/lib/utils";
import { fieldErrorsFromIssues } from "@/lib/validation";

/* -------------------------------- Helpers ------------------------------- */

function revalidate(): void {
  revalidatePath("/", "layout");
}

function invalid<T>(issues: z.core.$ZodIssue[], fallback: string): ActionResult<T> {
  const fieldErrors = fieldErrorsFromIssues(issues);
  const first = Object.values(fieldErrors)[0];
  return { ok: false, error: first ?? fallback, fieldErrors };
}

/**
 * Errors thrown by the data layer with a user-facing message pass through;
 * database errors (they carry a SQLSTATE `code`) become the fallback text.
 */
function failure<T>(scope: string, error: unknown, fallback: string): ActionResult<T> {
  console.error(`${scope} failed`, error);
  if (error instanceof Error && !("code" in error) && error.message) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: fallback };
}

function quoted(title: string): string {
  return `"${truncate(title.replace(/\s+/g, " ").trim(), 80)}"`;
}

function statusLabel(status: TaskStatus): string {
  return TASK_STATUS_CONFIG[status].label;
}

/** "PRX-3", "PRX-3 and PRX-7", "PRX-3, PRX-7 and PRX-9". */
function joinKeys(keys: string[]): string {
  if (keys.length <= 1) return keys.join("");
  return `${keys.slice(0, -1).join(", ")} and ${keys[keys.length - 1]}`;
}

const UPDATE_FIELD_LABELS: Record<keyof UpdateTaskInput, string> = {
  title: "title",
  description: "description",
  status: "status",
  priority: "priority",
  assignee_id: "assignee",
  milestone_id: "phase",
  start_date: "start date",
  due_date: "due date",
  estimate_minutes: "estimate",
  is_deliverable: "deliverable flag",
  approved_by_name: "client approval",
  approved_on: "client approval",
  label_ids: "labels",
};

function sameLabels(before: LabelSummary[], after: LabelSummary[]): boolean {
  if (before.length !== after.length) return false;
  const ids = new Set(before.map((label) => label.id));
  return after.every((label) => ids.has(label.id));
}

/** Which provided keys actually changed between the two snapshots. */
function changedFields(patch: UpdateTaskInput, before: TaskWithMeta, after: TaskWithMeta): (keyof UpdateTaskInput)[] {
  const changed: (keyof UpdateTaskInput)[] = [];
  for (const key of Object.keys(patch) as (keyof UpdateTaskInput)[]) {
    if (patch[key] === undefined) continue;
    if (key === "label_ids") {
      if (!sameLabels(before.labels, after.labels)) changed.push(key);
    } else if (before[key] !== after[key]) {
      changed.push(key);
    }
  }
  return changed;
}

/** One activity row per mutation (SPEC §23.1), most specific type first. */
async function logTaskUpdate(
  actorId: string,
  patch: UpdateTaskInput,
  before: TaskWithMeta,
  after: TaskWithMeta,
): Promise<void> {
  const changed = changedFields(patch, before, after);
  if (changed.length === 0) return;
  const base = { project_id: after.project_id, actor_id: actorId, task_id: after.id };
  const others = [...new Set(changed.filter((key) => key !== "status" && key !== "assignee_id").map((key) => UPDATE_FIELD_LABELS[key]))];
  const extra = others.length > 0 ? ` and updated the ${others.join(", ")}` : "";

  if (changed.includes("status")) {
    const assigneeNote = changed.includes("assignee_id")
      ? after.assignee
        ? `, assigned it to ${after.assignee.name}`
        : ", unassigned it"
      : "";
    await logActivity({
      ...base,
      type: "task_status_changed",
      message: `moved ${after.key} from ${statusLabel(before.status)} to ${statusLabel(after.status)}${assigneeNote}${extra}`,
      meta: { task_key: after.key, from: before.status, to: after.status },
    });
    return;
  }
  if (changed.includes("assignee_id")) {
    await logActivity({
      ...base,
      type: "task_assigned",
      message: after.assignee
        ? `assigned ${after.key} to ${after.assignee.name}${extra}`
        : `unassigned ${after.key}${extra}`,
      meta: { task_key: after.key, from: before.assignee_id, to: after.assignee_id },
    });
    return;
  }
  if (before.approved_by_name === null && after.approved_by_name !== null) {
    await logActivity({
      ...base,
      type: "deliverable_approved",
      message: `recorded client approval of ${after.key} by ${truncate(after.approved_by_name, 80)}`,
      meta: { task_key: after.key, approved_on: after.approved_on },
    });
    return;
  }
  await logActivity({
    ...base,
    type: "task_updated",
    message: `updated the ${others.join(", ")} of ${after.key}`,
    meta: { task_key: after.key, fields: changed },
  });
}

/* -------------------------------- Tasks --------------------------------- */

export async function createTaskAction(input: CreateTaskInput): Promise<ActionResult<TaskWithMeta>> {
  const user = await requireUser();
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues, "Please check the task details.");

  try {
    const task = await createTask(parsed.data, user.id);
    await logActivity({
      project_id: task.project_id,
      actor_id: user.id,
      type: "task_created",
      message: task.parent_task_id
        ? `added subtask ${task.key} ${quoted(task.title)}`
        : `created ${task.key} ${quoted(task.title)}`,
      meta: { task_key: task.key, parent_task_id: task.parent_task_id },
      task_id: task.id,
    });
    await notifySafely("createTaskAction", () => notifyTaskCreated(task, user));
    revalidate();
    return { ok: true, data: task };
  } catch (error) {
    return failure("createTaskAction", error, "Could not create the task. Please try again.");
  }
}

export async function updateTaskAction(id: string, input: UpdateTaskInput): Promise<ActionResult<TaskWithMeta>> {
  const user = await requireUser();
  const parsedId = taskIdSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "This task no longer exists." };
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues, "Please check the task details.");

  try {
    const before = await getTask(parsedId.data);
    if (!before) return { ok: false, error: "This task no longer exists." };
    const after = await updateTask(parsedId.data, parsed.data);
    await logTaskUpdate(user.id, parsed.data, before, after);
    await notifySafely("updateTaskAction", () => notifyTaskChanged(before, after, user));
    revalidate();
    return { ok: true, data: after };
  } catch (error) {
    return failure("updateTaskAction", error, "Could not save the task. Please try again.");
  }
}

/** Keyboard alternative to dragging a card between board columns. */
export async function updateTaskStatusAction(id: string, status: TaskStatus): Promise<ActionResult<TaskWithMeta>> {
  const user = await requireUser();
  const parsedStatus = taskStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { ok: false, error: "Choose a valid status." };

  try {
    const before = await getTask(id);
    if (!before) return { ok: false, error: "This task no longer exists." };
    if (before.status === parsedStatus.data) return { ok: true, data: before };
    const after = await updateTask(id, { status: parsedStatus.data });
    await logActivity({
      project_id: after.project_id,
      actor_id: user.id,
      type: "task_status_changed",
      message: `moved ${after.key} from ${statusLabel(before.status)} to ${statusLabel(after.status)}`,
      meta: { task_key: after.key, from: before.status, to: after.status },
      task_id: after.id,
    });
    await notifySafely("updateTaskStatusAction", () => notifyTaskChanged(before, after, user));
    revalidate();
    return { ok: true, data: after };
  } catch (error) {
    return failure("updateTaskStatusAction", error, "Could not change the status. Please try again.");
  }
}

/** Board drop. Reordering inside a column logs nothing; a column change logs the move. */
export async function moveTaskAction(id: string, input: MoveTaskInput): Promise<ActionResult<TaskWithMeta>> {
  const user = await requireUser();
  const parsed = moveTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues, "That move is not valid.");

  try {
    const before = await getTask(id);
    if (!before) return { ok: false, error: "This task no longer exists." };
    const after = await moveTask(id, parsed.data);
    if (before.status !== after.status) {
      await logActivity({
        project_id: after.project_id,
        actor_id: user.id,
        type: "task_status_changed",
        message: `moved ${after.key} from ${statusLabel(before.status)} to ${statusLabel(after.status)}`,
        meta: { task_key: after.key, from: before.status, to: after.status },
        task_id: after.id,
      });
      await notifySafely("moveTaskAction", () => notifyTaskChanged(before, after, user));
    }
    revalidate();
    return { ok: true, data: after };
  } catch (error) {
    return failure("moveTaskAction", error, "Could not move the task. Please try again.");
  }
}

/** Admins, the task's creator and the project owner may delete a task. */
export async function deleteTaskAction(id: string): Promise<ActionResult<{ project_id: string }>> {
  const user = await requireUser();

  try {
    const access = await getTaskAccess(id);
    if (!access) return { ok: false, error: "This task no longer exists." };
    const allowed = user.role === "admin" || access.created_by === user.id || access.project_owner_id === user.id;
    if (!allowed) {
      return { ok: false, error: "Only admins, the task's reporter or the project owner can delete this task." };
    }

    const deleted = await deleteTask(id);
    // After the commit: remove the cascade's uploaded files from Vercel Blob (never throws).
    await deleteBlobs(deleted.blob_urls);
    await logActivity({
      project_id: deleted.project_id,
      actor_id: user.id,
      type: "task_deleted",
      message: `deleted PRX-${deleted.number} ${quoted(deleted.title)}`,
      meta: { task_key: `PRX-${deleted.number}`, title: deleted.title },
      task_id: id,
    });
    revalidate();
    return { ok: true, data: { project_id: deleted.project_id } };
  } catch (error) {
    return failure("deleteTaskAction", error, "Could not delete the task. Please try again.");
  }
}

/** Drawer and full-page detail. Accepts a task id or a key such as "PRX-12". */
export async function getTaskDetailAction(idOrKey: string): Promise<ActionResult<TaskDetail>> {
  await requireUser();
  const value = typeof idOrKey === "string" ? idOrKey.trim() : "";
  if (!value) return { ok: false, error: "This task no longer exists." };

  try {
    const number = parseTaskKey(value);
    const id = number !== null ? (await getTaskByNumber(number))?.id ?? null : value;
    const detail = id ? await getTaskDetail(id) : null;
    if (!detail) return { ok: false, error: "This task no longer exists." };
    return { ok: true, data: detail };
  } catch (error) {
    return failure("getTaskDetailAction", error, "Could not load the task. Please try again.");
  }
}

/** What the viewer may do with a task (the drawer hides actions it cannot take). Accepts an id or "PRX-n". */
export async function getTaskPermissionsAction(idOrKey: string): Promise<ActionResult<{ canDelete: boolean }>> {
  const user = await requireUser();
  try {
    const value = typeof idOrKey === "string" ? idOrKey.trim() : "";
    const number = parseTaskKey(value);
    const id = number !== null ? (await getTaskByNumber(number))?.id ?? null : value;
    const access = id ? await getTaskAccess(id) : null;
    if (!access) return { ok: false, error: "This task no longer exists." };
    return {
      ok: true,
      data: {
        canDelete: user.role === "admin" || access.created_by === user.id || access.project_owner_id === user.id,
      },
    };
  } catch (error) {
    return failure("getTaskPermissionsAction", error, "Could not load the task. Please try again.");
  }
}

/**
 * Task picker search (blocked-by picker, timer and log-time task pickers).
 * Open tasks only; an exact "PRX-n" match comes first.
 */
export async function searchTaskRefsAction(input: {
  query?: string;
  projectId?: string;
  excludeId?: string;
  limit?: number;
}): Promise<ActionResult<TaskRef[]>> {
  await requireUser();
  const parsed = searchTaskRefsSchema.safeParse(input ?? {});
  if (!parsed.success) return invalid(parsed.error.issues, "Search for a task by title or key.");

  try {
    const { query, projectId, excludeId } = parsed.data;
    const limit = parsed.data.limit ?? 10;
    const tasks = await listTasks({
      search: query || undefined,
      projectId,
      status: OPEN_TASK_STATUSES,
      sort: "updated",
      limit: limit + (excludeId ? 1 : 0),
    });
    const exact = query ? parseTaskKey(query) : null;
    const refs = tasks
      .filter((task) => task.id !== excludeId)
      .sort((a, b) => Number(b.number === exact) - Number(a.number === exact))
      .slice(0, limit)
      .map<TaskRef>((task) => ({
        id: task.id,
        number: task.number,
        key: task.key,
        title: task.title,
        status: task.status,
        project_id: task.project_id,
      }));
    return { ok: true, data: refs };
  } catch (error) {
    return failure("searchTaskRefsAction", error, "Could not search tasks. Please try again.");
  }
}

export async function setTaskLabelsAction(taskId: string, labelIds: string[]): Promise<ActionResult<LabelSummary[]>> {
  const user = await requireUser();
  const parsed = taskLabelIdsSchema.safeParse(labelIds);
  if (!parsed.success) return invalid(parsed.error.issues, "Please check the labels.");

  try {
    const task = await getTask(taskId);
    if (!task) return { ok: false, error: "This task no longer exists." };
    const labels = await setTaskLabels(taskId, parsed.data);
    if (!sameLabels(task.labels, labels)) {
      await logActivity({
        project_id: task.project_id,
        actor_id: user.id,
        type: "task_updated",
        message: `updated the labels of ${task.key}`,
        meta: { task_key: task.key, fields: ["label_ids"] },
        task_id: task.id,
      });
    }
    revalidate();
    return { ok: true, data: labels };
  } catch (error) {
    return failure("setTaskLabelsAction", error, "Could not update the labels. Please try again.");
  }
}

/* ------------------------------- Checklist ------------------------------ */

export async function addChecklistItemAction(taskId: string, title: string): Promise<ActionResult<TaskChecklistItem>> {
  const user = await requireUser();
  const parsed = checklistTitleSchema.safeParse(title);
  if (!parsed.success) return invalid(parsed.error.issues, "Write the checklist item.");

  try {
    const task = await getTask(taskId);
    if (!task) return { ok: false, error: "This task no longer exists." };
    const item = await addChecklistItem(taskId, parsed.data);
    await logActivity({
      project_id: task.project_id,
      actor_id: user.id,
      type: "task_updated",
      message: `added a checklist item to ${task.key}`,
      meta: { task_key: task.key, checklist_item_id: item.id },
      task_id: task.id,
    });
    revalidate();
    return { ok: true, data: item };
  } catch (error) {
    return failure("addChecklistItemAction", error, "Could not add the item. Please try again.");
  }
}

/** Ticking an item logs nothing; renaming it logs one `task_updated`. */
export async function updateChecklistItemAction(
  id: string,
  patch: { title?: string; done?: boolean },
): Promise<ActionResult<TaskChecklistItem>> {
  const user = await requireUser();
  const parsed = updateChecklistItemSchema.safeParse(patch);
  if (!parsed.success) return invalid(parsed.error.issues, "Please check the checklist item.");

  try {
    const item = await updateChecklistItem(id, parsed.data);
    if (parsed.data.title !== undefined) {
      const task = await getTask(item.task_id);
      if (task) {
        await logActivity({
          project_id: task.project_id,
          actor_id: user.id,
          type: "task_updated",
          message: `edited a checklist item on ${task.key}`,
          meta: { task_key: task.key, checklist_item_id: item.id },
          task_id: task.id,
        });
      }
    }
    revalidate();
    return { ok: true, data: item };
  } catch (error) {
    return failure("updateChecklistItemAction", error, "Could not update the item. Please try again.");
  }
}

export async function deleteChecklistItemAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const { task_id } = await deleteChecklistItem(id);
    const task = await getTask(task_id);
    if (task) {
      await logActivity({
        project_id: task.project_id,
        actor_id: user.id,
        type: "task_updated",
        message: `removed a checklist item from ${task.key}`,
        meta: { task_key: task.key },
        task_id: task.id,
      });
    }
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure("deleteChecklistItemAction", error, "Could not remove the item. Please try again.");
  }
}

export async function reorderChecklistAction(taskId: string, orderedIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = reorderChecklistSchema.safeParse(orderedIds);
  if (!parsed.success) return invalid(parsed.error.issues, "Could not reorder the checklist.");

  try {
    const task = await getTask(taskId);
    if (!task) return { ok: false, error: "This task no longer exists." };
    await reorderChecklist(taskId, parsed.data);
    await logActivity({
      project_id: task.project_id,
      actor_id: user.id,
      type: "task_updated",
      message: `reordered the checklist of ${task.key}`,
      meta: { task_key: task.key },
      task_id: task.id,
    });
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure("reorderChecklistAction", error, "Could not reorder the checklist. Please try again.");
  }
}

/* ------------------------------ Dependencies ---------------------------- */

export async function setBlockedByAction(taskId: string, blockedByIds: string[]): Promise<ActionResult<TaskRef[]>> {
  const user = await requireUser();
  const parsed = blockedByIdsSchema.safeParse(blockedByIds);
  if (!parsed.success) return invalid(parsed.error.issues, "Please check the blocking tasks.");

  try {
    const task = await getTask(taskId);
    if (!task) return { ok: false, error: "This task no longer exists." };
    const blockers = await setBlockedBy(taskId, parsed.data, user.id);
    await logActivity({
      project_id: task.project_id,
      actor_id: user.id,
      type: "task_blockers_changed",
      message:
        blockers.length > 0
          ? `marked ${task.key} as blocked by ${joinKeys(blockers.map((blocker) => blocker.key))}`
          : `cleared the blockers of ${task.key}`,
      meta: { task_key: task.key, blocked_by: blockers.map((blocker) => blocker.id) },
      task_id: task.id,
    });
    revalidate();
    return { ok: true, data: blockers };
  } catch (error) {
    return failure("setBlockedByAction", error, "Could not update the blockers. Please try again.");
  }
}
