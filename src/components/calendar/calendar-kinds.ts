/**
 * How each calendar item looks: an icon plus a text label for every kind, so
 * colour never carries meaning alone (SPEC §23.6). Milestones split into
 * phases, point milestones and gates (phases that end in a go/no-go review).
 */
import { Diamond, Flag, Gavel, Hourglass, Layers, Rocket, SquareCheckBig, type LucideIcon } from "lucide-react";
import { MILESTONE_STATUS_CONFIG, STATUS_CONFIG, TASK_STATUS_CONFIG } from "@/lib/constants";
import type { CalendarItem } from "@/lib/types";
import { isOverdueOn } from "@/lib/workspace-time";

export type CalendarChipKind = "task" | "phase" | "milestone" | "gate" | "project_due" | "go_live" | "tuning_end";

export interface CalendarChipKindConfig {
  /** Visible in the legend; read before the title by screen readers. */
  label: string;
  icon: LucideIcon;
  iconClass: string;
  /** Chip surface (background + text + hairline ring). */
  chipClass: string;
}

export const CALENDAR_CHIP_KINDS: Record<CalendarChipKind, CalendarChipKindConfig> = {
  task: {
    label: "Task",
    icon: SquareCheckBig,
    iconClass: "text-fg-subtle",
    chipClass: "bg-surface text-fg ring-border hover:ring-border-strong",
  },
  phase: {
    label: "Phase ends",
    icon: Layers,
    iconClass: "text-accent",
    chipClass: "bg-accent-soft text-accent-soft-fg ring-accent/20 hover:ring-accent/40",
  },
  milestone: {
    label: "Milestone",
    icon: Diamond,
    iconClass: "text-accent-2",
    chipClass: "bg-accent-2/10 text-fg ring-accent-2/25 hover:ring-accent-2/45",
  },
  gate: {
    label: "Gate review",
    icon: Gavel,
    iconClass: "text-warning",
    chipClass: "bg-warning/10 text-fg ring-warning/30 hover:ring-warning/50",
  },
  project_due: {
    label: "Project due",
    icon: Flag,
    iconClass: "text-fg-muted",
    chipClass: "bg-surface-2 text-fg ring-border hover:ring-border-strong",
  },
  go_live: {
    label: "Go-live",
    icon: Rocket,
    iconClass: "text-success",
    chipClass: "bg-success/10 text-fg ring-success/25 hover:ring-success/45",
  },
  tuning_end: {
    label: "Tuning ends",
    icon: Hourglass,
    iconClass: "text-accent-3",
    chipClass: "bg-accent-3/10 text-fg ring-accent-3/25 hover:ring-accent-3/45",
  },
};

/** Legend order. */
export const CALENDAR_CHIP_KIND_ORDER: readonly CalendarChipKind[] = [
  "task",
  "phase",
  "milestone",
  "gate",
  "project_due",
  "go_live",
  "tuning_end",
];

export function chipKindOf(item: CalendarItem): CalendarChipKind {
  switch (item.kind) {
    case "milestone":
      if (item.requires_gate || item.status === "gate_review") return "gate";
      return item.milestone_kind === "milestone" ? "milestone" : "phase";
    default:
      return item.kind;
  }
}

/** An open task whose due date is before the workspace today. */
export function isOverdueItem(item: CalendarItem, today: string): boolean {
  return item.kind === "task" && isOverdueOn(item.date, today, item.status === "done" || item.status === "cancelled");
}

/** A finished task, phase or milestone (drawn struck through and muted). */
export function isClosedItem(item: CalendarItem): boolean {
  if (item.kind === "task") return item.status === "done" || item.status === "cancelled";
  if (item.kind === "milestone") return item.status === "done" || item.status === "stopped";
  return false;
}

/** Status text that follows the title for screen readers and the agenda. */
export function itemStatusLabel(item: CalendarItem): string | null {
  switch (item.kind) {
    case "task":
      return TASK_STATUS_CONFIG[item.status].label;
    case "milestone":
      return MILESTONE_STATUS_CONFIG[item.status].label;
    case "project_due":
      return STATUS_CONFIG[item.status].label;
    case "tuning_end":
      return `${item.tuning_days}-day window`;
    default:
      return null;
  }
}

/** One sentence naming the item for links and drag announcements. */
export function describeItem(item: CalendarItem, today: string): string {
  const kind = CALENDAR_CHIP_KINDS[chipKindOf(item)].label;
  const project = item.client_code ? `${item.client_code} · ${item.project_name}` : item.project_name;
  const parts: string[] = [item.kind === "task" ? `${item.task_key} ${item.title}` : `${kind}: ${item.title}`];
  const status = itemStatusLabel(item);
  if (status && item.kind !== "tuning_end") parts.push(status);
  if (isOverdueItem(item, today)) parts.push("overdue");
  if (item.kind === "task" || item.kind === "milestone") parts.push(project);
  if (item.kind === "task") parts.push(item.assignee ? `assigned to ${item.assignee.name}` : "unassigned");
  return parts.join(", ");
}
