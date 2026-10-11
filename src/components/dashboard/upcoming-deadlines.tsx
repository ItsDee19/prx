import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { DueDate } from "@/components/projects/due-date";
import { UserAvatar } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { STATUS_CONFIG } from "@/lib/constants";
import type { ProjectWithMeta } from "@/lib/types";
import { cn, isOverdue } from "@/lib/utils";

export interface UpcomingDeadlinesProps {
  projects: ProjectWithMeta[];
  emptyAction?: ReactNode;
  className?: string;
}

/** Open projects with a due date, soonest first; overdue rows are tinted. */
export function UpcomingDeadlines({ projects, emptyAction, className }: UpcomingDeadlinesProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Upcoming deadlines</CardTitle>
          <CardDescription>Open projects with the nearest due dates</CardDescription>
        </div>
      </CardHeader>
      <CardContent className={projects.length === 0 ? undefined : "px-2 pb-2"}>
        {projects.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No upcoming deadlines"
            description="Open projects with a due date will be listed here."
            action={emptyAction}
          />
        ) : (
          <ul className="divide-y divide-border">
            {projects.map((project) => {
              const overdue = isOverdue(project.due_date, project.status);
              const status = STATUS_CONFIG[project.status];
              return (
                <li
                  key={project.id}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-150",
                    overdue ? "bg-danger/5" : "hover:bg-surface-2",
                  )}
                >
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", status.dotClass)} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block truncate rounded text-sm font-medium text-fg transition-colors duration-150 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {project.name}
                    </Link>
                    <p className="truncate text-xs text-fg-subtle">
                      <span className="sr-only">Status: </span>
                      {status.label}
                      {project.parent_name ? (
                        <>
                          <span aria-hidden> &middot; </span>
                          <span className="sr-only">in </span>
                          {project.parent_name}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <DueDate date={project.due_date} status={project.status} withIcon />
                  {project.owner ? (
                    <UserAvatar user={project.owner} size="sm" />
                  ) : (
                    <span
                      aria-label="No owner"
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-[10px] text-fg-subtle"
                    >
                      &mdash;
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
