"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { deleteProjectAction } from "@/actions/projects";
import { pluralize } from "@/lib/utils";

export interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: { id: string; name: string; parent_id: string | null };
  /** Number of descendants (any depth) that will be removed along with the project. */
  subtreeTotal: number;
  /** Runs after a successful delete; the caller decides whether to navigate or refresh. */
  onDeleted: (parentId: string | null) => void;
}

/**
 * Controlled destructive confirmation. Unlike <ConfirmDialog> it has no trigger,
 * so it can be launched from a dropdown-menu item (whose content unmounts on close).
 */
export function DeleteProjectDialog({
  open,
  onOpenChange,
  project,
  subtreeTotal,
  onDeleted,
}: DeleteProjectDialogProps) {
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      const result = await deleteProjectAction(project.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted "${project.name}"`);
      onOpenChange(false);
      onDeleted(result.data.parent_id);
    } catch {
      toast.error("Could not delete the project. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const description =
    subtreeTotal > 0
      ? `This permanently deletes "${project.name}" and its ${pluralize(subtreeTotal, "sub-project")}, including their comments and activity. This cannot be undone.`
      : `This permanently deletes "${project.name}" along with its comments and activity. This cannot be undone.`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent title="Delete project?" description={description} size="sm">
        <DialogFooter className="mt-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="danger" loading={pending} onClick={handleConfirm}>
            Delete project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
