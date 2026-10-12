import { RAG_CONFIG } from "@/lib/constants";
import type { RagHealth } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface RagDotProps {
  /** null = no status update yet (grey "No update"). */
  health: RagHealth | null;
  /** Show the label next to the dot; otherwise it is screen-reader only (and the tooltip title). */
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const NO_UPDATE_LABEL = "No update";

/*
 * Colour never carries the meaning alone: each health also has its own shape
 * (on track = circle, at risk = diamond, off track = rounded square), so the
 * dots stay distinguishable for colour-blind readers even without the label.
 */
const SHAPE: Record<RagHealth | "none", string> = {
  green: "rounded-full",
  amber: "rotate-45 rounded-[1px] scale-[0.82]",
  red: "rounded-[2px]",
  none: "rounded-full",
};

const DOT_SIZE = { sm: "size-2", md: "size-2.5" } as const;
const TEXT_SIZE = { sm: "text-xs", md: "text-sm" } as const;

/**
 * Project health everywhere in the app (cards, rows, board, timeline, client
 * pages, Home). Server-safe; never render a bare coloured dot for health.
 */
export function RagDot({ health, showLabel = false, size = "sm", className }: RagDotProps) {
  const config = health ? RAG_CONFIG[health] : null;
  const label = config ? config.label : NO_UPDATE_LABEL;
  return (
    <span
      title={showLabel ? undefined : config ? `${config.label}: ${config.description}` : NO_UPDATE_LABEL}
      className={cn("inline-flex min-w-0 shrink-0 items-center gap-1.5 align-middle", className)}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-block shrink-0",
          DOT_SIZE[size],
          SHAPE[health ?? "none"],
          config ? config.dotClass : "bg-fg-subtle/60 ring-1 ring-inset ring-fg-subtle/40",
        )}
      />
      <span
        className={cn(
          showLabel ? cn("truncate font-medium", TEXT_SIZE[size], config ? "text-fg" : "text-fg-muted") : "sr-only",
        )}
      >
        {label}
      </span>
    </span>
  );
}
