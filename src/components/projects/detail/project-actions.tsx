"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, FlaskConical, MoreHorizontal, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectDialog } from "@/components/projects/project-dialog";
import {
  ConvertToPilotDialog,
  ProposeRetainerDialog,
  SaveAsTemplateDialog,
  canProposeRetainer,
  isAssessmentProject,
} from "@/components/templates";
import type { ProjectWithMeta, UserSummary } from "@/lib/types";
import { DeleteProjectDialog } from "./delete-project-dialog";

export interface ProjectActionsProps {
  project: ProjectWithMeta;
  users: UserSummary[];
  /** Descendants (any depth) removed with the project; computed server-side via countSubtree. */
  subtreeTotal: number;
  canDelete: boolean;
}

/**
 * Header actions: add a sub-project, edit, and an overflow menu with Save as template,
 * Convert to pilot (assessment projects), Propose retainer (non-retainers) and, when
 * permitted, delete. The menu items open dialogs whose open state lives outside the
 * menu, so closing the menu never unmounts them.
 *
 * On phones the three controls share one full-width row: "Add sub-project" takes the free
 * space while Edit and the overflow button stay compact. Below 360px the visible label
 * shortens to "Sub-project" (the accessible name stays "Add sub-project"). From sm up the
 * row shrinks to its content beside the title.
 */
export function ProjectActions({ project, users, subtreeTotal, canDelete }: ProjectActionsProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [pilotOpen, setPilotOpen] = useState(false);
  const [retainerOpen, setRetainerOpen] = useState(false);
  const showPilot = isAssessmentProject(project);
  const showRetainer = canProposeRetainer(project);

  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
      <ProjectDialog
        mode="create"
        parentId={project.id}
        parentName={project.name}
        users={users}
        trigger={
          <Button variant="outline" className="min-w-0 flex-1 sm:flex-none" aria-label="Add sub-project">
            <Plus aria-hidden />
            <span aria-hidden className="min-[22.5rem]:hidden">
              Sub-project
            </span>
            <span aria-hidden className="hidden min-[22.5rem]:inline">
              Add sub-project
            </span>
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
            <BookmarkPlus aria-hidden />
            Save as template
          </DropdownMenuItem>
          {showPilot ? (
            <DropdownMenuItem onSelect={() => setPilotOpen(true)}>
              <FlaskConical aria-hidden />
              Convert to pilot
            </DropdownMenuItem>
          ) : null}
          {showRetainer ? (
            <DropdownMenuItem onSelect={() => setRetainerOpen(true)}>
              <Repeat aria-hidden />
              Propose retainer
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                <Trash2 aria-hidden />
                Delete project
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <SaveAsTemplateDialog project={project} open={templateOpen} onOpenChange={setTemplateOpen} />
      {showPilot ? <ConvertToPilotDialog project={project} open={pilotOpen} onOpenChange={setPilotOpen} /> : null}
      {showRetainer ? (
        <ProposeRetainerDialog project={project} open={retainerOpen} onOpenChange={setRetainerOpen} />
      ) : null}
      {canDelete ? (
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
      ) : null}
    </div>
  );
}
