import {
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  File as FileIcon,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import { ALLOWED_UPLOAD_CONTENT_TYPES, ATTACHMENT_PATH_PREFIX, MAX_UPLOAD_BYTES } from "@/lib/constants";
import type { Attachment } from "@/lib/types";

/**
 * Pure helpers shared by the attachment components (server and client safe).
 */

export type AttachmentView = "grid" | "list";

export function parseAttachmentView(value: string | string[] | undefined, fallback: AttachmentView = "grid"): AttachmentView {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "grid" || raw === "list" ? raw : fallback;
}

/** "12 KB", "3.4 MB" (binary units, at most one decimal). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

export const MAX_UPLOAD_LABEL = formatBytes(MAX_UPLOAD_BYTES);

export function isImageMime(mime: string | null | undefined): boolean {
  return Boolean(mime && mime.startsWith("image/"));
}

/** Host without "www." ("github.com"), or "" for an unparsable URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

/** The site's own /favicon.ico (requested straight from the linked host, never a third party). */
export function faviconUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  json: "application/json",
  txt: "text/plain",
  md: "text/plain",
  log: "text/plain",
  zip: "application/zip",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
};

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

/**
 * The content type to upload a file with: the browser's type when it is
 * allowed, else the one its extension implies (Windows often reports CSV as
 * Excel or leaves the type empty). null when the file type is not allowed.
 */
export function uploadContentType(file: { name: string; type: string }): string | null {
  const allowed = ALLOWED_UPLOAD_CONTENT_TYPES as readonly string[];
  const reported = file.type.toLowerCase();
  const byExtension = EXTENSION_TYPES[extensionOf(file.name)];
  if (byExtension === "text/csv" && allowed.includes(byExtension)) return byExtension;
  if (reported && allowed.includes(reported)) return reported;
  if (byExtension && allowed.includes(byExtension)) return byExtension;
  return null;
}

/** `accept` for file inputs: the allowed types plus their extensions. */
export const UPLOAD_ACCEPT = [
  ...ALLOWED_UPLOAD_CONTENT_TYPES,
  ...Object.keys(EXTENSION_TYPES).map((extension) => `.${extension}`),
].join(",");

/** A safe blob pathname under `attachments/<projectId>/` (the store adds a random suffix). */
export function uploadPathname(projectId: string, fileName: string, taskId?: string | null): string {
  const extension = extensionOf(fileName);
  const base = fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  const safe = `${base || "file"}${extension ? `.${extension}` : ""}`;
  return `${ATTACHMENT_PATH_PREFIX}${projectId}/${taskId ? `${taskId}/` : ""}${safe}`;
}

/** Icon and short label for a file by its type. */
export function fileTypeInfo(mime: string | null | undefined, name: string): { icon: LucideIcon; label: string } {
  const type = (mime ?? "").toLowerCase();
  const extension = extensionOf(name).toUpperCase();
  if (type.startsWith("image/")) return { icon: FileImage, label: type === "image/svg+xml" ? "SVG" : extension || "Image" };
  if (type.startsWith("audio/")) return { icon: FileAudio, label: extension || "Audio" };
  if (type.startsWith("video/")) return { icon: FileVideo, label: extension || "Video" };
  if (type === "application/pdf") return { icon: FileText, label: "PDF" };
  if (type.includes("spreadsheet") || type.includes("ms-excel") || type === "text/csv") {
    return { icon: FileSpreadsheet, label: extension || "Sheet" };
  }
  if (type.includes("presentation") || type.includes("powerpoint")) return { icon: Presentation, label: extension || "Slides" };
  if (type.includes("word")) return { icon: FileText, label: extension || "Doc" };
  if (type === "application/zip") return { icon: FileArchive, label: "ZIP" };
  if (type === "application/json") return { icon: FileCode, label: "JSON" };
  if (type.startsWith("text/")) return { icon: FileText, label: extension || "Text" };
  return { icon: FileIcon, label: extension || "File" };
}

/** Delete permission mirrored from deleteAttachmentAction (uploader, admin or project owner). */
export function canDeleteAttachment(
  attachment: Pick<Attachment, "uploaded_by">,
  viewer: { viewerId: string; canManageAll: boolean },
): boolean {
  return viewer.canManageAll || attachment.uploaded_by === viewer.viewerId;
}

/** Only project-level links can be pinned as key links. */
export function canPinAttachment(attachment: Pick<Attachment, "kind" | "task_id">): boolean {
  return attachment.kind === "link" && attachment.task_id === null;
}

/** Friendly text for an upload failure from `@vercel/blob/client`. */
export function uploadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/client token|presigned/i.test(message)) {
    return "The upload was refused. Check the file type and size, then try again.";
  }
  if (/abort/i.test(message)) return "Upload cancelled.";
  if (/network|fetch/i.test(message)) return "The connection dropped. Try again.";
  return "Could not upload the file. Try again.";
}
