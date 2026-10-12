import { Lock } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { ClientSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ClientChipProps {
  client: ClientSummary;
  /** Also show the client name after the code (detail headers, wide rows). */
  showName?: boolean;
  className?: string;
}

/**
 * The client's short code on its colour ("HOSP"), the one way every surface
 * shows which client a project or task belongs to. Confidential clients get a
 * lock icon with a label. Not a link (cards and rows are links already).
 */
export function ClientChip({ client, showName = false, className }: ClientChipProps) {
  const tooltip = client.confidential ? `${client.name} (confidential)` : client.name;
  return (
    <Tooltip content={showName ? (client.confidential ? "Confidential client" : null) : tooltip}>
      <span
        className={cn(
          "inline-flex h-5 min-w-0 max-w-full shrink-0 items-center gap-1 rounded-full bg-surface-2 pl-1 pr-2 text-[11px] font-semibold leading-none text-fg ring-1 ring-inset ring-border",
          className,
        )}
      >
        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: client.color }} />
        <span className="font-mono tracking-tight">{client.code}</span>
        {showName ? <span className="min-w-0 truncate font-medium text-fg-muted">{client.name}</span> : null}
        {client.confidential ? (
          <>
            <Lock className="size-3 shrink-0 text-fg-muted" aria-hidden />
            <span className="sr-only">(confidential)</span>
          </>
        ) : null}
        {showName ? null : <span className="sr-only">: {client.name}</span>}
      </span>
    </Tooltip>
  );
}
