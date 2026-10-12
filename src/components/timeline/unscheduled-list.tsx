import Link from "next/link";
import { CalendarOff } from "lucide-react";
import { ClientChip } from "@/components/clients/client-chip";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RagDot } from "@/components/ui/rag-dot";
import { STATUS_CONFIG } from "@/lib/constants";
import type { TimelinePortfolioProject } from "@/lib/data/timeline";
import { cn } from "@/lib/utils";

/** Engagements with neither a start nor a due date, below the portfolio timeline. */
export function UnscheduledList({ projects, className }: { projects: TimelinePortfolioProject[]; className?: string }) {
  if (projects.length === 0) return null;
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <CalendarOff aria-hidden className="size-4 text-fg-muted" />
            Unscheduled
            <span className="rounded-full bg-fg/[0.06] px-1.5 text-xs font-medium tabular-nums text-fg-muted">
              {projects.length}
            </span>
          </CardTitle>
          <CardDescription>Add a start or due date to place these on the timeline.</CardDescription>
        </div>
      </CardHeader>
      <ul role="list" className="divide-y divide-border border-t border-border">
        {projects.map((project) => (
          <li key={project.id}>
            <Link
              href={`/projects/${project.id}`}
              className="flex min-h-11 min-w-0 items-center gap-2.5 px-5 py-2.5 outline-none transition-colors duration-150 hover:bg-fg/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <RagDot health={project.health} />
              {project.client ? <ClientChip client={project.client} /> : null}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{project.name}</span>
              <span className="shrink-0 text-xs text-fg-muted">
                {project.current_phase?.name ?? STATUS_CONFIG[project.status].label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
