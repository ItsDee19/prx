import Link from "next/link";
import { Gavel } from "lucide-react";
import { TimeAgo } from "@/components/ui/time-ago";
import type { GateAwaiting } from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { daysUntilOn } from "@/lib/workspace-time";
import { BentoTile, MoreLink, TILE_ROW_CLASS, TILE_ROW_LINK_CLASS, TileEmpty } from "./bento";
import { DaysChip, ProjectRef } from "./project-ref";

const LIMIT = 5;

export interface GatesTileProps {
  gates: GateAwaiting[];
  isAdmin: boolean;
  /** Workspace today. */
  today: string;
  className?: string;
}

/**
 * Phases waiting for a Go / Extend once / Stop decision, longest waiting
 * first. Shown to admins (every gate) and project owners (their gates); the
 * rotating conic border marks it while anything is waiting.
 */
export function GatesTile({ gates, isAdmin, today, className }: GatesTileProps) {
  const shown = gates.slice(0, LIMIT);
  return (
    <BentoTile
      id="home-gates"
      title="Gates awaiting decision"
      icon={Gavel}
      iconClassName="bg-warning/12 text-warning"
      highlight={gates.length > 0}
      description={
        gates.length === 0
          ? isAdmin
            ? "Phase gates across every open project."
            : "Phase gates on the projects you own."
          : `${pluralize(gates.length, "phase")} waiting for Go, Extend once or Stop.`
      }
      className={className}
    >
      {gates.length === 0 ? (
        <TileEmpty
          icon={Gavel}
          title="No gates awaiting a decision."
          description="When a gated phase requests review, it waits here for its project owner or an admin to decide."
        />
      ) : (
        <>
          <ul className="-mx-2 space-y-0.5">
            {shown.map((gate) => {
              const daysLeft = daysUntilOn(gate.milestone.due_date, today);
              return (
                <li key={gate.milestone.id} className={TILE_ROW_CLASS}>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/projects/${gate.project.id}`}
                      className={TILE_ROW_LINK_CLASS}
                      aria-label={`Decide the ${gate.milestone.name} gate of ${gate.project.name}`}
                    >
                      {gate.milestone.name}
                    </Link>
                    <ProjectRef project={gate.project} className="mt-0.5" />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-fg-muted">
                      <span className="sr-only">Requested </span>
                      <TimeAgo date={gate.requested_at} />
                    </span>
                    {daysLeft !== null && daysLeft < 0 ? <DaysChip daysLeft={daysLeft} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <MoreLink count={gates.length - shown.length} href="/projects" noun="gates in Projects" />
        </>
      )}
    </BentoTile>
  );
}
