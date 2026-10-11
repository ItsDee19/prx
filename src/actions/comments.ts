"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data/activity";
import { createComment, deleteComment, getComment } from "@/lib/data/comments";
import { getProject } from "@/lib/data/projects";
import type { ActionResult, Comment } from "@/lib/types";
import { truncate } from "@/lib/utils";
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
    if (!getProject(projectId)) return { ok: false, error: "This project no longer exists." };

    const comment = createComment(projectId, user.id, parsed.data.body);
    // A short single-line excerpt keeps the activity feed readable.
    const excerpt = truncate(comment.body.replace(/\s+/g, " ").trim(), 80);
    logActivity({
      project_id: projectId,
      actor_id: user.id,
      type: "comment_added",
      message: `commented: "${excerpt}"`,
      meta: { comment_id: comment.id },
    });

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
    const comment = getComment(id);
    if (!comment) return { ok: false, error: "This comment no longer exists." };
    if (comment.user_id !== user.id && user.role !== "admin") {
      return { ok: false, error: "You can only delete your own comments." };
    }

    deleteComment(id);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("deleteCommentAction failed", error);
    return { ok: false, error: "Could not delete the comment. Please try again." };
  }
}
