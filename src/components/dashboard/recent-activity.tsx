import type { ReactNode } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TimeAgo } from "@/components/ui/time-ago";
import type { Activity } from "@/lib/types";

export interface RecentActivityProps {
  activity: Activity[];
  emptyAction?: ReactNode;
  className?: string;
}

/** Avatar shown for entries whose actor no longer resolves (e.g. system or deleted user). */
const UNKNOWN_ACTOR = { name: "Someone", color: "#64748b" };

/** Newest activity across every project. */
export function RecentActivity({ activity, emptyAction, className }: RecentActivityProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>The latest changes across all projects</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <EmptyState
            icon={History}
            title="No activity yet"
            description="Changes to projects, members and comments will appear here."
            action={emptyAction}
          />
        ) : (
          <ol className="space-y-4">
            {activity.map((entry) => {
              const actor = entry.actor ?? UNKNOWN_ACTOR;
              const hasProject = entry.project_id !== null && entry.project_name !== null;
              return (
                <li key={entry.id} className="flex gap-3">
                  <UserAvatar user={actor} size="md" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-5 text-fg-muted">
                      <span className="font-medium text-fg">{actor.name}</span> {entry.message}
                      {hasProject ? (
                        <>
                          {" "}
                          <span aria-hidden>&middot;</span>{" "}
                          <Link
                            href={`/projects/${entry.project_id}`}
                            className="rounded font-medium text-accent transition-colors duration-150 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            {entry.project_name}
                          </Link>
                        </>
                      ) : null}
                    </p>
                    <TimeAgo date={entry.created_at} className="mt-0.5 block text-xs text-fg-subtle" />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
