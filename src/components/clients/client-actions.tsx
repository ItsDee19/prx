"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteClientAction, updateClientAction } from "@/actions/clients";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Client, UserSummary } from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { ClientDialog } from "./client-dialog";

export interface ClientActionsProps {
  client: Client;
  users: UserSummary[];
  isAdmin: boolean;
  /** Top-level engagements (the delete confirmation says they stay, without a client). */
  projectCount: number;
}

/**
 * Header actions on /clients/[id]: New engagement (project dialog with the
 * client prefilled), Edit, and a menu with Archive / Restore and (admins)
 * Delete. Delete keeps the client's projects, without a client.
 */
export function ClientActions({ client, users, isAdmin, projectCount }: ClientActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [archiving, startArchive] = useTransition();
  const [deleting, startDelete] = useTransition();

  function toggleArchived() {
    const archive = !client.archived_at;
    startArchive(async () => {
      const result = await updateClientAction(client.id, { archived: archive });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(archive ? `${client.name} archived` : `${client.name} restored`);
      router.refresh();
    });
  }

  function remove() {
    startDelete(async () => {
      const result = await deleteClientAction(client.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${client.name} deleted`);
      setDeleteOpen(false);
      router.push("/clients");
      router.refresh();
    });
  }

  return (
    <>
      <ProjectDialog
        mode="create"
        users={users}
        defaults={{ client_id: client.id, currency: client.currency }}
        onSuccess={(id) => router.push(`/projects/${id}`)}
        trigger={
          <Button>
            <Plus aria-hidden />
            New engagement
          </Button>
        }
      />
      <Button variant="outline" onClick={() => setEditOpen(true)}>
        <Pencil aria-hidden />
        Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More client actions" loading={archiving}>
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={toggleArchived}>
            {client.archived_at ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            {client.archived_at ? "Restore client" : "Archive client"}
          </DropdownMenuItem>
          {isAdmin ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                <Trash2 aria-hidden />
                Delete client
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ClientDialog mode="edit" client={client} open={editOpen} onOpenChange={setEditOpen} />
      {isAdmin ? (
        <Dialog open={deleteOpen} onOpenChange={(next) => (deleting ? undefined : setDeleteOpen(next))}>
          <DialogContent
            title={`Delete ${client.name}?`}
            description={
              projectCount > 0
                ? `Its ${pluralize(projectCount, "engagement")} stay in PRX without a client. This cannot be undone.`
                : "This cannot be undone."
            }
            size="sm"
          >
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={deleting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button variant="danger" loading={deleting} onClick={remove}>
                Delete client
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
