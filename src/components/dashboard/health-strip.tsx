import type { ReactNode } from "react";
import Link from "next/link";
import { Activity as ActivityIcon, FolderKanban } from "lucide-react";
import { RagDot } from "@/components/ui/rag-dot";
import { RAG_CONFIG } from "@/lib/constants";
import type { HealthCounts, PortfolioHealthEntry } from "@/lib/data/home";
import type { RagHealth } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { BentoTile, TileEmpty } from "./bento";

/** Pills shown before the rest collapse into "+N more". */
const MAX_PILLS = 24;

const ORDER: (RagHealth | "none")[] = ["red", "amber", "none", "green"];

const BAR_CLASS: Record<RagHealth | "none", string> = {
  red: "bg-danger",
  amber: "bg-warning",
  green: "bg-success",
  none: "bg-fg-subtle/40",
};

const PILL_TINT: Record<RagHealth | "none", string> = {
  red: "bg-danger/8 ring-danger/30 hover:bg-danger/12",
  amber: "bg-warning/8 ring-warning/30 hover:bg-warning/12",
  green: "bg-surface ring-border hover:bg-surface-2",
  none: "bg-surface ring-border hover:bg-surface-2",
};

function labelOf(health: RagHealth | "none"): string {
  return health === "none" ? "No update" : RAG_CONFIG[health].label;
}

export interface HealthStripProps {
  portfolio: PortfolioHealthEntry[];
  counts: HealthCounts;
  /** Rendered in the empty state (New project). */
  emptyAction?: ReactNode;
  className?: string;
}

/**
 * Portfolio health strip: counts and a proportional bar by latest RAG, then
 * one pill per open top-level project, red first. Each pill opens the project.
 */
export function HealthStrip({ portfolio, counts, emptyAction, className }: HealthStripProps) {
  const total = portfolio.length;
  const shown = portfolio.slice(0, MAX_PILLS);
  const hidden = total - shown.length;
  const summary = ORDER.filter((health) => counts[health] > 0)
    .map((health) => `${labelOf(health)}: ${counts[health]}`)
    .join(", ");

  return (
    <BentoTile
      id="home-health"
      title="Portfolio health"
      icon={ActivityIcon}
      description={
        total === 0
          ? "Open top-level projects by their latest weekly update."
          : counts.none === total
            ? "No status updates yet. Post one from a project's Updates tab to colour this strip."
            : `${pluralize(total, "open project")}, red first.`
      }
      action={total > 0 ? { href: "/projects", label: "All projects" } : undefined}
      className={className}
      meta={
        total > 0 ? (
          <div className="space-y-2.5">
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              {ORDER.map((health) => (
                <li key={health} className="flex items-center gap-1.5">
                  <RagDot health={health === "none" ? null : health} showLabel size="md" />
                  <span className="font-semibold tabular-nums text-fg">{counts[health]}</span>
                </li>
              ))}
            </ul>
            <div
              role="img"
              aria-label={`Portfolio health. ${summary}`}
              className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2"
            >
              {ORDER.filter((health) => counts[health] > 0).map((health) => (
                <div
                  key={health}
                  className={cn("h-full min-w-1 rounded-sm", BAR_CLASS[health])}
                  style={{ flexGrow: counts[health] }}
                />
              ))}
            </div>
          </div>
        ) : undefined
      }
    >
      {total === 0 ? (
        <TileEmpty
          icon={FolderKanban}
          title="No open projects yet."
          description="Each open engagement shows here with its On track, At risk or Off track health from the latest weekly update."
          action={emptyAction}
        />
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {shown.map((project) => {
              const key = project.health ?? "none";
              return (
                <li key={project.id} className="min-w-0 max-w-full">
                  <Link
                    href={`/projects/${project.id}`}
                    className={cn(
                      "inline-flex h-8 max-w-full items-center gap-2 rounded-full px-3 text-sm ring-1 ring-inset",
                      "transition-colors duration-(--dur-2) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "pointer-coarse:h-10",
                      PILL_TINT[key],
                    )}
                  >
                    <RagDot health={project.health} />
                    {project.client_code ? (
                      <span className="shrink-0 font-mono text-[11px] font-semibold text-fg-muted">
                        {project.client_code}
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate font-medium text-fg">{project.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {hidden > 0 ? (
            <p className="mt-3 text-xs text-fg-muted">
              <Link
                href="/projects"
                className="rounded font-medium text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {hidden} more open {hidden === 1 ? "project" : "projects"}
              </Link>
            </p>
          ) : null}
        </>
      )}
    </BentoTile>
  );
}
