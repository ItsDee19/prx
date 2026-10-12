"use client";

import { useEffect, useRef, useState } from "react";
import { getTaskDetailAction } from "@/actions/tasks";
import type { ProjectSummary, TaskRef } from "@/lib/types";
import { subscribeAppCommands } from "@/lib/utils";
import { LogTimeDialog } from "./log-time-dialog";
import { projectIdFromPath } from "./time-events";

export interface LogTimeDialogHostProps {
  projects: ProjectSummary[];
  /** Workspace today (the default entry date). */
  today: string;
}

interface Prefill {
  projectId?: string;
  taskId?: string | null;
  task?: TaskRef | null;
}

/**
 * Mounted once in GlobalOverlays: handles the `log-time` AppCommand (palette
 * "Log time", buttons that dispatch it) with LogTimeDialog. Without a project
 * in the command, /projects/<id> pages prefill their project; a task id is
 * resolved to its key and title before the dialog opens.
 */
export function LogTimeDialogHost({ projects, today }: LogTimeDialogHostProps) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<Prefill>({});
  const [instance, setInstance] = useState(0);
  const requestRef = useRef(0);

  useEffect(
    () =>
      subscribeAppCommands((command) => {
        if (command.type !== "log-time") return;
        const request = ++requestRef.current;
        const projectId = command.projectId ?? projectIdFromPath(window.location.pathname);
        const show = (task: TaskRef | null) => {
          if (request !== requestRef.current) return;
          setPrefill({ projectId: task?.project_id ?? projectId, taskId: task?.id ?? null, task });
          setInstance((value) => value + 1);
          setOpen(true);
        };
        if (!command.taskId) {
          show(null);
          return;
        }
        getTaskDetailAction(command.taskId)
          .then((result) =>
            show(
              result.ok
                ? {
                    id: result.data.id,
                    number: result.data.number,
                    key: result.data.key,
                    title: result.data.title,
                    status: result.data.status,
                    project_id: result.data.project_id,
                  }
                : null,
            ),
          )
          .catch(() => show(null));
      }),
    [],
  );

  return (
    <LogTimeDialog
      key={instance}
      open={open}
      onOpenChange={setOpen}
      projects={projects}
      defaultProjectId={prefill.projectId}
      defaultTaskId={prefill.taskId}
      defaultTask={prefill.task}
      today={today}
    />
  );
}
