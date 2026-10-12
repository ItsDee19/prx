import Link from "next/link";
import { History } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { UserAvatar } from "@/components/ui/avatar";
import { TimeAgo } from "@/components/ui/time-ago";
import type { Activity } from "@/lib/types";
import { BentoTile, TileEmpty } from "./bento";

export interface RecentActivityProps {
  activity: Activity[];
  className?: string;
}

/** Avatar shown for entries whose actor no longer resolves (e.g. system or deleted user). */
const UNKNOWN_ACTOR = { name: "Someone", color: "#64748b" };

const INLINE_LINK =
  "rounded font-medium text-accent transition-colors duration-(--dur-2) hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Newest activity across every project; flows into two columns when the tile is wide. */
export function RecentActivity({ activity, className }: RecentActivityProps) {
  return (
    <BentoTile
      id="home-activity"
      title="Recent activity"
      icon={History}
      description="The latest changes across all projects."
      className={className}
      bodyClassName="@container"
    >
      {activity.length === 0 ? (
        <TileEmpty
          icon={History}
          title="No activity yet."
          description="Status changes, comments, gate decisions and updates on any project appear here as they happen."
        />
      ) : (
        <Stagger as="ol" className="grid gap-x-8 gap-y-4 @2xl:grid-cols-2">
          {activity.map((entry) => {
            const actor = entry.actor ?? UNKNOWN_ACTOR;
            return (
              <StaggerItem as="li" key={entry.id} className="flex min-w-0 gap-3">
                <UserAvatar user={actor} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-5 text-fg-muted [overflow-wrap:anywhere]">
                    <span className="font-medium text-fg">{actor.name}</span> {entry.message}
                    {entry.project_id !== null && entry.project_name !== null ? (
                      <>
                        {" "}
                        <span aria-hidden>&middot;</span>{" "}
                        <Link href={`/projects/${entry.project_id}`} className={INLINE_LINK}>
                          {entry.project_name}
                        </Link>
                      </>
                    ) : null}
                  </p>
                  <TimeAgo date={entry.created_at} className="mt-0.5 block text-xs text-fg-subtle" />
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </BentoTile>
  );
}
