import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { addDaysISO, startOfWeekISO } from "@/lib/workspace-time";

export interface TimeWeekNavProps {
  /** Monday of the shown week. */
  weekStart: string;
  /** Workspace today. */
  today: string;
  /** Query string pieces kept on every link (e.g. tab and user). */
  baseParams: Record<string, string>;
  className?: string;
}

function hrefFor(baseParams: Record<string, string>, week: string | null): string {
  const params = new URLSearchParams(baseParams);
  if (week) params.set("week", week);
  else params.delete("week");
  const query = params.toString();
  return query ? `/time?${query}` : "/time";
}

/** "Oct 12 – 18, 2026" / "Sep 28 – Oct 4, 2026" / "Dec 28, 2026 – Jan 3, 2027" for a Monday-based week. */
export function weekRangeLabel(weekStart: string): string {
  const end = addDaysISO(weekStart, 6);
  const startYear = weekStart.slice(0, 4);
  const endYear = end.slice(0, 4);
  const endDay = Number(end.slice(8, 10));
  if (startYear !== endYear) {
    return `${formatDate(weekStart)} – ${formatDate(end)}`;
  }
  const startText = formatDate(weekStart, { month: "short", day: "numeric" });
  const endText =
    weekStart.slice(0, 7) === end.slice(0, 7) ? String(endDay) : formatDate(end, { month: "short", day: "numeric" });
  return `${startText} – ${endText}, ${endYear}`;
}

/** Previous / This week / Next links for the Monday-based week (workspace timezone). Server-safe. */
export function TimeWeekNav({ weekStart, today, baseParams, className }: TimeWeekNavProps) {
  const thisWeek = startOfWeekISO(today);
  const isThisWeek = weekStart === thisWeek;
  return (
    <nav aria-label="Week" className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-1">
        <Link
          href={hrefFor(baseParams, addDaysISO(weekStart, -7))}
          className={buttonVariants({ variant: "outline", size: "icon", className: "size-9" })}
          aria-label="Previous week"
          scroll={false}
        >
          <ChevronLeft />
        </Link>
        <Link
          href={hrefFor(baseParams, addDaysISO(weekStart, 7))}
          className={buttonVariants({ variant: "outline", size: "icon", className: "size-9" })}
          aria-label="Next week"
          scroll={false}
        >
          <ChevronRight />
        </Link>
      </div>
      <h2 className="min-w-0 text-base font-semibold tabular-nums text-fg" aria-live="polite">
        {weekRangeLabel(weekStart)}
      </h2>
      {isThisWeek ? (
        <span className="text-xs font-medium text-accent">This week</span>
      ) : (
        <Link
          href={hrefFor(baseParams, null)}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          scroll={false}
        >
          Back to this week
        </Link>
      )}
    </nav>
  );
}
