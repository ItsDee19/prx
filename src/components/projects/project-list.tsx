"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, SquareCheck } from "lucide-react";
import { AvatarStack, UserAvatar } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress";
import { TimeAgo } from "@/components/ui/time-ago";
import { Tooltip } from "@/components/ui/tooltip";
import type { ProjectWithMeta } from "@/lib/types";
import { cn, formatDate, pluralize } from "@/lib/utils";
import { DueDate } from "./due-date";
import { PriorityBadge } from "./priority-badge";
import { DEFAULT_SORT, type ProjectSort } from "./project-filters";
import { StatusSelect } from "./status-select";

export interface ProjectListProps {
  projects: ProjectWithMeta[];
  sort: ProjectSort;
  className?: string;
}

const HEAD_CLASS = "px-3 py-2.5 text-left text-xs font-medium text-fg-muted";
const CELL_CLASS = "px-3 py-2.5 align-middle";

/** Columns that are less useful on narrow screens hide progressively. */
const MD = "hidden md:table-cell";
const LG = "hidden lg:table-cell";
const XL = "hidden xl:table-cell";

interface SortHeaderProps {
  href: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}

function SortHeader({ href, active, children, className }: SortHeaderProps) {
  return (
    <th scope="col" aria-sort={active ? "ascending" : undefined} className={cn(HEAD_CLASS, className)}>
      <Link
        href={href}
        scroll={false}
        className={cn(
          "-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 outline-none transition-colors duration-150",
          "hover:text-fg focus-visible:ring-2 focus-visible:ring-accent",
          active && "text-fg",
        )}
      >
        {children}
        <ArrowDown
          aria-hidden
          className={cn("size-3.5 transition-opacity duration-150", active ? "opacity-100" : "opacity-0")}
        />
        {active ? <span className="sr-only">(sorted)</span> : null}
      </Link>
    </th>
  );
}

/** Table view of projects; the sortable headers rewrite `?sort=` and keep every other param. */
export function ProjectList({ projects, sort, className }: ProjectListProps) {
  const searchParams = useSearchParams();

  function sortHref(next: ProjectSort): string {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_SORT) params.delete("sort");
    else params.set("sort", next);
    const qs = params.toString();
    return qs ? `/projects?${qs}` : "/projects";
  }

  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border bg-surface", className)}>
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead className="border-b border-border bg-surface-2/60">
          <tr>
            <SortHeader href={sortHref("name")} active={sort === "name"} className="min-w-56">
              Name
            </SortHeader>
            <th scope="col" className={HEAD_CLASS}>
              Status
            </th>
            <SortHeader href={sortHref("priority")} active={sort === "priority"} className={MD}>
              Priority
            </SortHeader>
            <th scope="col" className={HEAD_CLASS}>
              Owner
            </th>
            <th scope="col" className={cn(HEAD_CLASS, LG)}>
              Members
            </th>
            <th scope="col" className={cn(HEAD_CLASS, XL)}>
              Start
            </th>
            <SortHeader href={sortHref("due_date")} active={sort === "due_date"}>
              Due
            </SortHeader>
            <th scope="col" className={cn(HEAD_CLASS, LG, "w-36")}>
              Progress
            </th>
            <SortHeader href={sortHref("updated")} active={sort === "updated"} className={MD}>
              Updated
            </SortHeader>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {projects.map((project) => {
            const subLabel = `${project.subproject_completed} of ${pluralize(project.subproject_count, "sub-project")} completed`;
            return (
              <tr key={project.id} className="group transition-colors duration-150 hover:bg-surface-2/50">
                <td className={cn(CELL_CLASS, "max-w-xs")}>
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn("size-2.5 shrink-0 rounded-full", !project.color && "bg-border-strong")}
                      style={project.color ? { backgroundColor: project.color } : undefined}
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/projects/${project.id}`}
                        className="block truncate font-medium text-fg outline-none transition-colors duration-150 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {project.name}
                      </Link>
                      {project.parent_name ? (
                        <p className="truncate text-xs text-fg-subtle">in {project.parent_name}</p>
                      ) : null}
                    </div>
                    {project.subproject_count > 0 ? (
                      <Tooltip content={subLabel}>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-fg-muted">
                          <SquareCheck className="size-3.5" aria-hidden />
                          {project.subproject_completed}/{project.subproject_count}
                          <span className="sr-only">{subLabel}</span>
                        </span>
                      </Tooltip>
                    ) : null}
                  </div>
                </td>
                <td className={CELL_CLASS}>
                  <StatusSelect projectId={project.id} status={project.status} />
                </td>
                <td className={cn(CELL_CLASS, MD)}>
                  <PriorityBadge priority={project.priority} />
                </td>
                <td className={CELL_CLASS}>
                  {project.owner ? (
                    <span className="inline-flex max-w-40 items-center gap-2">
                      <UserAvatar user={project.owner} size="sm" />
                      <span className="truncate text-fg">{project.owner.name}</span>
                    </span>
                  ) : (
                    <span className="text-fg-subtle">Unassigned</span>
                  )}
                </td>
                <td className={cn(CELL_CLASS, LG)}>
                  <AvatarStack users={project.members} size="sm" max={3} />
                </td>
                <td className={cn(CELL_CLASS, XL, "whitespace-nowrap text-xs tabular-nums text-fg-muted")}>
                  {project.start_date ? (
                    <time dateTime={project.start_date}>{formatDate(project.start_date)}</time>
                  ) : (
                    <span className="text-fg-subtle">&mdash;</span>
                  )}
                </td>
                <td className={cn(CELL_CLASS, "whitespace-nowrap")}>
                  <DueDate date={project.due_date} status={project.status} />
                </td>
                <td className={cn(CELL_CLASS, LG)}>
                  <ProgressBar value={project.progress} size="sm" showLabel label={`${project.name} progress`} />
                </td>
                <td className={cn(CELL_CLASS, MD, "whitespace-nowrap text-xs text-fg-muted")}>
                  <TimeAgo date={project.updated_at} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
