"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { MessageSquare, Trash } from "lucide-react";
import { toast } from "sonner";
import { addTaskCommentAction, deleteCommentAction, listTaskCommentsAction } from "@/actions/comments";
import { MentionText } from "@/components/notifications/mention-text";
import { MentionTextarea } from "@/components/notifications/mention-textarea";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeAgo } from "@/components/ui/time-ago";
import type { Comment } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TaskDrawerSectionProps } from "../drawer-sections";

const MAX_LENGTH = 4000;

/** Task comments: oldest first, delete own (admins any), @mention composer with Ctrl/Cmd+Enter. */
export function TaskCommentsSection({ task, users, viewerId, isAdmin, onChanged }: TaskDrawerSectionProps) {
  const textareaId = useId();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const viewer = users.find((user) => user.id === viewerId) ?? null;

  const load = useCallback(async () => {
    const result = await listTaskCommentsAction(task.id);
    if (result.ok) {
      setComments(result.data);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
  }, [task.id]);

  // Reload when the task changes or someone else's comment arrives with a drawer reload.
  useEffect(() => {
    void load();
  }, [load, task.comment_count]);

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_LENGTH && !pending;

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const result = await addTaskCommentAction(task.id, trimmed);
      if (!result.ok) {
        setError(result.fieldErrors?.body ?? result.error);
        toast.error(result.error);
        return;
      }
      setBody("");
      setComments((current) => [...(current ?? []), result.data]);
      onChanged();
    } catch {
      toast.error("Could not post the comment. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function remove(comment: Comment) {
    const result = await deleteCommentAction(comment.id);
    if (!result.ok) {
      toast.error(result.error);
      throw new Error(result.error);
    }
    setComments((current) => (current ?? []).filter((item) => item.id !== comment.id));
    toast.success("Comment deleted.");
    onChanged();
  }

  return (
    <div className="space-y-4">
      {comments === null ? (
        loadError ? (
          <div className="flex items-center justify-between gap-3 rounded-[12px] border border-dashed border-border px-3 py-3 text-sm text-fg-muted">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-3" aria-busy="true" aria-label="Loading comments">
            <Skeleton className="h-10 w-full rounded-[12px]" />
            <Skeleton className="h-10 w-4/5 rounded-[12px]" />
          </div>
        )
      ) : comments.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-fg-subtle">
          <MessageSquare aria-hidden className="size-4" />
          No comments yet. Start the conversation.
        </p>
      ) : (
        <ol className="space-y-4" aria-label="Comments">
          {comments.map((comment) => {
            const own = comment.user_id === viewerId;
            return (
              <li key={comment.id} id={`comment-${comment.id}`} className="group/comment flex gap-3">
                <UserAvatar user={comment.author} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium text-fg [overflow-wrap:anywhere]">
                        {comment.author.name}
                        {own ? <span className="ml-1 text-xs font-normal text-fg-subtle">(you)</span> : null}
                      </span>
                      <TimeAgo date={comment.created_at} className="text-xs text-fg-muted" />
                    </div>
                    {own || isAdmin ? (
                      <ConfirmDialog
                        title="Delete comment?"
                        description="This removes the comment for everyone. This cannot be undone."
                        confirmLabel="Delete"
                        destructive
                        onConfirm={() => remove(comment)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete comment by ${comment.author.name}`}
                            className={cn(
                              "-my-1 size-7 text-fg-subtle hover:text-danger",
                              "opacity-0 transition-opacity duration-(--dur-2) group-hover/comment:opacity-100 group-focus-within/comment:opacity-100",
                              "data-[state=open]:opacity-100 pointer-coarse:opacity-100",
                            )}
                          >
                            <Trash aria-hidden />
                          </Button>
                        }
                      />
                    ) : null}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-fg [overflow-wrap:anywhere]">
                    <MentionText body={comment.body} />
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <form
        className="flex gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {viewer ? <UserAvatar user={viewer} size="sm" className="mt-1 hidden sm:inline-flex" /> : null}
        <div className="min-w-0 flex-1 space-y-2">
          <label htmlFor={textareaId} className="sr-only">
            Comment on {task.key}
          </label>
          <MentionTextarea
            id={textareaId}
            rows={2}
            value={body}
            users={users}
            onSubmit={() => void submit()}
            placeholder="Write a comment… Type @ to mention someone."
            disabled={pending}
            invalid={error !== null}
            aria-describedby={error ? `${textareaId}-error` : undefined}
            onChange={(value) => {
              setBody(value);
              if (error) setError(null);
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {error ? (
              <p id={`${textareaId}-error`} role="alert" className="text-xs text-danger">
                {error}
              </p>
            ) : trimmed.length > MAX_LENGTH ? (
              <p role="alert" className="text-xs text-danger">
                {trimmed.length - MAX_LENGTH} characters over the limit.
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-fg-subtle pointer-coarse:hidden">
                <Kbd keys="mod+enter" />
                to post.
              </p>
            )}
            <Button type="submit" size="sm" loading={pending} disabled={!canSubmit} className="ml-auto">
              Comment
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
