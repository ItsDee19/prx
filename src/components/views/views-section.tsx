"use client";

import { Suspense, useId, useMemo, useState, useTransition, type KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Ellipsis, Filter, Lock, Pencil, Trash, Users } from "lucide-react";
import { toast } from "sonner";
import { deleteSavedViewAction, reorderSavedViewsAction, updateSavedViewAction } from "@/actions/views";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { SAVED_VIEW_SCOPE_CONFIG } from "@/lib/constants";
import { normalizeSavedViewFilters, sameSavedViewFilters, SAVED_VIEW_NAME_MAX } from "@/lib/schemas/views";
import type { SavedView, SavedViewFilters } from "@/lib/types";
import { buildQueryString, cn } from "@/lib/utils";
import {
  SIDEBAR_ROW_LINK_CLASS,
  SIDEBAR_ROW_MENU_CLASS,
  SidebarSectionHeading,
  SidebarSortableList,
  type SidebarRowControls,
} from "./sidebar-sortable-list";

export interface ViewsSectionProps {
  /** `listSavedViews(user.id)`: own views by position, then views others shared. */
  views: SavedView[];
  /** The signed-in user's id (own views can be renamed, shared, reordered and deleted). */
  viewerId: string;
  /** Admins may also delete views other people shared. */
  isAdmin?: boolean;
  className?: string;
}

/** Shared views from other people shown before "Show more". */
const SHARED_PREVIEW = 5;

interface ViewItem {
  id: string;
  name: string;
  view: SavedView;
}

/** Link target of a saved view: its page plus the stored filters. */
export function savedViewHref(view: Pick<SavedView, "scope" | "filters">): string {
  return `${SAVED_VIEW_SCOPE_CONFIG[view.scope].href}${buildQueryString(view.filters)}`;
}

/**
 * Sidebar "Views": the person's saved views (reorder by drag or "Move up" /
 * "Move down"; rename, share, replace filters and delete from the row menu),
 * then views teammates shared. The view matching the current page and URL
 * filters is marked current.
 */
export function ViewsSection(props: ViewsSectionProps) {
  // useSearchParams needs a Suspense boundary wherever a route could be prerendered.
  return (
    <Suspense fallback={<ViewsSectionContent {...props} search={null} />}>
      <ViewsSectionWithSearch {...props} />
    </Suspense>
  );
}

function ViewsSectionWithSearch(props: ViewsSectionProps) {
  const search = useSearchParams();
  return <ViewsSectionContent {...props} search={search} />;
}

interface ContentProps extends ViewsSectionProps {
  search: URLSearchParams | Readonly<URLSearchParams> | null;
}

function ViewsSectionContent({ views, viewerId, isAdmin = false, search, className }: ContentProps) {
  const headingId = useId();
  const sharedId = useId();
  const pathname = usePathname();
  const [showAllShared, setShowAllShared] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  const current = useMemo<SavedViewFilters>(
    () => normalizeSavedViewFilters(new URLSearchParams(search ? search.toString() : "")),
    [search],
  );

  const own = useMemo<ViewItem[]>(
    () =>
      views
        .filter((view) => view.user_id === viewerId && !hidden.has(view.id))
        .map((view) => ({ id: view.id, name: view.name, view })),
    [views, viewerId, hidden],
  );
  const shared = useMemo(
    () => views.filter((view) => view.user_id !== viewerId && view.is_shared && !hidden.has(view.id)),
    [views, viewerId, hidden],
  );
  const shownShared = showAllShared ? shared : shared.slice(0, SHARED_PREVIEW);

  const onScopePage = (view: SavedView) => pathname === SAVED_VIEW_SCOPE_CONFIG[view.scope].href;
  const isActive = (view: SavedView) => search !== null && onScopePage(view) && sameSavedViewFilters(current, view.filters);

  function hide(id: string, value: boolean) {
    setHidden((set) => {
      const next = new Set(set);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <section aria-labelledby={headingId} className={className}>
      <SidebarSectionHeading id={headingId}>Views</SidebarSectionHeading>

      {own.length === 0 && shared.length === 0 ? (
        <p className="flex items-start gap-2 px-3 py-1 text-xs leading-4 text-fg-muted">
          <Filter aria-hidden className="mt-px size-3.5 shrink-0 text-fg-subtle" />
          <span>Filter a list, then choose Save view to keep it here.</span>
        </p>
      ) : null}

      {own.length > 0 ? (
        <SidebarSortableList
          items={own}
          aria-label="Your saved views"
          noun="view"
          onReorder={reorderSavedViewsAction}
          renderRow={(item, controls) => (
            <OwnViewRow
              view={item.view}
              controls={controls}
              active={isActive(item.view)}
              currentFilters={onScopePage(item.view) && search !== null ? current : null}
              onHide={(value) => hide(item.id, value)}
            />
          )}
        />
      ) : null}

      {shared.length > 0 ? (
        <div className={cn(own.length > 0 && "mt-2")}>
          <p id={sharedId} className="px-3 pb-0.5 pt-1 text-[11px] leading-4 text-fg-subtle">
            Shared with you
          </p>
          <ul aria-labelledby={sharedId} className="space-y-0.5">
            {shownShared.map((view) => (
              <li key={view.id} className="group/row relative rounded-[10px]">
                <SharedViewRow
                  view={view}
                  active={isActive(view)}
                  canDelete={isAdmin}
                  onHide={(value) => hide(view.id, value)}
                />
              </li>
            ))}
          </ul>
          {shared.length > SHARED_PREVIEW ? (
            <button
              type="button"
              aria-expanded={showAllShared}
              onClick={() => setShowAllShared((value) => !value)}
              className="mt-0.5 flex h-8 w-full items-center gap-1.5 rounded-[10px] px-3 text-xs font-medium text-fg-muted outline-none transition-control hover:bg-fg/[0.05] hover:text-fg focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-10"
            >
              <ChevronDown
                aria-hidden
                className={cn("size-3.5 transition-transform duration-(--dur-2) ease-out-quart", showAllShared && "rotate-180")}
              />
              {showAllShared ? "Show fewer" : `Show ${shared.length - SHARED_PREVIEW} more`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------- Rows ---------------------------------- */

interface ViewLinkProps {
  view: SavedView;
  active: boolean;
  subtitle?: string;
}

function ViewLink({ view, active, subtitle }: ViewLinkProps) {
  const scope = SAVED_VIEW_SCOPE_CONFIG[view.scope];
  return (
    <Link
      href={savedViewHref(view)}
      aria-current={active ? "page" : undefined}
      title={subtitle ? `${view.name} · ${subtitle}` : `${view.name} · ${scope.label}`}
      className={cn(
        SIDEBAR_ROW_LINK_CLASS,
        active ? "bg-accent-soft text-accent-soft-fg" : "text-fg-muted hover:bg-fg/[0.05] hover:text-fg",
      )}
    >
      <Icon
        name={scope.icon}
        aria-hidden
        className={cn("size-4 shrink-0", active ? "text-accent-soft-fg" : "text-fg-subtle")}
      />
      <span className="min-w-0 flex-1 truncate">{view.name}</span>
      <span className="sr-only">
        {`, ${scope.label}`}
        {subtitle ? `, ${subtitle}` : view.is_shared ? ", shared with the team" : ""}
      </span>
      {view.is_shared ? <Users aria-hidden className="size-3.5 shrink-0 text-fg-subtle" /> : null}
    </Link>
  );
}

interface OwnViewRowProps {
  view: SavedView;
  controls: SidebarRowControls;
  active: boolean;
  /** Current URL filters when this page is the view's page (offers "Replace with current filters"). */
  currentFilters: SavedViewFilters | null;
  onHide: (hidden: boolean) => void;
}

function OwnViewRow({ view, controls, active, currentFilters, onHide }: OwnViewRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(view.name);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const canReplace = currentFilters !== null && !sameSavedViewFilters(currentFilters, view.filters);

  function save(patch: Parameters<typeof updateSavedViewAction>[1], success: string) {
    startTransition(async () => {
      const result = await updateSavedViewAction(view.id, patch);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success, { duration: 2000 });
    });
  }

  function commitRename() {
    setRenaming(false);
    const name = draft.trim();
    if (!name || name === view.name) {
      setDraft(view.name);
      return;
    }
    save({ name }, `Renamed the view to "${name}".`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      commitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setDraft(view.name);
      setRenaming(false);
    }
  }

  async function remove() {
    const result = await deleteSavedViewAction(view.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setConfirmOpen(false);
    onHide(true);
    toast.success(`Deleted the view "${view.name}".`, { duration: 2000 });
  }

  return (
    <div className="flex items-center gap-0.5">
      {controls.handle}
      {renaming ? (
        <input
          type="text"
          autoFocus
          value={draft}
          maxLength={SAVED_VIEW_NAME_MAX}
          aria-label="View name"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commitRename}
          className="h-8 min-w-0 flex-1 rounded-[10px] border border-input-border bg-surface px-2 text-base text-fg outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
        />
      ) : (
        <ViewLink view={view} active={active} />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={`Actions for ${view.name}`}
            className={cn(SIDEBAR_ROW_MENU_CLASS, renaming && "hidden")}
          >
            <Ellipsis aria-hidden className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setDraft(view.name);
              setRenaming(true);
            }}
          >
            <Pencil aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              save(
                { is_shared: !view.is_shared },
                view.is_shared ? `"${view.name}" is now personal.` : `Shared "${view.name}" with the team.`,
              )
            }
          >
            {view.is_shared ? <Lock aria-hidden /> : <Users aria-hidden />}
            {view.is_shared ? "Make personal" : "Share with the team"}
          </DropdownMenuItem>
          {canReplace && currentFilters ? (
            <DropdownMenuItem onSelect={() => save({ filters: currentFilters }, `Updated "${view.name}" with the current filters.`)}>
              <Filter aria-hidden />
              Replace with current filters
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!controls.canMoveUp} onSelect={controls.moveUp}>
            <ArrowUp aria-hidden />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!controls.canMoveDown} onSelect={controls.moveDown}>
            <ArrowDown aria-hidden />
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
            <Trash aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteViewDialog open={confirmOpen} onOpenChange={setConfirmOpen} view={view} onConfirm={remove} />
    </div>
  );
}

interface SharedViewRowProps {
  view: SavedView;
  active: boolean;
  canDelete: boolean;
  onHide: (hidden: boolean) => void;
}

function SharedViewRow({ view, active, canDelete, onHide }: SharedViewRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function remove() {
    const result = await deleteSavedViewAction(view.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setConfirmOpen(false);
    onHide(true);
    toast.success(`Deleted the view "${view.name}".`, { duration: 2000 });
  }

  return (
    <div className="flex items-center gap-0.5">
      <ViewLink view={view} active={active} subtitle={`shared by ${view.owner.name}`} />
      {canDelete ? (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`Actions for ${view.name}`} className={SIDEBAR_ROW_MENU_CLASS}>
                <Ellipsis aria-hidden className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
                <Trash aria-hidden />
                Delete for everyone
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteViewDialog open={confirmOpen} onOpenChange={setConfirmOpen} view={view} onConfirm={remove} />
        </>
      ) : (
        // Keeps the names aligned with rows that have a menu.
        <span aria-hidden className="size-7 shrink-0" />
      )}
    </div>
  );
}

interface DeleteViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: SavedView;
  onConfirm: () => Promise<void>;
}

function DeleteViewDialog({ open, onOpenChange, view, onConfirm }: DeleteViewDialogProps) {
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent
        size="sm"
        title={`Delete "${view.name}"?`}
        description={
          view.is_shared
            ? "The view disappears for everyone it was shared with. The filtered items stay as they are."
            : "The view is removed from your sidebar and the command menu. The filtered items stay as they are."
        }
      >
        <DialogFooter className="mt-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="danger" loading={pending} onClick={() => void confirm()}>
            Delete view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
