"use client";

import { useRouter } from "next/navigation";
import { Link2, Trash } from "lucide-react";
import { toast } from "sonner";
import { deleteTaskAction } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { TaskDetail, UserSummary } from "@/lib/types";
import { TaskDetailView } from "./task-detail-view";
import { taskPageHref } from "./task-helpers";

export interface TaskPageViewProps {
  task: TaskDetail;
  users: UserSummary[];
  viewerId: string;
  isAdmin: boolean;
  today: string;
  blobEnabled: boolean;
}

/** Body of /tasks/[key]: the drawer sections in a two-column page layout; edits refresh the page. */
export function TaskPageView(props: TaskPageViewProps) {
  const router = useRouter();
  return <TaskDetailView {...props} variant="page" onChanged={() => router.refresh()} />;
}

export interface TaskPageActionsProps {
  taskId: string;
  taskKey: string;
  projectId: string;
  canDelete: boolean;
}

/** Copy link and (for admins, the reporter or the project owner) Delete. */
export function TaskPageActions({ taskId, taskKey, projectId, canDelete }: TaskPageActionsProps) {
  const router = useRouter();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${taskPageHref(taskKey)}`);
      toast.success("Link copied.", { duration: 2000 });
    } catch {
      toast.error("Could not copy the link.");
    }
  }

  async function remove() {
    const result = await deleteTaskAction(taskId);
    if (!result.ok) {
      toast.error(result.error);
      throw new Error(result.error);
    }
    toast.success(`${taskKey} deleted.`);
    router.push(`/projects/${projectId}?tab=tasks`);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" onClick={() => void copyLink()}>
        <Link2 aria-hidden />
        Copy link
      </Button>
      {canDelete ? (
        <ConfirmDialog
          title={`Delete ${taskKey}?`}
          description="This deletes the task with its subtasks, checklist, comments and attachments. Logged time stays on the project. This cannot be undone."
          confirmLabel="Delete task"
          destructive
          onConfirm={remove}
          trigger={
            <Button variant="ghost" size="icon" aria-label={`Delete ${taskKey}`} className="hover:text-danger">
              <Trash aria-hidden />
            </Button>
          }
        />
      ) : null}
    </>
  );
}
