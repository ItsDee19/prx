import {
  ENGAGEMENT_TYPES,
  PRIORITIES,
  PROJECT_STATUSES,
  RAG_HEALTHS,
  SERVICE_LINES,
  type EngagementType,
  type Priority,
  type ProjectFilters,
  type ProjectStatus,
  type RagHealth,
  type ServiceLine,
} from "@/lib/types";

/**
 * URL <-> filter helpers shared by the /projects page (server) and the
 * client toolbar. Plain module: no React, no server-only imports.
 *
 * Params: q, status (multi), priority, owner, sub=1, client, service (multi),
 * engagement (multi), health (multi), label (multi), sort, view. Multi-value
 * params are written comma-separated and also accepted repeated
 * (?label=a&label=b), so saved views and hand-written links both work.
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

/** Most label ids honoured from the URL (keeps the query bounded). */
const MAX_LABEL_FILTERS = 30;

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
  /* v2 */
  client: string | null;
  service: ServiceLine[];
  engagement: EngagementType[];
  health: RagHealth[];
  labels: string[];
}

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Every comma-separated part of every occurrence, trimmed, empty parts dropped. */
function allParts(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.flatMap((item) => item.split(",")).map((part) => part.trim()).filter(Boolean);
}

/** Known values only, de-duplicated, in the canonical order of `allowed`. */
function pickEnum<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T[] {
  const wanted = new Set(allParts(value));
  return allowed.filter((item) => wanted.has(item));
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
  const client = first(raw.client).trim();
  return {
    q: first(raw.q).trim(),
    status: parseStatusParam(allParts(raw.status).join(",")),
    priority: isPriority(priority) ? priority : null,
    owner: owner.length > 0 ? owner : null,
    includeSub: first(raw.sub) === "1",
    sort: isProjectSort(sort) ? sort : DEFAULT_SORT,
    view: view === "list" ? "list" : DEFAULT_VIEW,
    client: client.length > 0 ? client : null,
    service: pickEnum(raw.service, SERVICE_LINES),
    engagement: pickEnum(raw.engagement, ENGAGEMENT_TYPES),
    health: pickEnum(raw.health, RAG_HEALTHS),
    labels: Array.from(new Set(allParts(raw.label))).slice(0, MAX_LABEL_FILTERS),
  };
}

export function toProjectFilters(params: ParsedProjectParams): ProjectFilters {
  const filters: ProjectFilters = { sort: params.sort };
  if (!params.includeSub) filters.parentId = null;
  if (params.status.length > 0) filters.status = params.status;
  if (params.priority) filters.priority = params.priority;
  if (params.owner) filters.ownerId = params.owner;
  if (params.q) filters.search = params.q;
  if (params.client) filters.clientId = params.client;
  if (params.service.length > 0) filters.serviceLine = params.service;
  if (params.engagement.length > 0) filters.engagementType = params.engagement;
  if (params.health.length > 0) filters.health = params.health;
  if (params.labels.length > 0) filters.labelIds = params.labels;
  return filters;
}

/** The narrowing params of a parsed state as URL values (null = remove). Sort and view excluded. */
export type FilterParamKey = "status" | "priority" | "owner" | "sub" | "client" | "service" | "engagement" | "health" | "label";

/** Every narrowing param besides `q` cleared (for "Clear filters"). */
export const CLEARED_FILTER_PARAMS: Record<FilterParamKey, null> = {
  status: null,
  priority: null,
  owner: null,
  sub: null,
  client: null,
  service: null,
  engagement: null,
  health: null,
  label: null,
};

export type RefinementState = Pick<
  ParsedProjectParams,
  "status" | "priority" | "owner" | "includeSub" | "client" | "service" | "engagement" | "health" | "labels"
>;

/** The parsed-state values matching CLEARED_FILTER_PARAMS. */
export const CLEARED_REFINEMENTS: RefinementState = {
  status: [],
  priority: null,
  owner: null,
  includeSub: false,
  client: null,
  service: [],
  engagement: [],
  health: [],
  labels: [],
};

/**
 * Number of narrowing filters set besides the search query: the ones grouped
 * behind the toolbar's "Filters" button on phones.
 */
export function countRefinements(params: RefinementState): number {
  let count = 0;
  if (params.status.length > 0) count += 1;
  if (params.priority) count += 1;
  if (params.owner) count += 1;
  if (params.includeSub) count += 1;
  if (params.client) count += 1;
  if (params.service.length > 0) count += 1;
  if (params.engagement.length > 0) count += 1;
  if (params.health.length > 0) count += 1;
  if (params.labels.length > 0) count += 1;
  return count;
}

/** Refinements the desktop toolbar keeps behind its "More" button (priority, owner, engagement, sub-projects). */
export function countSecondaryRefinements(
  params: Pick<ParsedProjectParams, "priority" | "owner" | "includeSub" | "engagement">,
): number {
  return (params.priority ? 1 : 0) + (params.owner ? 1 : 0) + (params.includeSub ? 1 : 0) + (params.engagement.length > 0 ? 1 : 0);
}

/** Number of narrowing filters set (sort and view do not count). */
export function countActiveFilters(params: ParsedProjectParams): number {
  return (params.q ? 1 : 0) + countRefinements(params);
}
