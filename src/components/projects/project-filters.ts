import { PRIORITIES, PROJECT_STATUSES, type Priority, type ProjectFilters, type ProjectStatus } from "@/lib/types";

/**
 * URL <-> filter helpers shared by the /projects page (server) and the
 * client toolbar. Plain module: no React, no server-only imports.
 */

export type ProjectView = "board" | "list";

export type ProjectSort = Exclude<NonNullable<ProjectFilters["sort"]>, "position">;

export const SORT_OPTIONS: { value: ProjectSort; label: string }[] = [
  { value: "updated", label: "Last updated" },
  { value: "created", label: "Newest" },
  { value: "due_date", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "name", label: "Name" },
];

export const DEFAULT_SORT: ProjectSort = "updated";
export const DEFAULT_VIEW: ProjectView = "board";

/** Raw `searchParams` shape handed to a Next.js page. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface ParsedProjectParams {
  q: string;
  status: ProjectStatus[];
  priority: Priority | null;
  owner: string | null;
  includeSub: boolean;
  sort: ProjectSort;
  view: ProjectView;
}

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const STATUS_SET = new Set<string>(PROJECT_STATUSES);
const PRIORITY_SET = new Set<string>(PRIORITIES);
const SORT_SET = new Set<string>(SORT_OPTIONS.map((option) => option.value));

export function isProjectStatus(value: string): value is ProjectStatus {
  return STATUS_SET.has(value);
}

export function isPriority(value: string): value is Priority {
  return PRIORITY_SET.has(value);
}

export function isProjectSort(value: string): value is ProjectSort {
  return SORT_SET.has(value);
}

export function parseStatusParam(value: string): ProjectStatus[] {
  const seen = new Set<ProjectStatus>();
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (isProjectStatus(trimmed)) seen.add(trimmed);
  }
  return Array.from(seen);
}

/** Validates every search param; unknown values fall back to defaults. */
export function parseProjectParams(raw: RawSearchParams): ParsedProjectParams {
  const priority = first(raw.priority);
  const sort = first(raw.sort);
  const view = first(raw.view);
  const owner = first(raw.owner).trim();
  return {
    q: first(raw.q).trim(),
    status: parseStatusParam(first(raw.status)),
    priority: isPriority(priority) ? priority : null,
    owner: owner.length > 0 ? owner : null,
    includeSub: first(raw.sub) === "1",
    sort: isProjectSort(sort) ? sort : DEFAULT_SORT,
    view: view === "list" ? "list" : DEFAULT_VIEW,
  };
}

export function toProjectFilters(params: ParsedProjectParams): ProjectFilters {
  const filters: ProjectFilters = { sort: params.sort };
  if (!params.includeSub) filters.parentId = null;
  if (params.status.length > 0) filters.status = params.status;
  if (params.priority) filters.priority = params.priority;
  if (params.owner) filters.ownerId = params.owner;
  if (params.q) filters.search = params.q;
  return filters;
}

/** Number of narrowing filters set (sort and view do not count). */
export function countActiveFilters(params: ParsedProjectParams): number {
  let count = 0;
  if (params.q) count += 1;
  if (params.status.length > 0) count += 1;
  if (params.priority) count += 1;
  if (params.owner) count += 1;
  if (params.includeSub) count += 1;
  return count;
}
