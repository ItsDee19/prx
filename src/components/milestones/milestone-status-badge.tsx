import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { GATE_DECISION_CONFIG, INVOICE_STATUS_CONFIG, MILESTONE_STATUS_CONFIG } from "@/lib/constants";
import type { GateDecision, InvoiceStatus, MilestoneStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Phase status as a badge: icon + label (colour never carries the meaning alone). */
export function MilestoneStatusBadge({ status, className }: { status: MilestoneStatus; className?: string }) {
  const config = MILESTONE_STATUS_CONFIG[status];
  return (
    <Badge tone={config.tone} className={cn("gap-1", className)}>
      <Icon name={config.icon} className="size-3" />
      {config.label}
    </Badge>
  );
}

/** Gate decision (Go / Extend once / Stop) as a badge. */
export function GateDecisionBadge({ decision, className }: { decision: GateDecision; className?: string }) {
  const config = GATE_DECISION_CONFIG[decision];
  return (
    <Badge tone={config.tone} className={cn("gap-1", className)}>
      <Icon name={config.icon} className="size-3" />
      {config.label}
    </Badge>
  );
}

/** Admin-only invoice status of a phase price. */
export function InvoiceStatusBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  const config = INVOICE_STATUS_CONFIG[status];
  return (
    <Badge tone={config.tone} className={cn("gap-1", className)}>
      <Icon name={config.icon} className="size-3" />
      {config.label}
    </Badge>
  );
}
