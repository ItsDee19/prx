"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDown, ArrowUp, Ellipsis, Star, StarOff } from "lucide-react";
import { toast } from "sonner";
import { reorderFavoritesAction, toggleFavoriteAction } from "@/actions/views";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RagDot } from "@/components/ui/rag-dot";
import type { FavoriteProject } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_ROW_LINK_CLASS,
  SIDEBAR_ROW_MENU_CLASS,
  SidebarSectionHeading,
  SidebarSortableList,
  type SidebarRowControls,
} from "./sidebar-sortable-list";

export interface FavoritesSectionProps {
  /** `listFavorites(user.id)`, in the person's order. */
  favorites: FavoriteProject[];
  className?: string;
}

interface FavoriteItem {
  id: string;
  name: string;
  favorite: FavoriteProject;
}

/**
 * Sidebar "Favourites": starred projects in the person's order. Reorder by
 * drag (pointer, touch, keyboard) or with "Move up" / "Move down"; each row
 * shows the project colour, client code and health, and can be unstarred.
 */
export function FavoritesSection({ favorites, className }: FavoritesSectionProps) {
  const headingId = useId();
  const pathname = usePathname();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [, startTransition] = useTransition();

  // Stable identity: the sortable list keeps its optimistic order until the props change.
  const items = useMemo<FavoriteItem[]>(
    () =>
      favorites
        .filter((favorite) => !hidden.has(favorite.project_id))
        .map((favorite) => ({ id: favorite.project_id, name: favorite.name, favorite })),
    [favorites, hidden],
  );

  function unstar(item: FavoriteItem) {
    setHidden((current) => new Set(current).add(item.id));
    startTransition(async () => {
      const result = await toggleFavoriteAction(item.id);
      if (!result.ok || result.data) {
        // Failed, or the project was not starred any more (the toggle starred it again): undo.
        if (result.ok) await toggleFavoriteAction(item.id);
        setHidden((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        toast.error(result.ok ? "Could not update your favourites. Please try again." : result.error);
        return;
      }
      toast.success(`Removed ${item.name} from favourites.`, { duration: 2000 });
    });
  }

  return (
    <section aria-labelledby={headingId} className={className}>
      <SidebarSectionHeading id={headingId}>Favourites</SidebarSectionHeading>
      {items.length === 0 ? (
        <p className="flex items-start gap-2 px-3 py-1 text-xs leading-4 text-fg-muted">
          <Star aria-hidden className="mt-px size-3.5 shrink-0 text-fg-subtle" />
          <span>Star a project to pin it here.</span>
        </p>
      ) : (
        <SidebarSortableList
          items={items}
          aria-label="Favourite projects"
          noun="favourite"
          onReorder={reorderFavoritesAction}
          renderRow={(item, controls) => (
            <FavoriteRow
              item={item}
              controls={controls}
              active={pathname === `/projects/${item.id}` || pathname.startsWith(`/projects/${item.id}/`)}
              onUnstar={() => unstar(item)}
            />
          )}
        />
      )}
    </section>
  );
}

interface FavoriteRowProps {
  item: FavoriteItem;
  controls: SidebarRowControls;
  active: boolean;
  onUnstar: () => void;
}

function FavoriteRow({ item, controls, active, onUnstar }: FavoriteRowProps) {
  const { favorite } = item;
  return (
    <div className="flex items-center gap-0.5">
      {controls.handle}
      <Link
        href={`/projects/${favorite.project_id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          SIDEBAR_ROW_LINK_CLASS,
          active ? "bg-accent-soft text-accent-soft-fg" : "text-fg-muted hover:bg-fg/[0.05] hover:text-fg",
        )}
      >
        <span aria-hidden className="flex size-4 shrink-0 items-center justify-center">
          <span
            className="size-2.5 rounded-[4px] ring-1 ring-inset ring-fg/10"
            style={{ backgroundColor: favorite.color ?? "var(--fg-subtle)" }}
          />
        </span>
        <span className="min-w-0 flex-1 truncate">{favorite.name}</span>
        {favorite.client_code ? (
          <span className={cn("shrink-0 font-mono text-[10px] leading-4 tracking-wide", active ? "text-accent-soft-fg" : "text-fg-subtle")}>
            {favorite.client_code}
          </span>
        ) : null}
        {favorite.health ? <RagDot health={favorite.health} size="sm" /> : null}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Actions for ${favorite.name}`} className={SIDEBAR_ROW_MENU_CLASS}>
            <Ellipsis aria-hidden className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!controls.canMoveUp} onSelect={controls.moveUp}>
            <ArrowUp aria-hidden />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!controls.canMoveDown} onSelect={controls.moveDown}>
            <ArrowDown aria-hidden />
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onUnstar}>
            <StarOff aria-hidden />
            Remove from favourites
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
