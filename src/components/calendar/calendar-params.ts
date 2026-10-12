/**
 * URL state of /calendar (SPEC §19.1), shared by the server page and the
 * client toolbar: `?view=month|week&date=YYYY-MM-DD&scope=mine|all&project=
 * &client=&label=&assignee=me|none|<userId>`. Defaults (month, today, mine)
 * are left out of the URL.
 */
import { isDateOnly } from "@/lib/workspace-time";
import type { CalendarViewMode } from "./calendar-dates";

export type CalendarScope = "mine" | "all";

/** Assignee filter of the "all" scope: "" = everyone, "me", "none" (unassigned) or a user id. */
export type CalendarAssigneeParam = string;

export const ASSIGNEE_ME = "me";
export const ASSIGNEE_NONE = "none";

export interface CalendarParams {
  view: CalendarViewMode;
  /** Anchor date (valid "YYYY-MM-DD"); the workspace today when absent or malformed. */
  date: string;
  /** True when the URL named a date (the Today button clears it). */
  hasDate: boolean;
  scope: CalendarScope;
  projectId: string;
  clientId: string;
  labelId: string;
  assignee: CalendarAssigneeParam;
}

export type RawCalendarSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function parseCalendarParams(raw: RawCalendarSearchParams, today: string): CalendarParams {
  const date = first(raw.date);
  const validDate = isDateOnly(date);
  const scope = first(raw.scope) === "all" ? "all" : "mine";
  return {
    view: first(raw.view) === "week" ? "week" : "month",
    date: validDate ? date : today,
    hasDate: validDate,
    scope,
    projectId: first(raw.project),
    clientId: first(raw.client),
    labelId: first(raw.label),
    // The assignee filter only exists in the "all" scope.
    assignee: scope === "all" ? first(raw.assignee) : "",
  };
}

/** Number of narrowing filters in effect (scope not included). */
export function countCalendarFilters(params: Pick<CalendarParams, "projectId" | "clientId" | "labelId" | "assignee">): number {
  return [params.projectId, params.clientId, params.labelId, params.assignee].filter(Boolean).length;
}

/**
 * The data-layer assignee for a URL value: undefined = no filter, null =
 * unassigned, otherwise a user id ("me" resolves to the viewer).
 */
export function resolveAssignee(value: CalendarAssigneeParam, viewerId: string): string | null | undefined {
  if (!value) return undefined;
  if (value === ASSIGNEE_ME) return viewerId;
  if (value === ASSIGNEE_NONE) return null;
  return value;
}
