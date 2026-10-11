import { Badge } from "@/components/ui/badge";
import { STATUS_CONFIG } from "@/lib/constants";
import type { ProjectStatus } from "@/lib/types";

export interface StatusBadgeProps {
  status: ProjectStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge tone={config.tone} dot dotClassName={config.dotClass} className={className}>
      {config.label}
    </Badge>
  );
}
