"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare, Trash2 } from "lucide-react";
import { MentionText } from "@/components/notifications/mention-text";
import { MentionTextarea } from "@/components/notifications/mention-textarea";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TimeAgo } from "@/components/ui/time-ago";
import { addCommentAction, deleteCommentAction } from "@/actions/comments";
import type { Comment, Role, UserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface CommentsSectionProps {
  projectId: string;
  comments: Comment[];
  viewer: { id: string; name: string; color: string; role: Role };
  /** Active users offered by the @mention picker. */
  users: UserSummary[];
}

const MAX_LENGTH = 4000;

export function CommentsSection({ projectId, comments, viewer, users }: CommentsSectionProps) {
  const router = useRouter();
  const textareaId = useId();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_LENGTH && !pending;

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const result = await addCommentAction(projectId, trimmed);
      if (!result.ok) {
        setError(result.fieldErrors?.body ?? result.error);
        toast.error(result.error);
        return;
      }
      setBody("");
      toast.success("Comment posted");
      router.refresh();
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
    toast.success("Comment deleted");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {comments.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-8 text-center">
          <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-surface-2 text-fg-muted">
            <MessageSquare className="size-5" aria-hidden />
          </div>
          <p className="text-sm font-medium text-fg">No comments yet</p>
          <p className="mt-1 text-sm text-fg-muted">Start the conversation below.</p>
        </div>
      ) : (
        <ol className="space-y-4" aria-label="Comments">
          {comments.map((comment) => {
            const own = comment.user_id === viewer.id;
            const canDelete = own || viewer.role === "admin";
            return (
              <li key={comment.id} id={`comment-${comment.id}`} className="group flex scroll-mt-24 gap-3">
                <UserAvatar user={comment.author} size="md" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="min-w-0 text-sm font-medium text-fg [overflow-wrap:anywhere]">
                        {comment.author.name}
                        {own ? <span className="ml-1 text-xs font-normal text-fg-subtle">(you)</span> : null}
                      </span>
                      <TimeAgo date={comment.created_at} className="text-xs text-fg-muted" />
                    </div>
                    {canDelete ? (
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
                            className={cn(
                              // The negative margin keeps the 20px name line; Button adds a 40px touch hit area.
                              "-my-1 size-7 text-fg-subtle transition-opacity duration-150 hover:text-danger",
                              // Hover/focus reveal with a mouse; always visible on touch screens and
                              // while its confirmation dialog is open.
                              "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                              "data-[state=open]:opacity-100 pointer-coarse:opacity-100",
                            )}
                            aria-label={`Delete comment by ${comment.author.name}`}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        }
                      />
                    ) : null}
                  </div>
                  {/* Capped line length for reading on wide screens; long words and URLs wrap. */}
                  <p className="mt-1 max-w-[80ch] whitespace-pre-wrap text-sm leading-6 text-fg [overflow-wrap:anywhere]">
                    <MentionText body={comment.body} />
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <form
        className="flex gap-3 border-t border-border pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <UserAvatar user={viewer} size="md" className="mt-0.5 hidden sm:inline-flex" />
        <div className="min-w-0 flex-1 space-y-2">
          <label htmlFor={textareaId} className="sr-only">
            Add a comment
          </label>
          <MentionTextarea
            id={textareaId}
            value={body}
            users={users}
            onSubmit={() => void submit()}
            rows={3}
            placeholder="Write a comment… Type @ to mention someone."
            maxLength={MAX_LENGTH + 500}
            disabled={pending}
            invalid={error !== null}
            aria-describedby={error ? `${textareaId}-error` : `${textareaId}-hint`}
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
            ) : (
              <p
                id={`${textareaId}-hint`}
                className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle"
              >
                {/* Touch keyboards have no Ctrl/Cmd key: hide the shortcut hint there. */}
                <span className="pointer-coarse:hidden">
                  <kbd className="rounded border border-border bg-surface-2 px-1 py-0.5 font-sans text-[10px] text-fg-muted">
                    Ctrl
                  </kbd>
                  {" + "}
                  <kbd className="rounded border border-border bg-surface-2 px-1 py-0.5 font-sans text-[10px] text-fg-muted">
                    Enter
                  </kbd>{" "}
                  to post
                </span>
                {trimmed.length > MAX_LENGTH ? (
                  <span className="text-danger">
                    {trimmed.length - MAX_LENGTH} characters over the limit
                  </span>
                ) : null}
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
