"use client";

import { useState } from "react";
import { Copy, Download, ExternalLink, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAttachmentAction, updateAttachmentAction } from "@/actions/attachments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EditAttachmentDialog } from "./edit-attachment-dialog";

export interface AttachmentActionsProps {
  attachment: Attachment;
  canDelete: boolean;
  canPin: boolean;
  /** After a rename, retype or pin change. */
  onUpdated: (attachment: Attachment) => void;
  /** After a successful delete. */
  onDeleted: (id: string) => void;
  className?: string;
}

/** Row/tile overflow menu: open, copy link, download, edit, pin as key link, delete (with confirm). */
export function AttachmentActions({ attachment, canDelete, canPin, onUpdated, onDeleted, className }: AttachmentActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isFile = attachment.kind === "file";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(attachment.url);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy the link.");
    }
  }

  async function togglePin() {
    const result = await updateAttachmentAction(attachment.id, { pinned: !attachment.pinned });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.data.pinned ? "Pinned to Key links." : "Removed from Key links.");
    onUpdated(result.data);
  }

  async function remove() {
    setDeleting(true);
    const result = await deleteAttachmentAction(attachment.id);
    setDeleting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setConfirmOpen(false);
    toast.success(isFile ? "File deleted." : "Link removed.");
    onDeleted(attachment.id);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-8 shrink-0", className)}
            aria-label={`Actions for ${attachment.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={attachment.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              Open
            </a>
          </DropdownMenuItem>
          {isFile ? (
            <DropdownMenuItem asChild>
              <a href={downloadUrl(attachment.url)} download={attachment.name} rel="noopener noreferrer">
                <Download aria-hidden />
                Download
              </a>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={copyLink}>
            <Copy aria-hidden />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil aria-hidden />
            {isFile ? "Rename" : "Edit"}
          </DropdownMenuItem>
          {canPin ? (
            <DropdownMenuItem onSelect={togglePin}>
              {attachment.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
              {attachment.pinned ? "Unpin from Key links" : "Pin as key link"}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
                <Trash2 aria-hidden />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditAttachmentDialog attachment={attachment} open={editOpen} onOpenChange={setEditOpen} onSaved={onUpdated} />

      <Dialog open={confirmOpen} onOpenChange={(next) => (deleting ? undefined : setConfirmOpen(next))}>
        <DialogContent
          size="sm"
          title={isFile ? "Delete this file?" : "Remove this link?"}
          description={
            isFile
              ? `"${attachment.name}" will be deleted from storage. This cannot be undone.`
              : `"${attachment.name}" will be removed from the project. The page it points to is not affected.`
          }
        >
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="danger" loading={deleting} onClick={remove}>
              {isFile ? "Delete file" : "Remove link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Vercel Blob serves a download (Content-Disposition: attachment) with `?download=1`. */
function downloadUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("download", "1");
    return parsed.toString();
  } catch {
    return url;
  }
}
