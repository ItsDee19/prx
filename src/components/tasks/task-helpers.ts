/**
 * Pure helpers shared by the task components (client and server). No React,
 * no data access: safe to import from server components and client islands.
 */
import { CLOSED_TASK_STATUSES } from "@/lib/constants";
import type { MyTaskGroup, TaskStatus } from "@/lib/types";
import { addDaysISO, startOfWeekISO } from "@/lib/workspace-time";

/** URL param that opens the task drawer anywhere in the app (`?task=PRX-12`). */
export const TASK_PARAM = "task";

export type TaskView = "board" | "list";
export type TaskGroupBy = "milestone" | "status" | "due" | "none";

export const TASK_GROUP_BY_OPTIONS: { value: TaskGroupBy; label: string }[] = [
  { value: "milestone", label: "Phase" },
  { value: "status", label: "Status" },
  { value: "due", label: "Due date" },
  { value: "none", label: "No grouping" },
];

export const MY_TASK_GROUP_ORDER: MyTaskGroup[] = ["overdue", "today", "this_week", "later", "no_date"];

export const MY_TASK_GROUP_LABELS: Record<MyTaskGroup, string> = {
  overdue: "Overdue",
  today: "Today",
  this_week: "This week",
  later: "Later",
  no_date: "No date",
};

/** Same buckets as listMyTasks (SPEC §17.2): this_week runs to the end of the ISO week. */
export function dueGroupOf(dueDate: string | null, today: string): MyTaskGroup {
  if (!dueDate) return "no_date";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  return dueDate <= addDaysISO(startOfWeekISO(today), 6) ? "this_week" : "later";
}

export function isClosedTaskStatus(status: TaskStatus): boolean {
  return CLOSED_TASK_STATUSES.includes(status);
}

/** First value of a search param. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Every non-empty value of a (possibly repeated) search param. */
export function listParam(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return [...new Set(values.map((item) => item.trim()).filter((item) => item.length > 0))];
}

export function parseTaskView(value: string | undefined, fallback: TaskView): TaskView {
  return value === "board" || value === "list" ? value : fallback;
}

export function parseGroupBy(value: string | undefined, fallback: TaskGroupBy): TaskGroupBy {
  return TASK_GROUP_BY_OPTIONS.some((option) => option.value === value) ? (value as TaskGroupBy) : fallback;
}

/**
 * The current URL with `?task=<key>` set (other params kept), so opening a
 * task never drops the page's filters. Pass `null` to remove the param.
 */
export function hrefWithTask(pathname: string, search: string, key: string | null): string {
  const params = new URLSearchParams(search);
  if (key) params.set(TASK_PARAM, key);
  else params.delete(TASK_PARAM);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Canonical full-page URL of a task. */
export function taskPageHref(key: string): string {
  return `/tasks/${encodeURIComponent(key)}`;
}
