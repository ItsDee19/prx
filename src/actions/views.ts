"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getProjectSummary } from "@/lib/data/projects";
import {
  createSavedView,
  deleteSavedView,
  getSavedView,
  reorderFavorites,
  reorderSavedViews,
  toggleFavorite,
  updateSavedView,
} from "@/lib/data/views";
import {
  createSavedViewSchema,
  favoriteProjectIdSchema,
  orderedIdsSchema,
  savedViewIdSchema,
  updateSavedViewSchema,
} from "@/lib/schemas/views";
import type { ActionResult, CreateSavedViewInput, SavedView, UpdateSavedViewInput } from "@/lib/types";
import { fieldErrorsFromIssues } from "@/lib/validation";

/*
 * Saved views and favourites (SPEC §18.4). Personal state: no activity
 * (§23.1). Every action revalidates the layout so the sidebar sections and
 * the command palette pick up the change.
 */

const VIEW_GONE = "This view no longer exists.";

function revalidate(): void {
  revalidatePath("/", "layout");
}

function invalid<T>(issues: z.core.$ZodIssue[], fallback: string): ActionResult<T> {
  const fieldErrors = fieldErrorsFromIssues(issues);
  const first = Object.values(fieldErrors)[0];
  return { ok: false, error: first ?? fallback, fieldErrors };
}

/** User-facing data-layer messages pass through; database errors get the fallback. */
function failure<T>(scope: string, error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof Error && error.constructor === Error && !("code" in error) && /[.!?]$/.test(error.message)) {
    return { ok: false, error: error.message };
  }
  console.error(`${scope} failed`, error);
  return { ok: false, error: fallback };
}

/** Member: saves the current page's filters as a personal (or shared) view. */
export async function createSavedViewAction(input: CreateSavedViewInput): Promise<ActionResult<SavedView>> {
  const user = await requireUser();
  const parsed = createSavedViewSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues, "Please fix the highlighted fields.");

  try {
    const view = await createSavedView(user.id, parsed.data);
    revalidate();
    return { ok: true, data: view };
  } catch (error) {
    return failure("createSavedViewAction", error, "Could not save the view. Please try again.");
  }
}

/** Owner only: rename, share / unshare, or replace the filters. */
export async function updateSavedViewAction(id: string, input: UpdateSavedViewInput): Promise<ActionResult<SavedView>> {
  const user = await requireUser();
  const idParsed = savedViewIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: VIEW_GONE };
  const parsed = updateSavedViewSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues, "Please fix the highlighted fields.");

  try {
    const existing = await getSavedView(idParsed.data);
    if (!existing) return { ok: false, error: VIEW_GONE };
    if (existing.user_id !== user.id) return { ok: false, error: "Only the person who saved this view can change it." };

    const view = await updateSavedView(idParsed.data, parsed.data);
    revalidate();
    return { ok: true, data: view };
  } catch (error) {
    return failure("updateSavedViewAction", error, "Could not update the view. Please try again.");
  }
}

/** Owner or admin (admins can remove a shared view that is no longer useful). */
export async function deleteSavedViewAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = savedViewIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: VIEW_GONE };

  try {
    const existing = await getSavedView(idParsed.data);
    if (!existing) return { ok: false, error: VIEW_GONE };
    if (existing.user_id !== user.id && user.role !== "admin") {
      return { ok: false, error: "Only the person who saved this view or an admin can delete it." };
    }
    await deleteSavedView(idParsed.data);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure("deleteSavedViewAction", error, "Could not delete the view. Please try again.");
  }
}

/** Reorders the viewer's own views (ids of other people's views are ignored). */
export async function reorderSavedViewsAction(orderedIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = orderedIdsSchema.safeParse(orderedIds);
  if (!parsed.success) return invalid(parsed.error.issues, "Could not read the new order.");

  try {
    await reorderSavedViews(user.id, parsed.data);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure("reorderSavedViewsAction", error, "Could not reorder the views. Please try again.");
  }
}

/** Member: stars or unstars a project for the viewer; returns the new state. */
export async function toggleFavoriteAction(projectId: string): Promise<ActionResult<boolean>> {
  const user = await requireUser();
  const parsed = favoriteProjectIdSchema.safeParse(projectId);
  if (!parsed.success) return { ok: false, error: "This project no longer exists." };

  try {
    if (!(await getProjectSummary(parsed.data))) return { ok: false, error: "This project no longer exists." };
    const starred = await toggleFavorite(user.id, parsed.data);
    revalidate();
    return { ok: true, data: starred };
  } catch (error) {
    return failure("toggleFavoriteAction", error, "Could not update your favourites. Please try again.");
  }
}

/** Reorders the viewer's favourites (unknown ids are ignored). */
export async function reorderFavoritesAction(orderedIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = orderedIdsSchema.safeParse(orderedIds);
  if (!parsed.success) return invalid(parsed.error.issues, "Could not read the new order.");

  try {
    await reorderFavorites(user.id, parsed.data);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure("reorderFavoritesAction", error, "Could not reorder your favourites. Please try again.");
  }
}
