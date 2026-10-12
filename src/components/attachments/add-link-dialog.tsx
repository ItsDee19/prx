"use client";

import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import type { Attachment } from "@/lib/types";
import { LinkForm } from "./link-form";

export interface AddLinkDialogProps {
  projectId: string;
  taskId?: string | null;
  /** Element that opens the dialog (single element, rendered via `asChild`). Omit when controlling `open`. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Starts with "Show in Key links" on. */
  defaultPinned?: boolean;
  onAdded?: (attachment: Attachment) => void;
}

/** "Add link" dialog for a project or a task (http/https links only). */
export function AddLinkDialog({
  projectId,
  taskId = null,
  trigger,
  open: openProp,
  onOpenChange,
  defaultPinned = false,
  onAdded,
}: AddLinkDialogProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        title="Add link"
        description={taskId ? "Attach a repo, doc, design or any other http(s) link to this task." : "Attach a repo, doc, design or any other http(s) link to this project."}
      >
        <LinkForm
          projectId={projectId}
          taskId={taskId}
          defaultPinned={defaultPinned}
          onCancel={() => setOpen(false)}
          onAdded={(attachment) => {
            setOpen(false);
            onAdded?.(attachment);
          }}
          renderActions={(actions) => <DialogFooter>{actions}</DialogFooter>}
        />
      </DialogContent>
    </Dialog>
  );
}
