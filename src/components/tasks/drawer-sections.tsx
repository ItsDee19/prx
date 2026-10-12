import type { ComponentType } from "react";
import { TaskAttachmentsSection } from "@/components/attachments/task-attachments-section";
import { TaskTimeSection } from "@/components/time/time-section";
import type { TaskDetail, UserSummary } from "@/lib/types";
import { TaskActivitySection } from "./sections/activity-section";
import { TaskApprovalSection } from "./sections/approval-section";
import { TaskBlockersSection } from "./sections/blockers-section";
import { TaskChecklistSection } from "./sections/checklist-section";
import { TaskCommentsSection } from "./sections/comments-section";
import { TaskDescriptionSection } from "./sections/description-section";
import { TaskPropertiesSection } from "./sections/properties-section";
import { TaskSubtasksSection } from "./sections/subtasks-section";

/**
 * Task drawer sections registry (SPEC.md section 21.3). The drawer and the
 * /tasks/[key] page render every visible entry by `order`; adding a section
 * is one entry. Section components are client components.
 */

export interface TaskDrawerSectionProps {
  task: TaskDetail;
  users: UserSummary[];
  viewerId: string;
  isAdmin: boolean;
  /** Workspace today. */
  today: string;
  /** Vercel Blob uploads are configured (attachments section). */
  blobEnabled: boolean;
  /** Reloads the drawer (and the page data behind it) after a change. */
  onChanged: () => void;
}

export interface TaskDrawerSectionEntry {
  id: string;
  title: string;
  order: number;
  component: ComponentType<TaskDrawerSectionProps>;
  /** Default: always shown. */
  visible?: (task: TaskDetail) => boolean;
  /** Render the title for screen readers only (the content labels itself visually). */
  srOnlyTitle?: boolean;
}

export const TASK_DRAWER_SECTIONS: readonly TaskDrawerSectionEntry[] = [
  { id: "properties", title: "Details", order: 0, component: TaskPropertiesSection, srOnlyTitle: true },
  { id: "description", title: "Description", order: 10, component: TaskDescriptionSection },
  { id: "checklist", title: "Checklist", order: 20, component: TaskChecklistSection },
  { id: "subtasks", title: "Subtasks", order: 30, component: TaskSubtasksSection },
  { id: "blocked-by", title: "Dependencies", order: 40, component: TaskBlockersSection },
  {
    id: "deliverable-approval",
    title: "Client approval",
    order: 50,
    component: TaskApprovalSection,
    visible: (task) => task.is_deliverable,
  },
  { id: "attachments", title: "Attachments", order: 60, component: TaskAttachmentsSection },
  { id: "time", title: "Time", order: 65, component: TaskTimeSection },
  { id: "comments", title: "Comments", order: 70, component: TaskCommentsSection },
  { id: "activity", title: "Activity", order: 90, component: TaskActivitySection },
];

/** Visible sections for a task, by order. */
export function visibleTaskDrawerSections(task: TaskDetail): TaskDrawerSectionEntry[] {
  return [...TASK_DRAWER_SECTIONS]
    .filter((entry) => (entry.visible ? entry.visible(task) : true))
    .sort((a, b) => a.order - b.order);
}
