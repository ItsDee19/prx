"use client";

import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown } from "lucide-react";
import { LabelChips } from "@/components/labels/label-chips";
import { Stagger, StaggerItem } from "@/components/motion";
import { AvatarStack, UserAvatar } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress";
import { RagDot } from "@/components/ui/rag-dot";
import { TimeAgo } from "@/components/ui/time-ago";
import { useListNavigation } from "@/hooks/use-list-navigation";
import type { ProjectWithMeta, WorkspaceDateContext } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { DueDate } from "./due-date";
import { PriorityBadge } from "./priority-badge";
import {
  ProjectEngagementTags,
  ProjectPhaseChip,
  projectUpdateDue,
  SubprojectPill,
  TaskCountPill,
  UpdateDueBadge,
} from "./project-card";
import { DEFAULT_SORT, type ProjectSort } from "./project-filters";
import { StatusSelect } from "./status-select";

export interface ProjectListProps {
  projects: ProjectWithMeta[];
  sort: ProjectSort;
  /** Workspace today, timezone and update cadence; enables "Update due" and workspace-time due dates. */
  workspace?: WorkspaceDateContext;
  /** Checkbox column with shift-click ranges and Ctrl/Cmd+A (bulk actions). */
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  className?: string;
}

/**
 * Column layout from md (rows are stacked cards below md). Every row is ONE
 * element (`data-list-item-id`), so keyboard list navigation finds a single,
 * visible target at every width; phone and desktop cells live inside it and
 * swap with CSS. Secondary columns appear as the main column widens:
 *   md / lg:  Name, Status, Health (dot), Priority, Owner (avatar), Due
 *   xl:       + Progress, Updated
 *   2xl:      + Phase, Owner name
 *   3xl:      + Health label, Members, Start (every column)
 */
const GRID = "md:grid md:items-center md:gap-x-3 md:px-3";
const COLUMNS =
  "md:grid-cols-[minmax(0,1fr)_8.5rem_3.25rem_5.75rem_2.5rem_6rem] " +
  "xl:grid-cols-[minmax(0,1fr)_8.5rem_3.25rem_5.75rem_2.5rem_6rem_8rem_5.5rem] " +
  "2xl:grid-cols-[minmax(0,1fr)_8.5rem_3.25rem_8rem_5.75rem_9rem_6rem_8rem_5.5rem] " +
  "3xl:grid-cols-[minmax(0,1fr)_8.5rem_6.5rem_8rem_5.75rem_9rem_5rem_6rem_6rem_8rem_5.5rem]";
const COLUMNS_SELECTABLE =
  "md:grid-cols-[1.5rem_minmax(0,1fr)_8.5rem_3.25rem_5.75rem_2.5rem_6rem] " +
  "xl:grid-cols-[1.5rem_minmax(0,1fr)_8.5rem_3.25rem_5.75rem_2.5rem_6rem_8rem_5.5rem] " +
  "2xl:grid-cols-[1.5rem_minmax(0,1fr)_8.5rem_3.25rem_8rem_5.75rem_9rem_6rem_8rem_5.5rem] " +
  "3xl:grid-cols-[1.5rem_minmax(0,1fr)_8.5rem_6.5rem_8rem_5.75rem_9rem_5rem_6rem_6rem_8rem_5.5rem]";

const HEAD_CLASS = "whitespace-nowrap py-2.5 text-left text-xs font-medium text-fg-muted";
const CELL = "hidden min-w-0 md:flex md:items-center";
const XL = "hidden min-w-0 xl:flex xl:items-center";
const XXL = "hidden min-w-0 2xl:flex 2xl:items-center";
const XXXL = "hidden min-w-0 3xl:flex 3xl:items-center";

/** Raised above the row's stretched link so they stay clickable / hoverable. */
const ABOVE_LINK = "relative z-10";

interface SortHeaderProps {
  href: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}

function SortHeader({ href, active, children, className }: SortHeaderProps) {
  return (
    <div role="columnheader" aria-sort={active ? "ascending" : undefined} className={cn(HEAD_CLASS, className)}>
      <Link
        href={href}
        scroll={false}
        className={cn(
          "-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 outline-none transition-colors duration-150",
          "hover:text-fg focus-visible:ring-2 focus-visible:ring-ring",
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
    </div>
  );
}

function Header({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div role="columnheader" className={cn(HEAD_CLASS, className)}>
      {children}
    </div>
  );
}

function ColorDot({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-2.5 shrink-0 rounded-full", !color && "bg-border-strong", className)}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

/** Checkbox that reports shift-clicks (range selection). */
function RowCheckbox({
  checked,
  label,
  onToggle,
  className,
}: {
  checked: boolean;
  label: string;
  onToggle: (checked: boolean, shiftKey: boolean) => void;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={() => undefined}
      onClick={(event: MouseEvent<HTMLInputElement>) => onToggle(event.currentTarget.checked, event.shiftKey)}
      className={cn(
        ABOVE_LINK,
        "peer size-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-input-border bg-surface bg-center bg-no-repeat outline-none",
        "transition-colors duration-150 checked:border-accent checked:bg-accent checked:bg-(image:--checkbox-icon)",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "pointer-coarse:after:absolute pointer-coarse:after:-inset-3",
        className,
      )}
    />
  );
}

/** Table view of projects; the sortable headers rewrite `?sort=` and keep every other param. */
export function ProjectList({
  projects,
  sort,
  workspace,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  className,
}: ProjectListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const anchor = useRef<number | null>(null);
  const headerCheckbox = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const selected = new Set(selectedIds);
  const allSelected = projects.length > 0 && projects.every((project) => selected.has(project.id));
  const someSelected = !allSelected && projects.some((project) => selected.has(project.id));

  useEffect(() => {
    if (headerCheckbox.current) headerCheckbox.current.indeterminate = someSelected;
  }, [someSelected]);

  function sortHref(next: ProjectSort): string {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_SORT) params.delete("sort");
    else params.set("sort", next);
    const qs = params.toString();
    return qs ? `/projects?${qs}` : "/projects";
  }

  function emit(ids: Set<string>) {
    onSelectionChange?.(projects.map((project) => project.id).filter((id) => ids.has(id)));
  }

  function toggleRow(index: number, checked: boolean, shiftKey: boolean) {
    const next = new Set(selected);
    if (shiftKey && anchor.current !== null) {
      const [from, to] = anchor.current < index ? [anchor.current, index] : [index, anchor.current];
      for (let i = from; i <= to; i++) {
        if (checked) next.add(projects[i].id);
        else next.delete(projects[i].id);
      }
    } else if (checked) {
      next.add(projects[index].id);
    } else {
      next.delete(projects[index].id);
    }
    anchor.current = index;
    emit(next);
  }

  function toggleAll(checked: boolean) {
    anchor.current = null;
    emit(checked ? new Set(projects.map((project) => project.id)) : new Set());
  }

  /** Opens the row's visible status menu (the phone and desktop cells each render one). */
  function openStatusMenu(id: string) {
    const row = tableRef.current?.querySelector<HTMLElement>(`[data-list-item-id="${CSS.escape(id)}"]`);
    const trigger = [...(row?.querySelectorAll<HTMLElement>('[aria-haspopup="menu"][aria-label^="Status:"]') ?? [])].find(
      (element) => element.getClientRects().length > 0,
    );
    if (!trigger) return;
    trigger.focus();
    // Radix opens a menu trigger on ArrowDown and moves focus to the first item.
    trigger.dispatchEvent(new globalThis.KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true }));
  }

  // j/k roving focus over rows; Enter opens, s opens the status menu, x toggles selection.
  useListNavigation({
    itemIds: projects.map((project) => project.id),
    onOpen: (id) => router.push(`/projects/${id}`),
    onToggleSelect:
      selectable && onSelectionChange
        ? (id) => {
            const index = projects.findIndex((project) => project.id === id);
            if (index >= 0) toggleRow(index, !selected.has(id), false);
          }
        : undefined,
    onStatusMenu: openStatusMenu,
    selectedIds: selectable ? selectedIds : undefined,
    containerRef: tableRef,
  });

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const typing = target.closest("input:not([type=checkbox]), textarea, select, [contenteditable=true]");
    if (selectable && !typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      toggleAll(true);
    }
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>, href: string) {
    // The row itself has focus (keyboard list navigation): Enter opens the project.
    if (event.key === "Enter" && event.target === event.currentTarget) {
      event.preventDefault();
      router.push(href);
    }
  }

  const columns = selectable ? COLUMNS_SELECTABLE : COLUMNS;

  return (
    <div
      ref={tableRef}
      role="table"
      aria-label="Projects"
      aria-rowcount={projects.length + 1}
      onKeyDown={handleKeyDown}
      className={cn("overflow-hidden rounded-2xl border border-border bg-surface shadow-card", className)}
    >
      <div role="rowgroup" className="hidden border-b border-border bg-surface-2/60 md:block">
        <div role="row" className={cn(GRID, columns)}>
          {selectable ? (
            <div role="columnheader" className={HEAD_CLASS}>
              <input
                ref={headerCheckbox}
                type="checkbox"
                checked={allSelected}
                onChange={(event) => toggleAll(event.target.checked)}
                aria-label={allSelected ? "Deselect all projects" : "Select all projects"}
                className="size-4 cursor-pointer appearance-none rounded-[4px] border border-input-border bg-surface bg-center bg-no-repeat outline-none transition-colors duration-150 checked:border-accent checked:bg-accent checked:bg-(image:--checkbox-icon) indeterminate:border-accent indeterminate:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ) : null}
          <SortHeader href={sortHref("name")} active={sort === "name"}>
            Name
          </SortHeader>
          <Header>Status</Header>
          <Header>Health</Header>
          <Header className={XXL}>Phase</Header>
          <SortHeader href={sortHref("priority")} active={sort === "priority"}>
            Priority
          </SortHeader>
          <Header>Owner</Header>
          <Header className={XXXL}>Members</Header>
          <Header className={XXXL}>Start</Header>
          <SortHeader href={sortHref("due_date")} active={sort === "due_date"}>
            Due
          </SortHeader>
          <Header className={XL}>Progress</Header>
          <SortHeader href={sortHref("updated")} active={sort === "updated"} className={XL}>
            Updated
          </SortHeader>
        </div>
      </div>

      <div role="rowgroup">
        <Stagger className="divide-y divide-border">
          {projects.map((project, index) => {
            const href = `/projects/${project.id}`;
            const isSelected = selected.has(project.id);
            const updateDue = projectUpdateDue(project, workspace);
            const checkbox = selectable ? (
              <RowCheckbox
                checked={isSelected}
                label={`Select ${project.name}`}
                onToggle={(checked, shiftKey) => toggleRow(index, checked, shiftKey)}
              />
            ) : null;

            return (
              <StaggerItem key={project.id}>
                <div
                  role="row"
                  aria-rowindex={index + 2}
                  aria-selected={selectable ? isSelected : undefined}
                  data-list-item-id={project.id}
                  tabIndex={-1}
                  onKeyDown={(event) => handleRowKeyDown(event, href)}
                  className={cn(
                    "group relative outline-none transition-colors duration-(--dur-2)",
                    "hover:bg-surface-2/50 focus-visible:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    isSelected && "bg-accent-soft/50 hover:bg-accent-soft/60",
                    GRID,
                    columns,
                  )}
                >
                  {/* Phones and small tablets: one stacked card per project. */}
                  <div role="cell" className="flex flex-col gap-2 px-3.5 py-3 sm:px-4 md:hidden">
                    <div className="flex items-start gap-2.5">
                      {checkbox ? <span className="mt-0.5 flex">{checkbox}</span> : null}
                      <ColorDot color={project.color} className="mt-1.5" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={href}
                          title={project.name}
                          className={cn(
                            "block truncate text-sm font-medium leading-5 text-fg outline-none transition-colors duration-150 hover:text-accent",
                            // Stretch the link over the row; controls inside the row sit above it.
                            "after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring",
                          )}
                        >
                          {project.name}
                        </Link>
                        {project.parent_name || project.client || project.service_line ? (
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                            <ProjectEngagementTags project={project} className={ABOVE_LINK} />
                            {project.parent_name ? (
                              <span className="min-w-0 truncate text-xs text-fg-subtle" title={project.parent_name}>
                                in {project.parent_name}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <SubprojectPill project={project} className={ABOVE_LINK} />
                      <PriorityBadge priority={project.priority} iconOnly className={ABOVE_LINK} />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-5">
                      <StatusSelect projectId={project.id} status={project.status} className="z-10" />
                      <DueDate date={project.due_date} status={project.status} withIcon today={workspace?.today} />
                      {project.health !== null ? <RagDot health={project.health} showLabel /> : null}
                      {project.current_phase ? (
                        <ProjectPhaseChip phase={project.current_phase} className={ABOVE_LINK} />
                      ) : null}
                      {updateDue ? <UpdateDueBadge className={ABOVE_LINK} /> : null}
                      {/* Phones: progress + owner always share a line. From sm they join the row above. */}
                      <div className="flex basis-full items-center gap-3 sm:contents">
                        <ProgressBar
                          value={project.progress}
                          size="sm"
                          showLabel
                          label={`${project.name} progress`}
                          className="min-w-0 flex-1 sm:ml-auto sm:w-36 sm:flex-none"
                        />
                        {project.owner ? (
                          <UserAvatar user={project.owner} size="sm" />
                        ) : (
                          <span className="shrink-0 text-xs text-fg-subtle">Unassigned</span>
                        )}
                      </div>
                    </div>
                    {project.labels.length > 0 ? (
                      <LabelChips labels={project.labels} max={3} className="pl-5" />
                    ) : null}
                  </div>

                  {/* md and up: one cell per column. */}
                  {selectable ? (
                    <div role="cell" className={CELL}>
                      {checkbox}
                    </div>
                  ) : null}
                  <div role="cell" className={cn(CELL, "gap-2 py-2.5")}>
                    <ColorDot color={project.color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link
                          href={href}
                          title={project.name}
                          className={cn(
                            "min-w-0 truncate text-sm font-medium text-fg outline-none transition-colors duration-150 hover:text-accent",
                            "after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring",
                          )}
                        >
                          {project.name}
                        </Link>
                        <ProjectEngagementTags project={project} className={ABOVE_LINK} />
                        <SubprojectPill project={project} className={ABOVE_LINK} />
                        <TaskCountPill project={project} className={cn(ABOVE_LINK, "hidden 2xl:inline-flex")} />
                        {updateDue ? <UpdateDueBadge className={cn(ABOVE_LINK, "hidden lg:inline-flex")} /> : null}
                      </div>
                      {project.parent_name || project.labels.length > 0 ? (
                        <div className="mt-0.5 flex min-w-0 items-center gap-2">
                          {project.parent_name ? (
                            <span className="min-w-0 truncate text-xs text-fg-subtle" title={project.parent_name}>
                              in {project.parent_name}
                            </span>
                          ) : null}
                          {project.labels.length > 0 ? (
                            <LabelChips labels={project.labels} max={2} className="hidden min-w-0 flex-nowrap overflow-hidden xl:inline-flex" />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div role="cell" className={CELL}>
                    <StatusSelect projectId={project.id} status={project.status} className="z-10" />
                  </div>
                  <div role="cell" className={CELL}>
                    <RagDot health={project.health} className="3xl:hidden" />
                    <RagDot health={project.health} showLabel className="hidden 3xl:inline-flex" />
                  </div>
                  <div role="cell" className={XXL}>
                    {project.current_phase ? (
                      <ProjectPhaseChip phase={project.current_phase} className={ABOVE_LINK} />
                    ) : (
                      <span className="text-xs text-fg-subtle">&mdash;</span>
                    )}
                  </div>
                  <div role="cell" className={CELL}>
                    <PriorityBadge priority={project.priority} />
                  </div>
                  <div role="cell" className={CELL}>
                    {project.owner ? (
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <UserAvatar user={project.owner} size="sm" />
                        <span className="hidden truncate text-sm text-fg 2xl:inline">{project.owner.name}</span>
                      </span>
                    ) : (
                      <span className="whitespace-nowrap text-sm text-fg-subtle">
                        <span aria-hidden className="2xl:hidden">
                          &mdash;
                        </span>
                        <span className="sr-only 2xl:not-sr-only">Unassigned</span>
                      </span>
                    )}
                  </div>
                  <div role="cell" className={XXXL}>
                    <AvatarStack users={project.members} size="sm" max={3} className={ABOVE_LINK} />
                  </div>
                  <div role="cell" className={cn(XXXL, "whitespace-nowrap text-xs tabular-nums text-fg-muted")}>
                    {project.start_date ? (
                      <time dateTime={project.start_date}>{formatDate(project.start_date)}</time>
                    ) : (
                      <span className="text-fg-subtle">&mdash;</span>
                    )}
                  </div>
                  <div role="cell" className={cn(CELL, "whitespace-nowrap")}>
                    <DueDate date={project.due_date} status={project.status} today={workspace?.today} className={ABOVE_LINK} />
                  </div>
                  <div role="cell" className={XL}>
                    <ProgressBar
                      value={project.progress}
                      size="sm"
                      showLabel
                      label={`${project.name} progress`}
                      className="w-full"
                    />
                  </div>
                  <div role="cell" className={cn(XL, "whitespace-nowrap text-xs text-fg-muted")}>
                    <TimeAgo date={project.updated_at} />
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </div>
  );
}
