import { RECENT_ITEMS_MAX, STORAGE_KEYS } from "@/lib/constants";
import type { LabelSearchHit } from "@/lib/schemas/search";
import type { SearchHit } from "@/lib/types";

/** Pure helpers shared by the palette and the hotkeys (client safe). */

export type PaletteHit = SearchHit | LabelSearchHit;
export type PaletteHitKind = PaletteHit["kind"];

const HIT_KINDS: readonly PaletteHitKind[] = ["project", "task", "client", "person", "comment", "label"];

/** The project id on `/projects/[id]` (any query or hash ignored), else null. */
export function projectIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = /^\/projects\/([^/?#]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/* ----------------------------- filtering ---------------------------- */

/**
 * Score for the palette's own items (navigation, actions, saved views):
 * 0 hides the item; 3 = label starts with the query, 2 = a word of the label
 * starts with it, 1 = every query word appears in the label or keywords.
 */
export function scorePaletteItem(label: string, keywords: readonly string[] | undefined, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const name = label.toLowerCase();
  const haystack = `${name} ${(keywords ?? []).join(" ").toLowerCase()}`;
  if (!q.split(/\s+/).every((word) => haystack.includes(word))) return 0;
  if (name.startsWith(q)) return 3;
  if (name.split(/[\s/-]+/).some((word) => word.startsWith(q))) return 2;
  return 1;
}

/** Items that match `query`, best first (stable for equal scores). */
export function filterPaletteItems<T>(
  items: readonly T[],
  query: string,
  text: (item: T) => { label: string; keywords?: readonly string[] },
): T[] {
  return items
    .map((item, index) => {
      const { label, keywords } = text(item);
      return { item, index, score: scorePaletteItem(label, keywords, query) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

/* ---------------------------- recent items -------------------------- */

function isHit(value: unknown): value is PaletteHit {
  if (!value || typeof value !== "object") return false;
  const hit = value as Record<string, unknown>;
  const nullableString = (key: string) => hit[key] === null || typeof hit[key] === "string";
  return (
    typeof hit.kind === "string" &&
    (HIT_KINDS as readonly string[]).includes(hit.kind) &&
    typeof hit.id === "string" &&
    typeof hit.title === "string" &&
    typeof hit.href === "string" &&
    hit.href.startsWith("/") &&
    !hit.href.startsWith("//") &&
    nullableString("subtitle") &&
    nullableString("badge") &&
    nullableString("color")
  );
}

/** Recently opened palette results, newest first; [] when storage is unavailable or corrupt. */
export function readRecentItems(): PaletteHit[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.recent);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isHit).slice(0, RECENT_ITEMS_MAX) : [];
  } catch {
    return [];
  }
}

/** Puts `hit` first in the recent list (deduplicated, capped) and returns the new list. */
export function rememberRecentItem(hit: PaletteHit): PaletteHit[] {
  const entry: PaletteHit = { ...hit };
  const next = [entry, ...readRecentItems().filter((item) => !(item.kind === hit.kind && item.id === hit.id))].slice(
    0,
    RECENT_ITEMS_MAX,
  );
  try {
    window.localStorage.setItem(STORAGE_KEYS.recent, JSON.stringify(next));
  } catch {
    // Private mode or full storage: recents simply are not kept.
  }
  return next;
}

/** Empties the recent list. */
export function clearRecentItems(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEYS.recent);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
