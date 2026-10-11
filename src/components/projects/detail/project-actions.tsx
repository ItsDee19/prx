"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectDialog } from "@/components/projects/project-dialog";
import type { ProjectWithMeta, UserSummary } from "@/lib/types";
import { DeleteProjectDialog } from "./delete-project-dialog";

export interface ProjectActionsProps {
  project: ProjectWithMeta;
  users: UserSummary[];
  /** Descendants (any depth) removed with the project; computed server-side via countSubtree. */
  subtreeTotal: number;
  canDelete: boolean;
}

/** Header actions: add a sub-project, edit, and (when permitted) an overflow menu with delete. */
export function ProjectActions({ project, users, subtreeTotal, canDelete }: ProjectActionsProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <ProjectDialog
        mode="create"
        parentId={project.id}
        parentName={project.name}
        users={users}
        trigger={
          <Button variant="outline">
            <Plus aria-hidden />
            Add sub-project
          </Button>
        }
      />
      <ProjectDialog
        mode="edit"
        project={project}
        users={users}
        trigger={
          <Button variant="primary">
            <Pencil aria-hidden />
            Edit
          </Button>
        }
      />
      {canDelete ? (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                <Trash2 aria-hidden />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteProjectDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            project={{ id: project.id, name: project.name, parent_id: project.parent_id }}
            subtreeTotal={subtreeTotal}
            onDeleted={(parentId) => {
              router.push(parentId ? `/projects/${parentId}` : "/projects");
              router.refresh();
            }}
          />
        </>
      ) : null}
    </>
  );
}
