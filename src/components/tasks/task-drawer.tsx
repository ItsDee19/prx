"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, ExternalLink, Link2, Trash } from "lucide-react";
import { toast } from "sonner";
import { getWatchStateAction } from "@/actions/notifications";
import { deleteTaskAction, getTaskDetailAction, getTaskPermissionsAction } from "@/actions/tasks";
import { WatchButton } from "@/components/notifications/watch-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import type { TaskDetail, UserSummary } from "@/lib/types";
import { TaskDetailView } from "./task-detail-view";
import { taskPageHref } from "./task-helpers";

export interface TaskDrawerProps {
  /** "PRX-12" (or a task id); null closes the drawer. */
  taskKey: string | null;
  onOpenChange: (open: boolean) => void;
  users: UserSummary[];
  viewerId: string;
  isAdmin: boolean;
  /** Workspace today. */
  today: string;
  blobEnabled: boolean;
}

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "number", "date", "password"]);

function isTextField(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable || element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type);
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; task: TaskDetail; canDelete: boolean };

/**
 * The task drawer: a right-hand Sheet (520px) from `sm`, a bottom sheet on
 * phones. Loads the task with getTaskDetailAction and renders the drawer
 * sections registry; every change reloads it and refreshes the page behind.
 */
export function TaskDrawer({ taskKey, onOpenChange, users, viewerId, isAdmin, today, blobEnabled }: TaskDrawerProps) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  /** Last key shown, so the closing animation keeps its content. */
  const [shownKey, setShownKey] = useState<string | null>(taskKey);
  if (taskKey !== null && taskKey !== shownKey) setShownKey(taskKey);
  const requestId = useRef(0);
  /** The viewer's watch state for the loaded task (fetched once the detail is in). */
  const [watch, setWatch] = useState<{ taskId: string; watching: boolean } | null>(null);

  const load = useCallback(async (key: string, quiet: boolean) => {
    const id = ++requestId.current;
    if (!quiet) setState({ kind: "loading" });
    const [detail, permissions] = await Promise.all([getTaskDetailAction(key), getTaskPermissionsAction(key)]);
    if (id !== requestId.current) return;
    if (!detail.ok) {
      setState({ kind: "error", message: detail.error });
      return;
    }
    setState({ kind: "ready", task: detail.data, canDelete: permissions.ok && permissions.data.canDelete });
    const taskId = detail.data.id;
    const watchState = await getWatchStateAction({ type: "task", id: taskId });
    if (id !== requestId.current) return;
    if (watchState.ok) setWatch({ taskId, watching: watchState.data.watching });
  }, []);

  useEffect(() => {
    if (taskKey) void load(taskKey, false);
  }, [taskKey, load]);

  /**
   * Escape in a text field of the drawer cancels that edit (or leaves the
   * field) instead of closing the drawer and losing what was typed. Radix
   * listens on the document in the capture phase and skips dismissal for
   * events that are already default-prevented, so mark them here first;
   * the field's own Escape handling still runs. A second Escape closes.
   */
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (taskKey === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      const field = document.activeElement;
      if (!isTextField(field) || !bodyRef.current?.contains(field)) return;
      event.preventDefault();
      requestAnimationFrame(() => {
        if (document.activeElement === field) field.blur();
      });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [taskKey]);

  const refresh = useCallback(() => {
    if (shownKey) void load(shownKey, true);
    router.refresh();
  }, [load, router, shownKey]);

  async function copyLink(key: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${taskPageHref(key)}`);
      toast.success("Link copied.", { duration: 2000 });
    } catch {
      toast.error("Could not copy the link.");
    }
  }

  async function remove(task: TaskDetail) {
    const result = await deleteTaskAction(task.id);
    if (!result.ok) {
      toast.error(result.error);
      throw new Error(result.error);
    }
    toast.success(`${task.key} deleted.`);
    onOpenChange(false);
    router.refresh();
  }

  const task = state.kind === "ready" ? state.task : null;
  const key = task?.key ?? shownKey ?? "Task";

  return (
    <Sheet open={taskKey !== null} onOpenChange={onOpenChange}>
      <SheetContent
        title={key}
        description={task ? task.project.name : undefined}
        headerActions={
          task ? (
            <>
              {watch && watch.taskId === task.id ? (
                <WatchButton
                  key={task.id}
                  entity={{ type: "task", id: task.id }}
                  initialWatching={watch.watching}
                  iconOnly
                />
              ) : null}
              <Tooltip content="Copy link">
                <Button variant="ghost" size="icon" className="size-8" aria-label="Copy link" onClick={() => void copyLink(task.key)}>
                  <Link2 aria-hidden />
                </Button>
              </Tooltip>
              <Tooltip content="Open full page">
                <Link
                  href={taskPageHref(task.key)}
                  aria-label="Open full page"
                  className={buttonVariants({ variant: "ghost", size: "icon", className: "size-8" })}
                >
                  <ExternalLink aria-hidden />
                </Link>
              </Tooltip>
              {state.kind === "ready" && state.canDelete ? (
                <ConfirmDialog
                  title={`Delete ${task.key}?`}
                  description="This deletes the task with its subtasks, checklist, comments and attachments. Logged time stays on the project. This cannot be undone."
                  confirmLabel="Delete task"
                  destructive
                  onConfirm={() => remove(task)}
                  trigger={
                    <Button variant="ghost" size="icon" className="size-8 hover:text-danger" aria-label={`Delete ${task.key}`}>
                      <Trash aria-hidden />
                    </Button>
                  }
                />
              ) : null}
            </>
          ) : null
        }
      >
        <div ref={bodyRef} className="min-w-0">
          {state.kind === "loading" ? (
            <div className="space-y-5" aria-busy="true" aria-label="Loading task">
              <div className="space-y-2">
                <Skeleton className="h-3 w-40 rounded-full" />
                <Skeleton className="h-7 w-4/5 rounded-[10px]" />
              </div>
              <div className="space-y-2.5">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="grid grid-cols-[7rem_1fr] items-center gap-3">
                    <Skeleton className="h-4 w-20 rounded-full" />
                    <Skeleton className="h-7 w-40 rounded-full" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-20 w-full rounded-[12px]" />
            </div>
          ) : state.kind === "error" ? (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
              <CircleAlert aria-hidden className="size-6 text-fg-subtle" />
              <p className="text-sm font-medium text-fg">{state.message}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                {shownKey ? (
                  <Button size="sm" onClick={() => void load(shownKey, false)}>
                    Try again
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <TaskDetailView
              task={state.task}
              users={users}
              viewerId={viewerId}
              isAdmin={isAdmin}
              today={today}
              blobEnabled={blobEnabled}
              onChanged={refresh}
              variant="drawer"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
