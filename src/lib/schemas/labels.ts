import { z } from "zod";
import { LABEL_GROUPS } from "@/lib/types";

/** zod schemas for the label catalogue and label assignments (W2 commercial). */

export const LABEL_NAME_MAX_LENGTH = 40;
/** A project can carry at most this many labels. */
export const MAX_LABELS_PER_ENTITY = 30;

const labelName = z
  .string({ error: "Give the label a name" })
  .trim()
  .min(1, "Give the label a name")
  .max(LABEL_NAME_MAX_LENGTH, `Label names must be ${LABEL_NAME_MAX_LENGTH} characters or fewer`);

const labelColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid colour");

export const createLabelSchema = z.object({
  name: labelName,
  color: labelColor.optional(),
  label_group: z.enum(LABEL_GROUPS, { error: "Choose a valid group" }).optional(),
});

export const updateLabelSchema = createLabelSchema.partial();

export const labelIdsSchema = z
  .array(z.string().min(1))
  .max(MAX_LABELS_PER_ENTITY, `Pick at most ${MAX_LABELS_PER_ENTITY} labels`);

export const labelIdSchema = z.string().min(1, "Choose a label");
