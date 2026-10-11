"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "./dialog";

export interface ConfirmDialogProps {
  /** Element that opens the dialog (rendered via `asChild`, so pass a single element). */
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Runs when confirmed; the dialog closes once the returned promise settles successfully. */
  onConfirm: () => Promise<unknown> | unknown;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      // The caller is responsible for surfacing the error (usually a toast);
      // keep the dialog open so the user can retry or cancel.
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Do not let Escape / overlay clicks dismiss the dialog mid-action.
        if (!pending) setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description} size="sm">
        <DialogFooter className="mt-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button variant={destructive ? "danger" : "primary"} loading={pending} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
