import { OPEN_RISK_STATUSES, RISK_IMPACT_LABELS, RISK_LIKELIHOOD_LABELS } from "@/lib/constants";
import {
  RISK_CATEGORIES,
  RISK_KINDS,
  type RagHealth,
  type RiskCategory,
  type RiskKind,
  type RiskStatus,
  type RiskWithMeta,
} from "@/lib/types";

/** Status filter of the Risks tab (`?status=`): active = everything not closed (default). */
export const RISK_STATUS_FILTERS = ["active", "open", "closed", "all"] as const;
export type RiskStatusFilter = (typeof RISK_STATUS_FILTERS)[number];

export const RISK_STATUS_FILTER_LABELS: Record<RiskStatusFilter, string> = {
  active: "Not closed",
  open: "Open",
  closed: "Closed",
  all: "All",
};

export interface RiskTabFilters {
  kind: RiskKind | null;
  status: RiskStatusFilter;
  category: RiskCategory | null;
  /** A user id, "me" or "none". */
  owner: string | null;
  likelihood: number | null;
  impact: number | null;
}

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function scale(value: string | undefined): number | null {
  if (!value || !/^[1-5]$/.test(value)) return null;
  return Number(value);
}

/** Reads the tab's filters from the page's searchParams (invalid values are ignored). */
export function parseRiskFilters(params: Params): RiskTabFilters {
  const kind = first(params.kind);
  const status = first(params.status);
  const category = first(params.category);
  const owner = first(params.owner);
  const likelihood = scale(first(params.l));
  const impact = scale(first(params.i));
  return {
    kind: kind && (RISK_KINDS as readonly string[]).includes(kind) ? (kind as RiskKind) : null,
    status: status && (RISK_STATUS_FILTERS as readonly string[]).includes(status) ? (status as RiskStatusFilter) : "active",
    category:
      category && (RISK_CATEGORIES as readonly string[]).includes(category) ? (category as RiskCategory) : null,
    owner: owner && owner.length <= 64 ? owner : null,
    // A heat-map cell needs both coordinates.
    likelihood: likelihood !== null && impact !== null ? likelihood : null,
    impact: likelihood !== null && impact !== null ? impact : null,
  };
}

export function matchesStatus(status: RiskStatus, filter: RiskStatusFilter): boolean {
  switch (filter) {
    case "active":
      return status !== "closed";
    case "open":
      return OPEN_RISK_STATUSES.includes(status);
    case "closed":
      return status === "closed";
    default:
      return true;
  }
}

/** Every filter except `kind` (the kind tabs show counts across kinds). */
export function matchesExceptKind(risk: RiskWithMeta, filters: RiskTabFilters, viewerId: string): boolean {
  if (!matchesStatus(risk.status, filters.status)) return false;
  if (filters.category && risk.category !== filters.category) return false;
  if (filters.owner === "none" && risk.owner_id !== null) return false;
  if (filters.owner === "me" && risk.owner_id !== viewerId) return false;
  if (filters.owner && filters.owner !== "none" && filters.owner !== "me" && risk.owner_id !== filters.owner) return false;
  if (filters.likelihood !== null && filters.impact !== null) {
    if (risk.likelihood !== filters.likelihood || risk.impact !== filters.impact) return false;
  }
  return true;
}

/** `?tab=risks` plus the given filters, in a stable order (heat-map links append `&l=&i=`). */
export function risksHref(projectId: string, filters: Partial<RiskTabFilters>): string {
  const params = new URLSearchParams({ tab: "risks" });
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.status && filters.status !== "active") params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.likelihood && filters.impact) {
    params.set("l", String(filters.likelihood));
    params.set("i", String(filters.impact));
  }
  return `/projects/${projectId}?${params.toString()}`;
}

export const SEVERITY_LABELS: Record<RagHealth, string> = {
  red: "High",
  amber: "Medium",
  green: "Low",
};

export function likelihoodLabel(value: number): string {
  return RISK_LIKELIHOOD_LABELS[value - 1] ?? String(value);
}

export function impactLabel(value: number): string {
  return RISK_IMPACT_LABELS[value - 1] ?? String(value);
}

/** Dependencies and assumptions have a "confirm by" date; everything else a due date. */
export function dueDateLabel(kind: RiskKind): string {
  return kind === "dependency" || kind === "assumption" ? "Confirm by" : "Due";
}

/** Review date has passed on an open/mitigating item. */
export function isReviewOverdue(risk: { status: RiskStatus; review_date: string | null }, today: string): boolean {
  return OPEN_RISK_STATUSES.includes(risk.status) && risk.review_date !== null && risk.review_date < today;
}
