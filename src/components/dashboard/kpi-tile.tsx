import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { StaggerItem } from "@/components/motion";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { cn } from "@/lib/utils";
import { TILE_RADIUS } from "./bento";

export type KpiTone = "accent" | "violet" | "warning" | "danger" | "neutral";

const TONES: Record<KpiTone, string> = {
  accent: "bg-accent-soft text-accent-soft-fg",
  violet: "bg-accent-2/12 text-accent-2",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-surface-2 text-fg-muted",
};

export interface KpiTileProps {
  label: string;
  value: number;
  /** Intl options for the ticker (e.g. one decimal for hours). */
  format?: Intl.NumberFormatOptions;
  suffix?: string;
  /** One short sentence under the number. */
  caption: ReactNode;
  icon: LucideIcon;
  tone?: KpiTone;
  /** Where the whole tile leads. */
  href: string;
  /** Replaces the icon chip on the right (e.g. a progress ring). */
  visual?: ReactNode;
  /** Highlights the number (e.g. something overdue). */
  alert?: boolean;
  className?: string;
}

/**
 * KPI tile: label, a rolling NumberTicker value and a caption; the whole tile
 * is one link. Lays itself out by its own width (size container), so it reads
 * well 2-up on phones and 4-up on wide screens.
 */
export function KpiTile({
  label,
  value,
  format,
  suffix,
  caption,
  icon: Icon,
  tone = "accent",
  href,
  visual,
  alert = false,
  className,
}: KpiTileProps) {
  return (
    <StaggerItem className={cn("min-w-0", TILE_RADIUS, className)}>
      <SpotlightCard
        className={cn(
          "@container group flex h-full flex-col p-4 sm:p-5",
          "transition-[border-color,box-shadow] duration-(--dur-2) hover:border-border-strong",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-bg",
          TILE_RADIUS,
          alert && "border-danger/35",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <Link
            href={href}
            className="min-w-0 text-sm font-medium leading-5 text-fg-muted outline-none [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-[20px] after:content-[''] group-hover:text-fg"
          >
            {label}
          </Link>
          {visual ?? (
            <span
              aria-hidden
              className={cn("hidden size-8 shrink-0 items-center justify-center rounded-xl @[11rem]:flex", TONES[tone])}
            >
              <Icon className="size-4" />
            </span>
          )}
        </div>
        <p
          className={cn(
            "mt-2 text-[30px] font-semibold leading-9 tracking-[-0.02em] tabular-nums",
            alert ? "text-danger" : "text-fg",
          )}
        >
          <NumberTicker value={value} format={format} suffix={suffix} />
        </p>
        <div className="mt-1 text-xs leading-4 text-fg-muted text-pretty">{caption}</div>
      </SpotlightCard>
    </StaggerItem>
  );
}
