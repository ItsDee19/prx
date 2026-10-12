import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { cn } from "@/lib/utils";

/** Bento tiles are 20px (content cards are 16px). */
export const TILE_RADIUS = "rounded-[20px]";

/**
 * The Home bento grid: one column on phones, two from `md`, three from `xl`
 * and four from `3xl`. Tiles rise in one after another on first mount (35ms
 * steps, capped at 8; static with reduced motion).
 */
export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Stagger
      as="section"
      className={cn("grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4", className)}
    >
      {children}
    </Stagger>
  );
}

export interface BentoTileProps {
  /** Stable id: the heading gets `${id}-title` for the section's accessible name. */
  id: string;
  title: string;
  description?: ReactNode;
  icon: LucideIcon;
  /** Tint of the icon chip. */
  iconClassName?: string;
  /** "View all" style link in the header. */
  action?: { href: string; label: string };
  /** Extra header content (counts, badges) shown under the title row. */
  meta?: ReactNode;
  /** Grid placement (col/row spans) of the tile. */
  className?: string;
  /** Classes of the tile body. */
  bodyClassName?: string;
  /** Rotating conic border (gates awaiting a decision). */
  highlight?: boolean;
  children: ReactNode;
}

/**
 * One bento tile: a SpotlightCard (cursor spotlight on fine pointers) with an
 * icon chip, a title, an optional description and header link, and a body
 * that fills the tile's height.
 */
export function BentoTile({
  id,
  title,
  description,
  icon: Icon,
  iconClassName,
  action,
  meta,
  className,
  bodyClassName,
  highlight = false,
  children,
}: BentoTileProps) {
  const titleId = `${id}-title`;
  return (
    <StaggerItem className={cn("min-w-0", TILE_RADIUS, highlight && "conic-border", className)}>
      <SpotlightCard
        as="section"
        aria-labelledby={titleId}
        className={cn("flex h-full flex-col", TILE_RADIUS, highlight && "border-transparent")}
      >
        <header className="flex items-start gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <span
            aria-hidden
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg",
              iconClassName,
            )}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold leading-6 tracking-[-0.011em] text-fg">
              {title}
            </h2>
            {description ? (
              <div className="mt-0.5 text-sm text-fg-muted text-pretty [overflow-wrap:anywhere]">{description}</div>
            ) : null}
          </div>
          {action ? <TileLink href={action.href} label={action.label} className="mt-1" /> : null}
        </header>
        {meta ? <div className="px-4 pb-3 sm:px-5">{meta}</div> : null}
        <div className={cn("flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-5 sm:pb-5", bodyClassName)}>{children}</div>
      </SpotlightCard>
    </StaggerItem>
  );
}

/** Small accent link ("View all →"). */
export function TileLink({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "relative z-10 -mr-1 inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full px-1.5 text-[13px] font-medium text-accent",
        "transition-colors duration-(--dur-2) hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "pointer-coarse:min-h-10",
        className,
      )}
    >
      {label}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

export interface TileEmptyProps {
  icon: LucideIcon;
  title: string;
  /** Teaches where the data comes from. */
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Compact empty state for a tile: short title, a sentence that teaches, an optional action. */
export function TileEmpty({ icon: Icon, title, description, action, className }: TileEmptyProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-start justify-center rounded-2xl border border-dashed border-border bg-surface-2/40 px-4 py-5",
        className,
      )}
    >
      <span
        aria-hidden
        className="mb-3 flex size-9 items-center justify-center rounded-xl border border-border bg-surface text-accent shadow-card"
      >
        <Icon className="size-4" />
      </span>
      <p className="text-sm font-semibold text-fg [overflow-wrap:anywhere]">{title}</p>
      <p className="mt-1 max-w-prose text-sm text-fg-muted text-pretty [overflow-wrap:anywhere]">{description}</p>
      {action ? <div className="mt-4 flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

/**
 * Row of a tile list whose main link is stretched over the whole row (large
 * touch target); controls placed after it need `relative z-10`.
 */
export const TILE_ROW_CLASS =
  "relative flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-(--dur-2) hover:bg-surface-2/70";

/** The stretched main link of a TILE_ROW_CLASS row. */
export const TILE_ROW_LINK_CLASS = cn(
  "block min-w-0 truncate text-sm font-medium text-fg outline-none transition-colors duration-(--dur-2) hover:text-accent",
  "after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring",
);

/** Muted "+N more" footer under a capped list. */
export function MoreLink({ count, href, noun }: { count: number; href: string; noun: string }) {
  if (count <= 0) return null;
  return (
    <div className="mt-2 border-t border-border pt-2">
      <TileLink href={href} label={`${count} more ${noun}`} className="-ml-1.5" />
    </div>
  );
}
