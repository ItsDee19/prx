import { z } from "zod";
import { SEARCH_QUERY_MAX } from "@/lib/constants";
import type { SearchHit, SearchResults } from "@/lib/types";

/**
 * Global search (W3 search). Pure module: safe to import from client
 * components (the palette imports the result types from here).
 */

export const searchQuerySchema = z
  .string({ error: "Type something to search for." })
  .trim()
  .min(1, "Type something to search for.")
  .max(SEARCH_QUERY_MAX, `Search for at most ${SEARCH_QUERY_MAX} characters.`);

/** A label hit: jumps to the projects list filtered by that label (`/projects?label=<id>`). */
export interface LabelSearchHit extends Omit<SearchHit, "kind"> {
  kind: "label";
}

/**
 * `SearchResults` (the §17.5 contract) plus a Labels group. Assignable to
 * `SearchResults`, so callers typed against the contract keep working.
 */
export interface GlobalSearchResults extends SearchResults {
  labels: LabelSearchHit[];
}

export function emptySearchResults(query: string): GlobalSearchResults {
  return { query, projects: [], tasks: [], clients: [], people: [], comments: [], labels: [] };
}
