"use client";

import type { TaskDrawerSectionProps } from "../drawer-sections";
import { TaskChecklist } from "../task-checklist";

export function TaskChecklistSection({ task, onChanged }: TaskDrawerSectionProps) {
  return <TaskChecklist taskId={task.id} items={task.checklist} onChanged={onChanged} />;
}
