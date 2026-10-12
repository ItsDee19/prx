"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createFileAttachmentAction } from "@/actions/attachments";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import type { Attachment } from "@/lib/types";
import { MAX_UPLOAD_LABEL, uploadContentType, uploadErrorMessage, uploadPathname } from "./attachment-utils";

/** The client-upload handshake route (SPEC.md section 19.2). */
export const UPLOAD_ROUTE = "/api/attachments/upload";

/** Files above this size upload in parallel parts with per-part retries. */
const MULTIPART_THRESHOLD = 8 * 1024 * 1024;
/** Uploads running at once. */
const CONCURRENCY = 3;
/** Finished rows linger this long so the tick registers, then disappear. */
const DONE_LINGER_MS = 2400;

export type UploadStatus = "queued" | "uploading" | "saving" | "done" | "error";

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  /** 0-100. */
  progress: number;
  status: UploadStatus;
  error?: string;
}

export interface UseAttachmentUploadOptions {
  projectId: string;
  taskId?: string | null;
  /** Called once per recorded file. */
  onUploaded?: (attachment: Attachment) => void;
  /** Called once a batch has finished (some files may have failed). */
  onBatchDone?: (uploaded: Attachment[]) => void;
}

let sequence = 0;

/**
 * Uploads files straight to Vercel Blob (`upload()` from `@vercel/blob/client`,
 * token from UPLOAD_ROUTE) with per-file progress, then records each one with
 * `createFileAttachmentAction` (onUploadCompleted never fires on localhost).
 * Files that are too large or of a disallowed type fail before any request.
 */
export function useAttachmentUpload({ projectId, taskId = null, onUploaded, onBatchDone }: UseAttachmentUploadOptions) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const timers = useRef(new Set<number>());
  const callbacks = useRef({ onUploaded, onBatchDone });
  useEffect(() => {
    callbacks.current = { onUploaded, onBatchDone };
  }, [onUploaded, onBatchDone]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: string) => {
      const timer = window.setTimeout(() => {
        timers.current.delete(timer);
        dismiss(id);
      }, DONE_LINGER_MS);
      timers.current.add(timer);
    },
    [dismiss],
  );

  const uploadOne = useCallback(
    async (id: string, file: File, contentType: string): Promise<Attachment | null> => {
      patch(id, { status: "uploading", progress: 0 });
      try {
        const { upload } = await import("@vercel/blob/client");
        const blob = await upload(uploadPathname(projectId, file.name, taskId), file, {
          access: "public",
          handleUploadUrl: UPLOAD_ROUTE,
          clientPayload: JSON.stringify({ projectId, taskId }),
          contentType,
          multipart: file.size > MULTIPART_THRESHOLD,
          onUploadProgress: ({ percentage }) => patch(id, { progress: Math.min(99, Math.round(percentage)) }),
        });
        patch(id, { status: "saving", progress: 100 });
        const result = await createFileAttachmentAction({
          project_id: projectId,
          task_id: taskId,
          name: file.name.slice(0, 200) || "Untitled file",
          url: blob.url,
          blob_pathname: blob.pathname,
          mime_type: contentType,
          size_bytes: file.size,
        });
        if (!result.ok) {
          patch(id, { status: "error", error: result.error });
          return null;
        }
        patch(id, { status: "done" });
        scheduleDismiss(id);
        callbacks.current.onUploaded?.(result.data);
        return result.data;
      } catch (error) {
        patch(id, { status: "error", error: uploadErrorMessage(error) });
        return null;
      }
    },
    [patch, projectId, scheduleDismiss, taskId],
  );

  const start = useCallback(
    async (input: FileList | File[]) => {
      const files = Array.from(input);
      if (files.length === 0) return;
      const queue: { id: string; file: File; contentType: string }[] = [];
      const added: UploadItem[] = files.map((file) => {
        sequence += 1;
        const id = `upload-${sequence}`;
        const contentType = uploadContentType(file);
        let error: string | undefined;
        if (file.size > MAX_UPLOAD_BYTES) error = `Too large. Files can be at most ${MAX_UPLOAD_LABEL}.`;
        else if (file.size === 0) error = "This file is empty.";
        else if (!contentType) error = "This file type is not allowed.";
        if (!error && contentType) queue.push({ id, file, contentType });
        return { id, name: file.name, size: file.size, progress: 0, status: error ? "error" : "queued", error };
      });
      setItems((current) => [...current, ...added]);

      const uploaded: Attachment[] = [];
      let cursor = 0;
      async function worker() {
        while (cursor < queue.length) {
          const next = queue[cursor];
          cursor += 1;
          const attachment = await uploadOne(next.id, next.file, next.contentType);
          if (attachment) uploaded.push(attachment);
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
      if (queue.length > 0) callbacks.current.onBatchDone?.(uploaded);
    },
    [uploadOne],
  );

  const busy = items.some((item) => item.status === "queued" || item.status === "uploading" || item.status === "saving");

  return { items, start, dismiss, busy };
}
