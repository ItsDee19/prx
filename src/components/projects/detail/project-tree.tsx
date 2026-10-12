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
  /** Workspace today ("YYYY-MM-DD"): overdue and "due soon" use workspace time. */
  today: string;
}

function countDescendants(node: ProjectTreeNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function canDelete(viewer: TreeViewer, node: ProjectTreeNode): boolean {
  return viewer.role === "admin" || node.created_by === viewer.id || node.owner_id === viewer.id;
}

export function ProjectTree({ parent, nodes, users, viewer, today }: ProjectTreeProps) {
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

  // The tree is a size container: rows switch from a two-line layout (name, then wrapping
  // metadata) to aligned single-line rows once the tree itself is wide enough, whatever the
  // viewport (the main column is narrower at 1280px beside the side column than at 1024px).
  return (
    <ul className="@container -mx-1.5 sm:-mx-2" aria-label={`Sub-projects of ${parent.name}`}>
      {nodes.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          users={users}
          viewer={viewer}
          today={today}
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
  today: string;
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
}

function TreeRow({ node, users, viewer, today, collapsed, onToggle, onExpand }: TreeRowProps) {
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
      {/*
        Trees under 56rem (phones, most tablets, the main column from 1024px to ~1650px and in
        the three-column layout at 1920px): line 1 holds the chevron, status dot, name and
        actions; line 2 holds the metadata, which wraps and runs under the actions. Wider trees
        (@4xl): a single line with fixed-width metadata cells, so status, owner, due date and
        progress align in columns at every depth.
      */}
      <div
        className={cn(
          "group grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-start gap-x-1.5 gap-y-1 rounded-md px-1.5 py-2 sm:px-2",
          "@4xl:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto]",
          "transition-colors duration-150 hover:bg-surface-2/60 focus-within:bg-surface-2/60",
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
              "col-start-1 row-start-1 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded text-fg-muted outline-none",
              "transition-colors duration-150 hover:bg-border hover:text-fg",
              "focus-visible:ring-2 focus-visible:ring-accent",
              // Touch screens: an invisible 40px hit area around the 24px chevron (layout unchanged).
              "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2",
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
          <span aria-hidden className="col-start-1 row-start-1 mt-0.5 size-6 shrink-0" />
        )}

        <span
          aria-hidden
          className={cn("col-start-2 row-start-1 mt-2.5 size-2 shrink-0 rounded-full", status.dotClass)}
        />

        <div className="col-start-3 row-start-1 flex min-h-7 min-w-0 items-center">
          <Link
            href={`/projects/${node.id}`}
            title={node.name}
            className={cn(
              "min-w-0 rounded text-sm font-medium leading-5 text-fg [overflow-wrap:anywhere]",
              "outline-none transition-colors duration-150 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent",
              // Long names wrap, then clamp: 3 lines in phone-width trees, 2 from 20rem, 1 on the
              // single-line layout (the full name is in the title tooltip and the link's name).
              "line-clamp-3 @xs:line-clamp-2 @4xl:line-clamp-1",
            )}
          >
            {node.name}
          </Link>
        </div>

        <div
          className={cn(
            "col-span-2 col-start-3 row-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-muted",
            "@4xl:col-span-1 @4xl:col-start-4 @4xl:row-start-1 @4xl:ml-3 @4xl:min-h-7 @4xl:flex-nowrap",
          )}
        >
          <span className="inline-flex @4xl:w-24 @4xl:shrink-0">
            <StatusBadge status={node.status} />
          </span>
          {node.owner ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 @4xl:w-32">
              <UserAvatar user={node.owner} size="xs" />
              <span className="truncate">{node.owner.name}</span>
            </span>
          ) : (
            <span className="text-fg-subtle @4xl:w-32">Unassigned</span>
          )}
          <span className="inline-flex @4xl:w-24 @4xl:shrink-0">
            <DueDate date={node.due_date} status={node.status} withIcon today={today} />
          </span>
          {node.subproject_count > 0 ? (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums @4xl:w-14 @4xl:shrink-0"
              title={`${node.subproject_completed} of ${node.subproject_count} sub-projects completed`}
            >
              <GitBranch className="size-3.5 shrink-0" aria-hidden />
              <span>
                {node.subproject_completed}/{node.subproject_count}
                <span className="@4xl:sr-only"> sub-projects</span>
              </span>
            </span>
          ) : (
            <span aria-hidden className="hidden @4xl:block @4xl:w-14 @4xl:shrink-0" />
          )}
          <ProgressBar
            value={node.progress}
            size="sm"
            showLabel
            className="min-w-24 max-w-40 flex-1 @4xl:w-28 @4xl:max-w-none @4xl:flex-none"
            label={`${node.name} progress`}
          />
        </div>

        <div
          className={cn(
            "col-start-4 row-start-1 flex shrink-0 items-center gap-0.5 @4xl:col-start-5",
            // Revealed on hover/focus with a mouse; always shown on touch screens (which have no
            // hover) and while one of the row's menus or dialogs is open.
            "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
            "has-data-[state=open]:opacity-100 pointer-coarse:opacity-100",
            // Button gives each icon button a 40px touch hit area; spacing keeps those from overlapping.
            "pointer-coarse:gap-3",
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
          // The guide line sits under the parent's chevron centre (row padding + 12px). The indent
          // step is 19px on phones, so deep rows keep room for their names, and 25px from sm.
          className="ml-[1.125rem] border-l border-border sm:ml-5 sm:pl-1"
        >
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              users={users}
              viewer={viewer}
              today={today}
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
