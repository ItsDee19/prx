"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  countUnread,
  isWatching,
  listNotifications,
  listWatchers,
  markAllRead,
  markRead,
  unwatch,
  watch,
  watchEntityExists,
} from "@/lib/data/notifications";
import { notificationFiltersSchema, notificationIdsSchema, watchEntitySchema } from "@/lib/schemas/notifications";
import type { ActionResult, AppNotification, NotificationFilters, UserSummary, WatchEntity } from "@/lib/types";

/*
 * Inbox and watching (SPEC §18.2). Read state and watch state are personal:
 * no activity. Mark-read actions skip the layout revalidation (the bell and
 * the inbox refresh themselves).
 */

const GONE = "This item no longer exists.";

function failure<T>(scope: string, error: unknown, fallback: string): ActionResult<T> {
  console.error(`${scope} failed`, error);
  return { ok: false, error: fallback };
}

export async function getUnreadCountAction(): Promise<ActionResult<number>> {
  const user = await requireUser();
  try {
    return { ok: true, data: await countUnread(user.id) };
  } catch (error) {
    return failure("getUnreadCountAction", error, "Could not load notifications.");
  }
}

export async function listNotificationsAction(filters?: NotificationFilters): Promise<ActionResult<AppNotification[]>> {
  const user = await requireUser();
  const parsed = notificationFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) return { ok: false, error: "Could not load notifications." };
  try {
    return { ok: true, data: await listNotifications(user.id, parsed.data) };
  } catch (error) {
    return failure("listNotificationsAction", error, "Could not load notifications. Please try again.");
  }
}

/** Own notifications only: ids belonging to someone else are ignored. */
export async function markNotificationsReadAction(ids: string[]): Promise<ActionResult<number>> {
  const user = await requireUser();
  const parsed = notificationIdsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Could not mark these as read." };
  try {
    return { ok: true, data: await markRead(user.id, parsed.data) };
  } catch (error) {
    return failure("markNotificationsReadAction", error, "Could not mark these as read. Please try again.");
  }
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<number>> {
  const user = await requireUser();
  try {
    return { ok: true, data: await markAllRead(user.id) };
  } catch (error) {
    return failure("markAllNotificationsReadAction", error, "Could not mark everything as read. Please try again.");
  }
}

/** Explicit Watch (clears a previous Unwatch). Returns the new watching state. */
export async function watchAction(entity: WatchEntity): Promise<ActionResult<boolean>> {
  const user = await requireUser();
  const parsed = watchEntitySchema.safeParse(entity);
  if (!parsed.success) return { ok: false, error: GONE };
  try {
    if (!(await watchEntityExists(parsed.data))) return { ok: false, error: GONE };
    await watch(user.id, parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, data: await isWatching(user.id, parsed.data) };
  } catch (error) {
    return failure("watchAction", error, "Could not watch this. Please try again.");
  }
}

/** Explicit Unwatch: stops notifications even for owners, members and assignees. */
export async function unwatchAction(entity: WatchEntity): Promise<ActionResult<boolean>> {
  const user = await requireUser();
  const parsed = watchEntitySchema.safeParse(entity);
  if (!parsed.success) return { ok: false, error: GONE };
  try {
    if (!(await watchEntityExists(parsed.data))) return { ok: false, error: GONE };
    await unwatch(user.id, parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, data: await isWatching(user.id, parsed.data) };
  } catch (error) {
    return failure("unwatchAction", error, "Could not stop watching. Please try again.");
  }
}

export async function getWatchStateAction(
  entity: WatchEntity,
): Promise<ActionResult<{ watching: boolean; watchers: UserSummary[] }>> {
  const user = await requireUser();
  const parsed = watchEntitySchema.safeParse(entity);
  if (!parsed.success) return { ok: false, error: GONE };
  try {
    if (!(await watchEntityExists(parsed.data))) return { ok: false, error: GONE };
    const watchers = await listWatchers(parsed.data);
    return { ok: true, data: { watching: watchers.some((watcher) => watcher.id === user.id), watchers } };
  } catch (error) {
    return failure("getWatchStateAction", error, "Could not load the watchers. Please try again.");
  }
}
