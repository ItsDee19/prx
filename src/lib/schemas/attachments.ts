import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { ATTACHMENT_KINDS, LINK_TYPES } from "@/lib/types";
import { isHttpUrl } from "@/lib/utils";

/** zod schemas for attachments (W3 attachments). The data layer re-checks every rule. */

export const ATTACHMENT_NAME_MAX_LENGTH = 200;
export const ATTACHMENT_URL_MAX_LENGTH = 2048;

const id = (message: string) => z.string({ error: message }).trim().min(1, message);
const optionalId = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null));

const attachmentName = z
  .string({ error: "Give the attachment a name" })
  .trim()
  .min(1, "Give the attachment a name")
  .max(ATTACHMENT_NAME_MAX_LENGTH, `Names must be ${ATTACHMENT_NAME_MAX_LENGTH} characters or fewer`);

export const linkTypeSchema = z.enum(LINK_TYPES, { error: "Choose a valid link type" });

export const createLinkAttachmentSchema = z.object({
  project_id: id("Choose a project"),
  task_id: optionalId,
  comment_id: optionalId,
  name: z
    .string()
    .trim()
    .max(ATTACHMENT_NAME_MAX_LENGTH, `Names must be ${ATTACHMENT_NAME_MAX_LENGTH} characters or fewer`)
    .optional()
    .transform((value) => (value ? value : undefined)),
  url: z
    .string({ error: "Paste a link" })
    .trim()
    .min(1, "Paste a link")
    .max(ATTACHMENT_URL_MAX_LENGTH, `Links must be ${ATTACHMENT_URL_MAX_LENGTH} characters or fewer`)
    .refine(isHttpUrl, "Links must start with http:// or https://"),
  link_type: linkTypeSchema.nullish(),
  pinned: z.boolean().optional(),
});

export const createFileAttachmentSchema = z.object({
  project_id: id("Choose a project"),
  task_id: optionalId,
  comment_id: optionalId,
  name: attachmentName,
  url: z
    .string({ error: "The upload did not return a file URL" })
    .trim()
    .min(1, "The upload did not return a file URL")
    .max(ATTACHMENT_URL_MAX_LENGTH)
    .refine(isHttpUrl, "The upload did not return a valid URL"),
  blob_pathname: z.string().trim().min(1, "The upload did not return a file path").max(1024),
  mime_type: z.string().trim().min(1, "The file type is missing").max(255),
  size_bytes: z
    .number()
    .int()
    .min(0)
    .max(MAX_UPLOAD_BYTES, `Files can be at most ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`),
});

export const updateAttachmentSchema = z
  .object({
    name: attachmentName.optional(),
    link_type: linkTypeSchema.nullable().optional(),
    pinned: z.boolean().optional(),
  })
  .strict();

export const attachmentFiltersSchema = z.object({
  projectId: id("Choose a project"),
  taskId: z.string().trim().min(1).nullable().optional(),
  kind: z.enum(ATTACHMENT_KINDS).optional(),
  pinned: z.boolean().optional(),
});

export const attachmentIdSchema = id("This attachment no longer exists.");

/** The `clientPayload` the uploader sends to POST /api/attachments/upload (JSON). */
export const uploadClientPayloadSchema = z.object({
  projectId: id("Choose a project"),
  taskId: z.string().trim().min(1).nullable().optional(),
});
export type UploadClientPayload = z.infer<typeof uploadClientPayloadSchema>;
