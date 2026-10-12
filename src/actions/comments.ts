"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data/activity";
import { deleteBlobs } from "@/lib/data/attachments";
import { createComment, deleteComment, getComment, listTaskComments } from "@/lib/data/comments";
import { notifyCommentAdded, notifySafely } from "@/lib/data/notifications";
import { getProject } from "@/lib/data/projects";
import { getTask } from "@/lib/data/tasks";
import { taskCommentSchema } from "@/lib/schemas/tasks";
import type { ActionResult, Comment } from "@/lib/types";
import { mentionsToPlainText, truncate } from "@/lib/utils";
import { commentSchema, fieldErrorsFromIssues } from "@/lib/validation";

function revalidate(): void {
  revalidatePath("/", "layout");
}

export async function addCommentAction(
  projectId: string,
  body: string,
): Promise<ActionResult<Comment>> {
  const user = await requireUser();
  const parsed = commentSchema.safeParse({ body });
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFromIssues(parsed.error.issues);
    return { ok: false, error: fieldErrors.body ?? "Please check your comment.", fieldErrors };
  }

  try {
    const project = await getProject(projectId);
    if (!project) return { ok: false, error: "This project no longer exists." };

    const comment = await createComment(projectId, user.id, parsed.data.body);
    // A short single-line excerpt keeps the activity feed readable (mentions as plain "@Name").
    const excerpt = truncate(mentionsToPlainText(comment.body).replace(/\s+/g, " ").trim(), 80);
    await logActivity({
      project_id: projectId,
      actor_id: user.id,
      type: "comment_added",
      message: `commented: "${excerpt}"`,
      meta: { comment_id: comment.id },
    });
    await notifySafely("addCommentAction", () =>
      notifyCommentAdded({ comment, actor: user, task: null, projectName: project.name }),
    );

    revalidate();
    return { ok: true, data: comment };
  } catch (error) {
    console.error("addCommentAction failed", error);
    return { ok: false, error: "Could not post the comment. Please try again." };
  }
}

export async function deleteCommentAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const comment = await getComment(id);
    if (!comment) return { ok: false, error: "This comment no longer exists." };
    if (comment.user_id !== user.id && user.role !== "admin") {
      return { ok: false, error: "You can only delete your own comments." };
    }

    const { blob_urls } = await deleteComment(id);
    // After the commit: remove the comment's uploaded files from Vercel Blob (never throws).
    await deleteBlobs(blob_urls);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("deleteCommentAction failed", error);
    return { ok: false, error: "Could not delete the comment. Please try again." };
  }
}

/* ------------------------------ Task comments ----------------------------- */

/** Comments on a task keep the task's project as project_id and log `comment_added` with task_id. */
export async function addTaskCommentAction(taskId: string, body: string): Promise<ActionResult<Comment>> {
  const user = await requireUser();
  const parsed = taskCommentSchema.safeParse({ body });
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFromIssues(parsed.error.issues);
    return { ok: false, error: fieldErrors.body ?? "Please check your comment.", fieldErrors };
  }

  try {
    const task = await getTask(taskId);
    if (!task) return { ok: false, error: "This task no longer exists." };

    const comment = await createComment(task.project_id, user.id, parsed.data.body, task.id);
    const excerpt = truncate(mentionsToPlainText(comment.body).replace(/\s+/g, " ").trim(), 80);
    await logActivity({
      project_id: task.project_id,
      actor_id: user.id,
      type: "comment_added",
      message: `commented on ${task.key}: "${excerpt}"`,
      meta: { comment_id: comment.id, task_key: task.key },
      task_id: task.id,
    });
    await notifySafely("addTaskCommentAction", () =>
      notifyCommentAdded({ comment, actor: user, task, projectName: task.project.name }),
    );

    revalidate();
    return { ok: true, data: comment };
  } catch (error) {
    console.error("addTaskCommentAction failed", error);
    return { ok: false, error: "Could not post the comment. Please try again." };
  }
}

export async function listTaskCommentsAction(taskId: string): Promise<ActionResult<Comment[]>> {
  await requireUser();
  try {
    return { ok: true, data: await listTaskComments(taskId) };
  } catch (error) {
    console.error("listTaskCommentsAction failed", error);
    return { ok: false, error: "Could not load the comments. Please try again." };
  }
}
