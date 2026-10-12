import Link from "next/link";
import { Megaphone, PenLine } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import type { StaleUpdate } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { BentoTile, MoreLink, TILE_ROW_CLASS, TILE_ROW_LINK_CLASS, TileEmpty } from "./bento";

const LIMIT = 5;

export interface UpdatesDueTileProps {
  updates: StaleUpdate[];
  viewerId: string;
  /** app_settings.update_cadence_days. */
  cadenceDays: number;
  className?: string;
}

/** Ongoing top-level projects without a status update within the cadence; the viewer's own first. */
export function UpdatesDueTile({ updates, viewerId, cadenceDays, className }: UpdatesDueTileProps) {
  const ordered = [...updates].sort(
    (a, b) => Number(b.owner?.id === viewerId) - Number(a.owner?.id === viewerId),
  );
  const shown = ordered.slice(0, LIMIT);
  const mine = updates.filter((update) => update.owner?.id === viewerId).length;

  return (
    <BentoTile
      id="home-updates"
      title="Updates due"
      icon={Megaphone}
      iconClassName="bg-accent-2/12 text-accent-2"
      description={
        updates.length === 0
          ? `Weekly status updates, due every ${pluralize(cadenceDays, "day")}.`
          : mine > 0
            ? `${pluralize(mine, "project")} of yours ${mine === 1 ? "needs" : "need"} an update.`
            : `${pluralize(updates.length, "project")} without a recent update.`
      }
      className={className}
    >
      {updates.length === 0 ? (
        <TileEmpty
          icon={Megaphone}
          title="Every update is current."
          description={`Ongoing projects without a status update in ${pluralize(cadenceDays, "day")} show here, so health on Home stays fresh.`}
        />
      ) : (
        <>
          <ul className="-mx-2 space-y-0.5">
            {shown.map((update) => {
              const isMine = update.owner?.id === viewerId;
              return (
                <li key={update.project.id} className={TILE_ROW_CLASS}>
                  {update.owner ? (
                    <UserAvatar user={update.owner} size="sm" />
                  ) : (
                    <span
                      aria-label="No owner"
                      role="img"
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-[10px] text-fg-subtle"
                    >
                      &mdash;
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/projects/${update.project.id}?tab=updates&compose=1`}
                      className={TILE_ROW_LINK_CLASS}
                      aria-label={`Post an update for ${update.project.name}`}
                    >
                      {update.project.name}
                    </Link>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-fg-muted">
                      {update.project.client_code ? (
                        <span className="shrink-0 font-mono text-[11px] font-semibold text-fg">
                          {update.project.client_code}
                        </span>
                      ) : null}
                      {isMine ? <span className="shrink-0 font-medium text-accent">Yours</span> : null}
                      <span className="min-w-0 truncate">
                        {update.days_since === null
                          ? "No update yet"
                          : `Last update ${pluralize(update.days_since, "day")} ago`}
                      </span>
                    </p>
                  </div>
                  <PenLine
                    aria-hidden
                    className={cn("size-4 shrink-0", isMine ? "text-accent" : "text-fg-subtle")}
                  />
                </li>
              );
            })}
          </ul>
          <MoreLink count={updates.length - shown.length} href="/projects" noun="projects" />
        </>
      )}
    </BentoTile>
  );
}
