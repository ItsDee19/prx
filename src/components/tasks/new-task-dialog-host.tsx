"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { ProjectSummary, UserSummary } from "@/lib/types";
import { subscribeAppCommands } from "@/lib/utils";
import { NewTaskForm, type NewTaskPrefill } from "./new-task-dialog";

export interface NewTaskDialogHostProps {
  users: UserSummary[];
  projects: ProjectSummary[];
}

/** /projects/<id> pages prefill their project when the command does not name one. */
function projectIdFromPath(pathname: string): string | undefined {
  return /^\/projects\/([^/?#]+)/.exec(pathname)?.[1];
}

/**
 * Mounted once in GlobalOverlays: handles the `new-task` AppCommand (New task
 * buttons, the "c" shortcut, the command palette) with a dialog prefilled with
 * the command's project, status, due date and phase.
 */
export function NewTaskDialogHost({ users, projects }: NewTaskDialogHostProps) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<NewTaskPrefill>({});
  /** Bumped per open so every opening starts from a fresh form. */
  const [instance, setInstance] = useState(0);

  useEffect(
    () =>
      subscribeAppCommands((command) => {
        if (command.type !== "new-task") return;
        const fromPath = projectIdFromPath(window.location.pathname);
        setPrefill({
          projectId: command.projectId ?? fromPath,
          status: command.status,
          dueDate: command.dueDate,
          milestoneId: command.milestoneId,
        });
        setInstance((value) => value + 1);
        setOpen(true);
      }),
    [],
  );

  const project = projects.find((item) => item.id === prefill.projectId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="New task"
        description={project ? `In ${project.name}.` : "Add a task to a project."}
        size="lg"
      >
        <NewTaskForm key={instance} users={users} projects={projects} prefill={prefill} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
