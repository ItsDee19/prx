"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AddLinkDialog } from "./add-link-dialog";
import { MAX_UPLOAD_LABEL, UPLOAD_ACCEPT } from "./attachment-utils";
import { useAttachmentUpload } from "./use-attachment-upload";

export interface AttachButtonProps {
  projectId: string;
  taskId?: string | null;
  /** Vercel Blob is configured (server: isBlobEnabled()). Without it the button adds links only. */
  blobEnabled: boolean;
  onAdded?: (attachment: Attachment) => void;
  className?: string;
}

/**
 * Paperclip for composers and toolbars. With Blob enabled it opens a menu
 * (Add link / Upload files, progress in a toast per file); without it, it
 * opens the Add link dialog straight away.
 */
export function AttachButton({ projectId, taskId = null, blobEnabled, onAdded, className }: AttachButtonProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { items, start, dismiss } = useAttachmentUpload({ projectId, taskId, onUploaded: onAdded });

  // One toast per file, updated in place as it uploads.
  useEffect(() => {
    for (const item of items) {
      if (item.status === "error") {
        toast.error(`${item.name}: ${item.error ?? "Upload failed."}`, { id: item.id });
        dismiss(item.id);
      } else if (item.status === "done") {
        toast.success(`Uploaded ${item.name}.`, { id: item.id });
      } else {
        const label = item.status === "saving" ? "Saving" : item.status === "queued" ? "Waiting to upload" : "Uploading";
        toast.loading(`${label} ${item.name}${item.status === "uploading" ? ` · ${item.progress}%` : ""}`, { id: item.id });
      }
    }
  }, [items, dismiss]);

  const trigger = (
    <Button variant="ghost" size="icon" className={cn("size-8", className)} aria-label="Attach">
      <Paperclip />
    </Button>
  );

  return (
    <>
      {blobEnabled ? (
        <>
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
          <DropdownMenu>
            <Tooltip content="Attach a link or file">
              <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
                <Link2 aria-hidden />
                Add link
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
                <Upload aria-hidden />
                Upload files
                <span className="ml-auto pl-3 text-xs text-fg-subtle">≤ {MAX_UPLOAD_LABEL}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : (
        <Tooltip content="Attach a link">
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-8", className)}
            aria-label="Attach a link"
            onClick={() => setLinkOpen(true)}
          >
            <Paperclip />
          </Button>
        </Tooltip>
      )}
      <AddLinkDialog
        projectId={projectId}
        taskId={taskId}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onAdded={onAdded}
      />
    </>
  );
}
