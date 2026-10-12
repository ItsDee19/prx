import { z } from "zod";
import { SUBSCRIPTION_ENTITY_TYPES } from "@/lib/types";

/** zod schemas for the inbox and watching (W3 notifications). */

/** Most notification ids accepted by one mark-read call. */
export const MAX_MARK_READ_IDS = 200;
/** Largest page the inbox may request. */
export const MAX_NOTIFICATION_PAGE = 100;

export const inboxTabSchema = z.enum(["unread", "mentions", "all"]);

export const notificationFiltersSchema = z
  .object({
    tab: inboxTabSchema.optional(),
    limit: z.number().int().min(1).max(MAX_NOTIFICATION_PAGE).optional(),
    /** created_at cursor (ISO timestamp of the oldest item already shown). */
    before: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

export const notificationIdsSchema = z
  .array(z.string().min(1).max(64))
  .max(MAX_MARK_READ_IDS, `Mark at most ${MAX_MARK_READ_IDS} notifications at once`);

export const watchEntitySchema = z
  .object({
    type: z.enum(SUBSCRIPTION_ENTITY_TYPES, { error: "Choose a project or a task" }),
    id: z.string().trim().min(1, "This item no longer exists."),
  })
  .strict();
