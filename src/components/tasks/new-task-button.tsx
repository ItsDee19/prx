"use client";

import { Plus } from "lucide-react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import type { TaskStatus } from "@/lib/types";
import { dispatchAppCommand } from "@/lib/utils";

export interface NewTaskButtonProps {
  projectId?: string;
  status?: TaskStatus;
  milestoneId?: string;
  dueDate?: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/** Opens the global New task dialog (NewTaskDialogHost) with optional prefills. */
export function NewTaskButton({
  projectId,
  status,
  milestoneId,
  dueDate,
  label = "New task",
  variant = "primary",
  size = "md",
  className,
}: NewTaskButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={() => dispatchAppCommand({ type: "new-task", projectId, status, milestoneId, dueDate })}
    >
      <Plus aria-hidden />
      {label}
    </Button>
  );
}
