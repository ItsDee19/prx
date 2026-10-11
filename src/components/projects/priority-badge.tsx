import { AlertTriangle, ArrowDown, ArrowUp, Minus, type LucideIcon } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { PRIORITY_CONFIG } from "@/lib/constants";
import type { Priority } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<Priority, LucideIcon> = {
  low: ArrowDown,
  medium: Minus,
  high: ArrowUp,
  urgent: AlertTriangle,
};

export interface PriorityBadgeProps {
  priority: Priority;
  /** Show only the icon; the label moves into a tooltip and sr-only text. */
  iconOnly?: boolean;
  className?: string;
}

export function PriorityBadge({ priority, iconOnly = false, className }: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority];
  const Icon = ICONS[priority];
  const label = `${config.label} priority`;

  if (iconOnly) {
    return (
      <Tooltip content={label}>
        <span
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded",
            config.iconClass,
            className,
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </span>
      </Tooltip>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-fg-muted",
        className,
      )}
      title={label}
    >
      <Icon className={cn("size-3.5 shrink-0", config.iconClass)} aria-hidden />
      {config.label}
    </span>
  );
}
