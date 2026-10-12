import { db, newId, nowISO, transaction, type Queryable } from "@/lib/db";
import { MAX_SAVED_VIEW_FILTERS_LENGTH } from "@/lib/constants";
import {
  MAX_SAVED_VIEWS_PER_USER,
  SAVED_VIEW_NAME_MAX,
  normalizeSavedViewFilters,
  savedViewFiltersLength,
} from "@/lib/schemas/views";
import {
  SAVED_VIEW_SCOPES,
  type CreateSavedViewInput,
  type FavoriteProject,
  type ProjectStatus,
  type RagHealth,
  type SavedView,
  type SavedViewFilters,
  type SavedViewScope,
  type UpdateSavedViewInput,
} from "@/lib/types";

/*
 * Saved views and favourites (SPEC §16 saved_views / favorites, §17.7).
 *
 * A saved view stores a page's URL params (`filters`, JSONB object) for one
 * scope; it is personal unless `is_shared`, in which case every member sees
 * it (only the owner edits or reorders it). Favourites pin projects to the
 * sidebar in the person's own order. Both are personal state: no activity.
 */

/** Most projects one person can star (keeps the sidebar usable). */
export const MAX_FAVORITES_PER_USER = 50;

/* ------------------------------ Saved views ----------------------------- */

interface SavedViewRow {
  id: string;
  user_id: string;
  scope: SavedViewScope;
  name: string;
  filters: unknown;
  is_shared: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  owner_name: string;
  owner_email: string;
  owner_color: string;
  owner_job_title: string | null;
}

const VIEW_SELECT = `
  SELECT v.id, v.user_id, v.scope, v.name, v.filters, v.is_shared, v.position, v.created_at, v.updated_at,
         u.name AS owner_name, u.email AS owner_email, u.color AS owner_color, u.job_title AS owner_job_title
    FROM saved_views v
    JOIN users u ON u.id = v.user_id`;

/** Filters read back from JSONB, re-normalised so a hand-edited row cannot break a page. */
function toFilters(raw: unknown): SavedViewFilters {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const entries: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") entries[key] = value;
    else if (Array.isArray(value)) entries[key] = value.filter((item): item is string => typeof item === "string");
  }
  return normalizeSavedViewFilters(entries);
}

function toSavedView(row: SavedViewRow): SavedView {
  return {
    id: row.id,
    user_id: row.user_id,
    scope: row.scope,
    name: row.name,
    filters: toFilters(row.filters),
    is_shared: row.is_shared,
    position: row.position,
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner: {
      id: row.user_id,
      name: row.owner_name,
      email: row.owner_email,
      color: row.owner_color,
      job_title: row.owner_job_title,
    },
  };
}

function cleanName(name: string): string {
  const value = name.trim().replace(/\s+/g, " ");
  if (!value) throw new Error("Give the view a name.");
  if (value.length > SAVED_VIEW_NAME_MAX) throw new Error(`View names must be ${SAVED_VIEW_NAME_MAX} characters or fewer.`);
  return value;
}

function cleanFilters(filters: SavedViewFilters): SavedViewFilters {
  const value = normalizeSavedViewFilters(filters);
  if (savedViewFiltersLength(value) > MAX_SAVED_VIEW_FILTERS_LENGTH) {
    throw new Error("This view has too many filters to save. Remove a few and try again.");
  }
  return value;
}

function isScope(value: unknown): value is SavedViewScope {
  return typeof value === "string" && (SAVED_VIEW_SCOPES as readonly string[]).includes(value);
}

async function assertUniqueName(
  q: Queryable,
  userId: string,
  scope: SavedViewScope,
  name: string,
  exceptId: string | null,
): Promise<void> {
  const clash = await q.queryOne<{ id: string }>(
    `SELECT id FROM saved_views
      WHERE user_id = $1 AND scope = $2 AND lower(name) = lower($3) AND ($4::text IS NULL OR id <> $4::text)
      LIMIT 1`,
    [userId, scope, name, exceptId],
  );
  if (clash) throw new Error(`You already have a view called "${name}". Pick another name.`);
}

/**
 * The viewer's own views (by their position) followed by views other people
 * shared (by name). `scope` narrows to one page.
 */
export async function listSavedViews(userId: string, scope?: SavedViewScope): Promise<SavedView[]> {
  const params: (string | null)[] = [userId, scope ?? null];
  const rows = await db.query<SavedViewRow>(
    `${VIEW_SELECT}
      WHERE (v.user_id = $1 OR v.is_shared = TRUE) AND ($2::text IS NULL OR v.scope = $2::text)
      ORDER BY (v.user_id = $1) DESC,
               CASE WHEN v.user_id = $1 THEN v.position END ASC NULLS LAST,
               lower(v.name) ASC, v.created_at ASC, v.id ASC`,
    params,
  );
  return rows.map(toSavedView);
}

export async function getSavedView(id: string, q: Queryable = db): Promise<SavedView | null> {
  const row = await q.queryOne<SavedViewRow>(`${VIEW_SELECT} WHERE v.id = $1`, [id]);
  return row ? toSavedView(row) : null;
}

/** New view at the end of the owner's list. Names are unique per owner and scope (case-insensitive). */
export async function createSavedView(userId: string, input: CreateSavedViewInput): Promise<SavedView> {
  if (!isScope(input.scope)) throw new Error("Choose where the view applies.");
  const name = cleanName(input.name);
  const filters = cleanFilters(input.filters);

  return transaction(async (tx) => {
    // Serialise concurrent creates by the same person (position and the per-user cap).
    await tx.execute("SELECT pg_advisory_xact_lock(hashtext('saved_views:' || $1))", [userId]);
    const stats = await tx.queryOne<{ count: number; next: number }>(
      "SELECT COUNT(*)::int AS count, (COALESCE(MAX(position), -1) + 1)::int AS next FROM saved_views WHERE user_id = $1",
      [userId],
    );
    if ((stats?.count ?? 0) >= MAX_SAVED_VIEWS_PER_USER) {
      throw new Error(`You can keep up to ${MAX_SAVED_VIEWS_PER_USER} saved views. Delete one first.`);
    }
    await assertUniqueName(tx, userId, input.scope, name, null);

    const id = newId();
    const now = nowISO();
    await tx.execute(
      `INSERT INTO saved_views (id, user_id, scope, name, filters, is_shared, position, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $8)`,
      [id, userId, input.scope, name, JSON.stringify(filters), input.is_shared === true, stats?.next ?? 0, now],
    );
    const view = await getSavedView(id, tx);
    if (!view) throw new Error("Could not save the view.");
    return view;
  });
}

/** Rename, re-share or replace the filters (only the keys given). */
export async function updateSavedView(id: string, patch: UpdateSavedViewInput): Promise<SavedView> {
  return transaction(async (tx) => {
    const existing = await tx.queryOne<{ user_id: string; scope: SavedViewScope }>(
      "SELECT user_id, scope FROM saved_views WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!existing) throw new Error("This view no longer exists.");

    const sets: string[] = [];
    const params: (string | boolean)[] = [];
    const add = (value: string | boolean) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (patch.name !== undefined) {
      const name = cleanName(patch.name);
      await assertUniqueName(tx, existing.user_id, existing.scope, name, id);
      sets.push(`name = ${add(name)}`);
    }
    if (patch.filters !== undefined) sets.push(`filters = ${add(JSON.stringify(cleanFilters(patch.filters)))}::jsonb`);
    if (patch.is_shared !== undefined) sets.push(`is_shared = ${add(patch.is_shared === true)}`);

    if (sets.length > 0) {
      sets.push(`updated_at = ${add(nowISO())}`);
      await tx.execute(`UPDATE saved_views SET ${sets.join(", ")} WHERE id = ${add(id)}`, params);
    }
    const view = await getSavedView(id, tx);
    if (!view) throw new Error("This view no longer exists.");
    return view;
  });
}

export async function deleteSavedView(id: string): Promise<void> {
  await db.execute("DELETE FROM saved_views WHERE id = $1", [id]);
}

/**
 * Final order for a reorder call: the given ids that belong to the list
 * first, then every other existing id in its current order (so a stale or
 * partial list never drops or duplicates positions).
 */
function mergeOrder(current: readonly string[], ordered: readonly string[]): string[] {
  const known = new Set(current);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ordered) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of current) if (!seen.has(id)) result.push(id);
  return result;
}

/** Rewrites positions 0..n-1 for `ids` in `table` (rows of `userId` only). */
async function writePositions(
  tx: Queryable,
  table: "saved_views" | "favorites",
  idColumn: "id" | "project_id",
  userId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await tx.execute(
    `UPDATE ${table} AS t SET position = (o.ord - 1)::int
       FROM unnest($1::text[]) WITH ORDINALITY AS o(id, ord)
      WHERE t.${idColumn} = o.id AND t.user_id = $2 AND t.position <> (o.ord - 1)::int`,
    [ids, userId],
  );
}

/** Reorders the person's own views (other people's shared views keep their place). */
export async function reorderSavedViews(userId: string, orderedIds: string[]): Promise<void> {
  await transaction(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      "SELECT id FROM saved_views WHERE user_id = $1 ORDER BY position ASC, created_at ASC, id ASC FOR UPDATE",
      [userId],
    );
    const next = mergeOrder(
      rows.map((row) => row.id),
      orderedIds,
    );
    await writePositions(tx, "saved_views", "id", userId, next);
  });
}

/* ------------------------------ Favourites ------------------------------ */

interface FavoriteRow {
  project_id: string;
  name: string;
  color: string | null;
  status: ProjectStatus;
  health: RagHealth | null;
  client_code: string | null;
  position: number;
}

/** Starred projects in the person's order. */
export async function listFavorites(userId: string): Promise<FavoriteProject[]> {
  return db.query<FavoriteRow>(
    `SELECT f.project_id, p.name, p.color, p.status, p.health, cl.code AS client_code, f.position
       FROM favorites f
       JOIN projects p ON p.id = f.project_id
       LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE f.user_id = $1
      ORDER BY f.position ASC, f.created_at ASC, f.project_id ASC`,
    [userId],
  );
}

/** Ids of the person's starred projects (for FavoriteToggle on lists and cards). */
export async function listFavoriteProjectIds(userId: string): Promise<string[]> {
  const rows = await db.query<{ project_id: string }>(
    "SELECT project_id FROM favorites WHERE user_id = $1 ORDER BY position ASC, created_at ASC",
    [userId],
  );
  return rows.map((row) => row.project_id);
}

export async function isFavorite(userId: string, projectId: string): Promise<boolean> {
  const row = await db.queryOne<{ starred: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM favorites WHERE user_id = $1 AND project_id = $2) AS starred",
    [userId, projectId],
  );
  return row?.starred === true;
}

/** Stars (at the end of the list) or unstars a project; returns the new state. */
export async function toggleFavorite(userId: string, projectId: string): Promise<boolean> {
  return transaction(async (tx) => {
    await tx.execute("SELECT pg_advisory_xact_lock(hashtext('favorites:' || $1))", [userId]);
    const removed = await tx.execute("DELETE FROM favorites WHERE user_id = $1 AND project_id = $2", [userId, projectId]);
    if (removed > 0) return false;

    const project = await tx.queryOne<{ id: string }>("SELECT id FROM projects WHERE id = $1", [projectId]);
    if (!project) throw new Error("This project no longer exists.");
    const stats = await tx.queryOne<{ count: number; next: number }>(
      "SELECT COUNT(*)::int AS count, (COALESCE(MAX(position), -1) + 1)::int AS next FROM favorites WHERE user_id = $1",
      [userId],
    );
    if ((stats?.count ?? 0) >= MAX_FAVORITES_PER_USER) {
      throw new Error(`You can star up to ${MAX_FAVORITES_PER_USER} projects. Unstar one first.`);
    }
    await tx.execute(
      `INSERT INTO favorites (user_id, project_id, position, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, project_id) DO NOTHING`,
      [userId, projectId, stats?.next ?? 0, nowISO()],
    );
    return true;
  });
}

export async function reorderFavorites(userId: string, orderedIds: string[]): Promise<void> {
  await transaction(async (tx) => {
    const rows = await tx.query<{ project_id: string }>(
      "SELECT project_id FROM favorites WHERE user_id = $1 ORDER BY position ASC, created_at ASC, project_id ASC FOR UPDATE",
      [userId],
    );
    const next = mergeOrder(
      rows.map((row) => row.project_id),
      orderedIds,
    );
    await writePositions(tx, "favorites", "project_id", userId, next);
  });
}
