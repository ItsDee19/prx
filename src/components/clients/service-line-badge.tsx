import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { SERVICE_LINE_CONFIG } from "@/lib/constants";
import type { ServiceLine } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ServiceLineBadgeProps {
  value: ServiceLine;
  /** Icon in a small tile with the label in a tooltip (and for screen readers). */
  iconOnly?: boolean;
  className?: string;
}

/** Tone classes for the icon-only tile (mirrors the Badge tones, light + dark). */
const TILE_TONES = {
  neutral: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-300 dark:ring-zinc-400/25",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/25",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/25",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/25",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/25",
} as const;

/**
 * The project's service line (AI agents, Avlys Data, ...): icon + label, or
 * an icon tile with a tooltip. Every surface shows the service line with this
 * component so the icon and colour stay consistent.
 */
export function ServiceLineBadge({ value, iconOnly = false, className }: ServiceLineBadgeProps) {
  const config = SERVICE_LINE_CONFIG[value];
  if (iconOnly) {
    return (
      <Tooltip content={config.label}>
        <span
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
            TILE_TONES[config.tone],
            className,
          )}
        >
          <Icon name={config.icon} className="size-3" aria-hidden />
          <span className="sr-only">Service line: {config.label}</span>
        </span>
      </Tooltip>
    );
  }
  return (
    <Badge tone={config.tone} className={cn("gap-1", className)}>
      <Icon name={config.icon} className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{config.label}</span>
    </Badge>
  );
}
