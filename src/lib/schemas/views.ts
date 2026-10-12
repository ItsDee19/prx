import { z } from "zod";
import { MAX_SAVED_VIEW_FILTERS_LENGTH } from "@/lib/constants";
import { SAVED_VIEW_SCOPES, type SavedViewFilters } from "@/lib/types";

/** zod schemas and pure helpers for saved views and favourites (W5 productivity). */

export const SAVED_VIEW_NAME_MAX = 60;
/** Most saved views one person can keep (all scopes together). */
export const MAX_SAVED_VIEWS_PER_USER = 100;
/** Most ids accepted by one reorder call. */
export const MAX_REORDER_IDS = 200;
/** Limits on one saved view's filters (the page's URL params). */
export const SAVED_VIEW_MAX_KEYS = 20;
export const SAVED_VIEW_MAX_VALUES_PER_KEY = 50;
export const SAVED_VIEW_KEY_MAX = 40;
export const SAVED_VIEW_VALUE_MAX = 200;

/**
 * URL params that describe a transient UI state rather than a filter (an open
 * task drawer, a composer deep link), so they are never saved into a view.
 */
export const SAVED_VIEW_IGNORED_PARAMS: readonly string[] = ["task", "compose", "new"];

const KEY_PATTERN = /^[A-Za-z0-9_.-]+$/;

/**
 * Canonical filters from URL params: drops ignored and malformed keys and
 * empty values, trims values, removes duplicates, keeps one string for a
 * single value and an array for repeated params, and sorts keys so equal
 * filters serialise identically. Pure; safe on the client and the server.
 */
export function normalizeSavedViewFilters(
  input: URLSearchParams | Readonly<Record<string, string | readonly string[] | undefined>>,
): SavedViewFilters {
  const collected = new Map<string, string[]>();
  const add = (key: string, value: string) => {
    if (!KEY_PATTERN.test(key) || key.length > SAVED_VIEW_KEY_MAX) return;
    if (SAVED_VIEW_IGNORED_PARAMS.includes(key)) return;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > SAVED_VIEW_VALUE_MAX) return;
    const list = collected.get(key) ?? [];
    if (!list.includes(trimmed) && list.length < SAVED_VIEW_MAX_VALUES_PER_KEY) list.push(trimmed);
    collected.set(key, list);
  };

  if (input instanceof URLSearchParams) {
    input.forEach((value, key) => add(key, value));
  } else {
    for (const [key, raw] of Object.entries(input)) {
      if (raw === undefined) continue;
      const values: readonly string[] = typeof raw === "string" ? [raw] : raw;
      for (const value of values) if (typeof value === "string") add(key, value);
    }
  }

  const result: SavedViewFilters = {};
  for (const key of [...collected.keys()].sort().slice(0, SAVED_VIEW_MAX_KEYS)) {
    const values = collected.get(key) ?? [];
    if (values.length === 0) continue;
    result[key] = values.length === 1 ? values[0] : values;
  }
  return result;
}

/** Serialised length used for the MAX_SAVED_VIEW_FILTERS_LENGTH cap. */
export function savedViewFiltersLength(filters: SavedViewFilters): number {
  return JSON.stringify(filters).length;
}

/** true when two filter sets describe the same view (order-insensitive). */
export function sameSavedViewFilters(a: SavedViewFilters, b: SavedViewFilters): boolean {
  const left = normalizeSavedViewFilters(a);
  const right = normalizeSavedViewFilters(b);
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => {
    const x = left[key];
    const y = right[key];
    if (y === undefined) return false;
    const xs = (typeof x === "string" ? [x] : x).slice().sort();
    const ys = (typeof y === "string" ? [y] : y).slice().sort();
    return xs.length === ys.length && xs.every((value, index) => value === ys[index]);
  });
}

export const savedViewIdSchema = z.string({ error: "This view no longer exists." }).trim().min(1, "This view no longer exists.");

export const savedViewScopeSchema = z.enum(SAVED_VIEW_SCOPES, { error: "Choose where the view applies" });

export const savedViewNameSchema = z
  .string({ error: "Give the view a name" })
  .trim()
  .min(1, "Give the view a name")
  .max(SAVED_VIEW_NAME_MAX, `View names must be ${SAVED_VIEW_NAME_MAX} characters or fewer`);

export const savedViewFiltersSchema = z
  .record(z.string(), z.union([z.string(), z.array(z.string())]), { error: "These filters can't be saved" })
  .transform((value) => normalizeSavedViewFilters(value))
  .refine(
    (value) => savedViewFiltersLength(value) <= MAX_SAVED_VIEW_FILTERS_LENGTH,
    "This view has too many filters to save. Remove a few and try again.",
  );

export const createSavedViewSchema = z
  .object({
    scope: savedViewScopeSchema,
    name: savedViewNameSchema,
    filters: savedViewFiltersSchema,
    is_shared: z.boolean().optional(),
  })
  .strict();

export const updateSavedViewSchema = z
  .object({
    name: savedViewNameSchema.optional(),
    filters: savedViewFiltersSchema.optional(),
    is_shared: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.filters !== undefined || value.is_shared !== undefined, {
    message: "Nothing to change.",
  });

export const orderedIdsSchema = z
  .array(z.string().trim().min(1).max(64), { error: "Send the new order as a list" })
  .max(MAX_REORDER_IDS, `Reorder at most ${MAX_REORDER_IDS} items at once`)
  .refine((ids) => new Set(ids).size === ids.length, "Each item can appear only once.");

export const favoriteProjectIdSchema = z.string({ error: "Choose a project" }).trim().min(1, "Choose a project");

export type CreateSavedViewSchemaInput = z.infer<typeof createSavedViewSchema>;
export type UpdateSavedViewSchemaInput = z.infer<typeof updateSavedViewSchema>;
