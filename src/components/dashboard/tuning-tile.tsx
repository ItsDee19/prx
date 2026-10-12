import Link from "next/link";
import { Hourglass } from "lucide-react";
import { ProgressRing, type ProgressRingTone } from "@/components/ui/progress-ring";
import { TUNING_ALERT_DAYS, TUNING_ENDING_WINDOW_DAYS } from "@/lib/constants";
import type { TuningWindow } from "@/lib/types";
import { formatDate, pluralize } from "@/lib/utils";
import { BentoTile, MoreLink, TILE_ROW_CLASS, TILE_ROW_LINK_CLASS, TileEmpty } from "./bento";
import { ProjectRef } from "./project-ref";

const LIMIT = 4;

function ringTone(daysLeft: number): ProgressRingTone {
  if (daysLeft <= 7) return "danger";
  if (daysLeft <= TUNING_ALERT_DAYS) return "warning";
  return "accent";
}

function countdownLabel(item: TuningWindow): string {
  if (item.days_left < 0) return `Ended ${pluralize(Math.abs(item.days_left), "day")} ago`;
  if (item.days_left === 0) return "Ends today";
  return `${pluralize(item.days_left, "day")} left`;
}

export interface TuningTileProps {
  windows: TuningWindow[];
  className?: string;
}

/**
 * Post-go-live tuning windows ending soon (and ended ones never closed):
 * a countdown ring of the days left, the end date and handover progress.
 */
export function TuningTile({ windows, className }: TuningTileProps) {
  const shown = windows.slice(0, LIMIT);
  const ended = windows.filter((item) => item.days_left < 0).length;
  return (
    <BentoTile
      id="home-tuning"
      title="Tuning windows"
      icon={Hourglass}
      iconClassName="bg-accent-3/12 text-accent-3"
      description={
        windows.length === 0
          ? `Windows ending within ${TUNING_ENDING_WINDOW_DAYS} days of today.`
          : ended > 0
            ? `${pluralize(ended, "window")} ended without being closed.`
            : `${pluralize(windows.length, "window")} ending within ${TUNING_ENDING_WINDOW_DAYS} days.`
      }
      className={className}
    >
      {windows.length === 0 ? (
        <TileEmpty
          icon={Hourglass}
          title="No tuning windows ending soon."
          description="Setting a go-live date starts the post-deploy tuning window. Ones close to their end show here in time to plan handover or a retainer."
        />
      ) : (
        <>
          <ul className="-mx-2 space-y-0.5">
            {shown.map((item) => {
              const remaining = item.tuning_days > 0 ? (Math.max(0, item.days_left) / item.tuning_days) * 100 : 0;
              const label = countdownLabel(item);
              return (
                <li key={item.project.id} className={TILE_ROW_CLASS}>
                  <ProgressRing
                    value={remaining}
                    size={40}
                    tone={ringTone(item.days_left)}
                    label={`${item.project.name}: ${label} of a ${item.tuning_days}-day tuning window`}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/projects/${item.project.id}`}
                      className={TILE_ROW_LINK_CLASS}
                      aria-label={`${item.project.name}: ${label}`}
                    >
                      {label}
                    </Link>
                    <ProjectRef project={item.project} className="mt-0.5" />
                  </div>
                  <div className="shrink-0 text-right text-xs text-fg-muted">
                    <p className="tabular-nums">
                      <span className="sr-only">Ends </span>
                      {formatDate(item.end_date, { month: "short", day: "numeric" })}
                    </p>
                    {item.handover_total > 0 ? (
                      <p className="mt-0.5 tabular-nums">
                        {item.handover_done}/{item.handover_total}
                        <span className="text-fg-subtle"> handover</span>
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <MoreLink count={windows.length - shown.length} href="/calendar" noun="in the calendar" />
        </>
      )}
    </BentoTile>
  );
}
