"use server";

import { requireUser } from "@/lib/auth";
import { searchAll } from "@/lib/data/search";
import { searchQuerySchema, type GlobalSearchResults } from "@/lib/schemas/search";
import type { ActionResult } from "@/lib/types";

/**
 * Global search for the command palette (Member). Read-only: no activity and
 * no revalidation. Results never contain commercial data (see searchAll).
 */
export async function searchAction(query: string): Promise<ActionResult<GlobalSearchResults>> {
  const user = await requireUser();
  const parsed = searchQuerySchema.safeParse(query);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Type something to search for." };
  }
  try {
    return { ok: true, data: await searchAll(parsed.data, user.id) };
  } catch (error) {
    console.error("Search failed", error);
    return { ok: false, error: "Search is unavailable right now. Please try again." };
  }
}
