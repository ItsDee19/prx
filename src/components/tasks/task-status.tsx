import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { TASK_STATUS_CONFIG } from "@/lib/constants";
import type { TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Icon colour per task status (the label always travels with it as text or aria-label). */
export const TASK_STATUS_ICON_CLASS: Record<TaskStatus, string> = {
  todo: "text-fg-subtle",
  in_progress: "text-accent",
  in_review: "text-accent-2",
  done: "text-success",
  cancelled: "text-fg-subtle/70",
};

export interface TaskStatusIconProps {
  status: TaskStatus;
  className?: string;
  /** Accessible name; omit when a visible label sits next to the icon. */
  label?: string;
}

export function TaskStatusIcon({ status, className, label }: TaskStatusIconProps) {
  const config = TASK_STATUS_CONFIG[status];
  return <Icon name={config.icon} label={label} className={cn(TASK_STATUS_ICON_CLASS[status], className)} />;
}

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const config = TASK_STATUS_CONFIG[status];
  return (
    <Badge tone={config.tone} className={cn("gap-1 pl-1", className)}>
      <TaskStatusIcon status={status} className="size-3.5" />
      {config.label}
    </Badge>
  );
}

/** "PRX-142" in the mono face. */
export function TaskKey({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("shrink-0 font-mono text-[11px] font-medium tracking-tight text-fg-subtle tabular-nums", className)}>
      {value}
    </span>
  );
}
