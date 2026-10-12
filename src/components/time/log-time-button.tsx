"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import type { ProjectSummary, TaskRef } from "@/lib/types";
import { LogTimeDialog } from "./log-time-dialog";

export interface LogTimeButtonProps {
  projects: ProjectSummary[];
  today: string;
  defaultProjectId?: string;
  defaultTask?: TaskRef | null;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/** A "Log time" button that owns its LogTimeDialog (server pages render it with serialisable props). */
export function LogTimeButton({
  projects,
  today,
  defaultProjectId,
  defaultTask,
  label = "Log time",
  variant = "primary",
  size = "md",
  className,
}: LogTimeButtonProps) {
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => {
          setInstance((value) => value + 1);
          setOpen(true);
        }}
      >
        <Plus aria-hidden />
        {label}
      </Button>
      <LogTimeDialog
        key={instance}
        open={open}
        onOpenChange={setOpen}
        projects={projects}
        today={today}
        defaultProjectId={defaultProjectId}
        defaultTaskId={defaultTask?.id ?? null}
        defaultTask={defaultTask}
      />
    </>
  );
}
