"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Link2, Upload } from "lucide-react";
import { getTaskAttachmentsAction, type TaskAttachmentsData } from "@/actions/attachments";
import type { TaskDrawerSectionProps } from "@/components/tasks/drawer-sections";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AddLinkDialog } from "./add-link-dialog";
import { AttachmentList } from "./attachment-list";
import { UPLOAD_ACCEPT } from "./attachment-utils";
import { UploadProgressList } from "./upload-progress-list";
import { useAttachmentUpload } from "./use-attachment-upload";

/**
 * Task drawer section (SPEC.md section 21.3, order 60): the task's links and
 * files, Add link, and Upload (button or drop) when Vercel Blob is configured.
 */
export function TaskAttachmentsSection({ task, viewerId, isAdmin, blobEnabled, onChanged }: TaskDrawerSectionProps) {
  const [data, setData] = useState<TaskAttachmentsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    request.current += 1;
    const current = request.current;
    const result = await getTaskAttachmentsAction(task.id);
    if (current !== request.current) return;
    if (result.ok) {
      setData(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
  }, [task.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = useCallback(() => {
    void load();
    onChanged();
  }, [load, onChanged]);

  const { items, start, dismiss } = useAttachmentUpload({
    projectId: task.project_id,
    taskId: task.id,
    onBatchDone: (uploaded) => {
      if (uploaded.length > 0) changed();
    },
  });

  const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");
  const dropHandlers = blobEnabled
    ? {
        onDragEnter: (event: DragEvent<HTMLDivElement>) => {
          if (!isFileDrag(event)) return;
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        },
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          if (!isFileDrag(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: (event: DragEvent<HTMLDivElement>) => {
          if (!isFileDrag(event)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        },
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          if (!isFileDrag(event)) return;
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          void start(event.dataTransfer.files);
        },
      }
    : {};

  const attachments = data?.attachments ?? [];

  return (
    <div
      className={cn(
        "relative space-y-3 rounded-xl transition-[box-shadow] duration-(--dur-2)",
        dragging && "ring-2 ring-accent ring-offset-4 ring-offset-surface",
      )}
      {...dropHandlers}
    >
      {blobEnabled ? (
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const files = event.target.files;
            if (files && files.length > 0) void start(files);
            event.target.value = "";
          }}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}{" "}
          <button type="button" className="font-medium underline" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : data === null ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading attachments">
          <Skeleton className="h-9 w-full rounded-[10px]" />
          <Skeleton className="h-9 w-2/3 rounded-[10px]" />
        </div>
      ) : attachments.length > 0 ? (
        <AttachmentList
          attachments={attachments}
          dense
          viewerId={viewerId}
          canManageAll={isAdmin || data.canManageAll}
          favicons={!data.confidential}
          onChanged={changed}
        />
      ) : (
        <p className="text-sm text-fg-muted">
          {blobEnabled ? "No links or files yet. Drop files here or add a link." : "No links yet."}
        </p>
      )}

      <UploadProgressList items={items} onDismiss={dismiss} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
          <Link2 aria-hidden />
          Add link
        </Button>
        {blobEnabled ? (
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden />
            Upload
          </Button>
        ) : (
          <span className="text-xs text-fg-subtle">File uploads are not set up for this workspace, so attach links instead.</span>
        )}
      </div>

      <AddLinkDialog
        projectId={task.project_id}
        taskId={task.id}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onAdded={changed}
      />
    </div>
  );
}
