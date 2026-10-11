"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  FolderTree,
  GitBranch,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/avatar";
import { DueDate } from "@/components/projects/due-date";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { StatusBadge } from "@/components/projects/status-badge";
import { STATUS_CONFIG } from "@/lib/constants";
import type { ProjectTreeNode, Role, UserSummary } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { HiddenTrigger } from "./hidden-trigger";

export interface TreeViewer {
  id: string;
  role: Role;
}

export interface ProjectTreeProps {
  /** The project whose sub-projects are shown (used as the parent for "Add sub-project"). */
  parent: { id: string; name: string };
  nodes: ProjectTreeNode[];
  users: UserSummary[];
  viewer: TreeViewer;
}

function countDescendants(node: ProjectTreeNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function canDelete(viewer: TreeViewer, node: ProjectTreeNode): boolean {
  return viewer.role === "admin" || node.created_by === viewer.id || node.owner_id === viewer.id;
}

export function ProjectTree({ parent, nodes, users, viewer }: ProjectTreeProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expand(id: string) {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  if (nodes.length === 0) {
    return (
      <EmptyState
        icon={FolderTree}
        title="No sub-projects yet"
        description="Break this project into smaller pieces of work that can be tracked on their own."
        action={
          <ProjectDialog
            mode="create"
            parentId={parent.id}
            parentName={parent.name}
            users={users}
            trigger={
              <Button variant="primary" size="sm">
                <Plus aria-hidden />
                Add sub-project
              </Button>
            }
          />
        }
      />
    );
  }

  return (
    <ul className="-mx-2" aria-label={`Sub-projects of ${parent.name}`}>
      {nodes.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          users={users}
          viewer={viewer}
          collapsed={collapsed}
          onToggle={toggle}
          onExpand={expand}
        />
      ))}
    </ul>
  );
}

interface TreeRowProps {
  node: ProjectTreeNode;
  users: UserSummary[];
  viewer: TreeViewer;
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
}

function TreeRow({ node, users, viewer, collapsed, onToggle, onExpand }: TreeRowProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const addButtonRef = useRef<HTMLButtonElement>(null);
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);

  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && !collapsed.has(node.id);
  const childrenId = `subtree-${node.id}`;
  const status = STATUS_CONFIG[node.status];
  const descendants = countDescendants(node);
  const deletable = canDelete(viewer, node);

  return (
    <li>
      <div
        className={cn(
          "group flex items-start gap-1.5 rounded-md px-2 py-2 transition-colors duration-150",
          "hover:bg-surface-2/60 focus-within:bg-surface-2/60",
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={expanded}
            aria-controls={childrenId}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${node.name}`}
            className={cn(
              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded text-fg-muted outline-none",
              "transition-colors duration-150 hover:bg-border hover:text-fg",
              "focus-visible:ring-2 focus-visible:ring-accent",
            )}
          >
            <ChevronRight
              aria-hidden
              className={cn(
                "size-4 transition-transform duration-150",
                expanded && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span aria-hidden className="mt-0.5 size-6 shrink-0" />
        )}

        <span
          aria-hidden
          className={cn("mt-2.5 size-2 shrink-0 rounded-full", status.dotClass)}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Link
              href={`/projects/${node.id}`}
              className="max-w-full truncate rounded text-sm font-medium text-fg outline-none transition-colors duration-150 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"
            >
              {node.name}
            </Link>
            <StatusBadge status={node.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
            {node.owner ? (
              <span className="inline-flex items-center gap-1.5">
                <UserAvatar user={node.owner} size="xs" />
                <span className="truncate">{node.owner.name}</span>
              </span>
            ) : (
              <span className="text-fg-subtle">Unassigned</span>
            )}
            <DueDate date={node.due_date} status={node.status} withIcon />
            {node.subproject_count > 0 ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <GitBranch className="size-3.5 shrink-0" aria-hidden />
                {node.subproject_completed}/{node.subproject_count} sub-projects
              </span>
            ) : null}
            <ProgressBar
              value={node.progress}
              size="sm"
              showLabel
              className="w-28"
              label={`${node.name} progress`}
            />
          </div>
        </div>

        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5 transition-opacity duration-150",
            "sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
          )}
        >
          <Tooltip content="Add sub-project">
            <Button
              ref={addButtonRef}
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Add sub-project to ${node.name}`}
              onClick={() => addTriggerRef.current?.click()}
            >
              <Plus aria-hidden />
            </Button>
          </Tooltip>
          <ProjectDialog
            mode="create"
            parentId={node.id}
            parentName={node.name}
            users={users}
            onSuccess={() => onExpand(node.id)}
            trigger={<HiddenTrigger ref={addTriggerRef} focusTarget={addButtonRef} />}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={menuButtonRef}
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Actions for ${node.name}`}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  // Park focus on the menu button so the dialog hands it back there on close.
                  menuButtonRef.current?.focus();
                  editTriggerRef.current?.click();
                }}
              >
                <Pencil aria-hidden />
                Edit
              </DropdownMenuItem>
              {deletable ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                    <Trash2 aria-hidden />
                    Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <ProjectDialog
            mode="edit"
            project={node}
            users={users}
            trigger={<HiddenTrigger ref={editTriggerRef} focusTarget={menuButtonRef} />}
          />
          {deletable ? (
            <DeleteProjectDialog
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              project={{ id: node.id, name: node.name, parent_id: node.parent_id }}
              subtreeTotal={descendants}
              onDeleted={() => router.refresh()}
            />
          ) : null}
        </div>
      </div>

      {hasChildren ? (
        <ul
          id={childrenId}
          hidden={!expanded}
          aria-label={`Sub-projects of ${node.name} (${pluralize(node.children.length, "item")})`}
          className="ml-[1.375rem] border-l border-border pl-1"
        >
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              users={users}
              viewer={viewer}
              collapsed={collapsed}
              onToggle={onToggle}
              onExpand={onExpand}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
