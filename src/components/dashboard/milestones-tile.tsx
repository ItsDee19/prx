import Link from "next/link";
import { CalendarRange, Diamond, Layers, Rocket, type LucideIcon } from "lucide-react";
import { MILESTONE_DUE_WINDOW_DAYS, MILESTONE_KIND_CONFIG, MILESTONE_STATUS_CONFIG } from "@/lib/constants";
import type { MilestoneDue, MilestoneSummary } from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { BentoTile, MoreLink, TILE_ROW_CLASS, TILE_ROW_LINK_CLASS, TileEmpty } from "./bento";
import { DaysChip, ProjectRef } from "./project-ref";

const LIMIT = 6;

/** phase_key of the go-live milestone created by the delivery templates. */
const GO_LIVE_PHASE_KEY = "go_live";

function kindIcon(milestone: MilestoneSummary): { icon: LucideIcon; label: string; className: string } {
  if (milestone.phase_key === GO_LIVE_PHASE_KEY) {
    return { icon: Rocket, label: "Go-live", className: "bg-accent-3/12 text-accent-3" };
  }
  if (milestone.kind === "milestone") {
    return { icon: Diamond, label: MILESTONE_KIND_CONFIG.milestone.label, className: "bg-accent-2/12 text-accent-2" };
  }
  return { icon: Layers, label: MILESTONE_KIND_CONFIG.phase.label, className: "bg-accent-soft text-accent-soft-fg" };
}

export interface MilestonesTileProps {
  milestones: MilestoneDue[];
  className?: string;
}

/** Phases, milestones and go-lives due in the next two weeks (and any still open past their date). */
export function MilestonesTile({ milestones, className }: MilestonesTileProps) {
  const shown = milestones.slice(0, LIMIT);
  const overdue = milestones.filter((item) => item.days_left < 0).length;
  const goLives = milestones.filter((item) => item.milestone.phase_key === GO_LIVE_PHASE_KEY).length;

  return (
    <BentoTile
      id="home-milestones"
      title="Upcoming milestones"
      icon={CalendarRange}
      description={
        milestones.length === 0
          ? `Phases, milestones and go-lives due in the next ${MILESTONE_DUE_WINDOW_DAYS} days.`
          : [
              `${pluralize(milestones.length, "item")} due soon`,
              goLives > 0 ? `${pluralize(goLives, "go-live")}` : null,
              overdue > 0 ? `${overdue} past due` : null,
            ]
              .filter(Boolean)
              .join(", ") + "."
      }
      action={milestones.length > 0 ? { href: "/calendar", label: "Calendar" } : undefined}
      className={className}
    >
      {milestones.length === 0 ? (
        <TileEmpty
          icon={Diamond}
          title={`Nothing due in the next ${MILESTONE_DUE_WINDOW_DAYS} days.`}
          description="Add phases and milestones to a project (or start it from a template) and their due dates line up here."
        />
      ) : (
        <>
          <ul className="-mx-2 space-y-0.5">
            {shown.map((item) => {
              const kind = kindIcon(item.milestone);
              const KindIcon = kind.icon;
              const status = MILESTONE_STATUS_CONFIG[item.milestone.status];
              return (
                <li key={item.milestone.id} className={TILE_ROW_CLASS}>
                  <span
                    role="img"
                    aria-label={kind.label}
                    className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${kind.className}`}
                  >
                    <KindIcon aria-hidden className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/projects/${item.project.id}`} className={TILE_ROW_LINK_CLASS}>
                      {item.milestone.name}
                    </Link>
                    <ProjectRef project={item.project} className="mt-0.5" />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <DaysChip daysLeft={item.days_left} />
                    {item.milestone.status !== "planned" ? (
                      <span className="text-[11px] text-fg-muted">{status.label}</span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <MoreLink count={milestones.length - shown.length} href="/calendar" noun="in the calendar" />
        </>
      )}
    </BentoTile>
  );
}
