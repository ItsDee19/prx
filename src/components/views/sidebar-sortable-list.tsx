"use client";

import { useId, useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Sidebar rows only move up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

export interface SidebarSortableItem {
  id: string;
  name: string;
}

/** What each row gets to render its drag handle and its "Move up" / "Move down" menu items. */
export interface SidebarRowControls {
  /** The drag handle (pointer, touch and keyboard: Space to pick up, arrows to move). */
  handle: ReactNode;
  canMoveUp: boolean;
  canMoveDown: boolean;
  moveUp: () => void;
  moveDown: () => void;
  isDragging: boolean;
}

export interface SidebarSortableListProps<T extends SidebarSortableItem> {
  items: T[];
  "aria-label": string;
  /** Singular noun for drag announcements ("view", "favourite"). */
  noun: string;
  /** Persists the new order; on failure the list reverts and the error is toasted. */
  onReorder: (orderedIds: string[]) => Promise<ActionResult>;
  renderRow: (item: T, controls: SidebarRowControls) => ReactNode;
  className?: string;
}

/**
 * Reorderable sidebar list: drag by the grip (pointer, touch or keyboard via
 * dnd-kit's KeyboardSensor) or use the rows' "Move up" / "Move down" menu
 * items. Optimistic; reverts with a toast when saving fails. Every move is
 * announced with the item's name.
 */
export function SidebarSortableList<T extends SidebarSortableItem>({
  items: initialItems,
  "aria-label": ariaLabel,
  noun,
  onReorder,
  renderRow,
  className,
}: SidebarSortableListProps<T>) {
  const dndId = useId();
  const [items, setItems] = useState(initialItems);
  const [synced, setSynced] = useState(initialItems);
  if (synced !== initialItems) {
    setSynced(initialItems);
    setItems(initialItems);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const nameOf = (id: string | number) => items.find((item) => item.id === id)?.name ?? noun;
  const positionOf = (id: string | number) => `${items.findIndex((item) => item.id === id) + 1} of ${items.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${noun} ${nameOf(active.id)}. Use the arrow keys to move it, Space to drop.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)} is now at position ${positionOf(over.id)}.` : `${nameOf(active.id)} is not over the list.`,
    onDragEnd: ({ active, over }) =>
      over ? `${nameOf(active.id)} was dropped at position ${positionOf(over.id)}.` : `${nameOf(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  };

  async function persist(next: T[], previous: T[]) {
    setItems(next);
    const result = await onReorder(next.map((item) => item.id));
    if (!result.ok) {
      setItems(previous);
      toast.error(result.error);
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    void persist(arrayMove(items, from, to), items);
  }

  function move(id: string, delta: -1 | 1) {
    const from = items.findIndex((item) => item.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= items.length) return;
    void persist(arrayMove(items, from, to), items);
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      accessibility={{ announcements }}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul aria-label={ariaLabel} className={cn("space-y-0.5", className)}>
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              noun={noun}
              canMoveUp={index > 0}
              canMoveDown={index < items.length - 1}
              onMove={(delta) => move(item.id, delta)}
              renderRow={renderRow}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

interface SortableRowProps<T extends SidebarSortableItem> {
  item: T;
  noun: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: -1 | 1) => void;
  renderRow: (item: T, controls: SidebarRowControls) => ReactNode;
}

function SortableRow<T extends SidebarSortableItem>({ item, noun, canMoveUp, canMoveDown, onMove, renderRow }: SortableRowProps<T>) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    attributes: { roleDescription: `sortable ${noun}` },
  });

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${item.name}`}
      className={cn(
        // Sits in the nav's 12px gutter so row icons line up with the NAV items.
        "absolute -left-3 top-1/2 inline-flex h-7 w-3 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded text-fg-subtle outline-none active:cursor-grabbing",
        "opacity-0 transition-opacity duration-(--dur-2) group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
        "focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "opacity-100",
      )}
    >
      <GripVertical aria-hidden className="size-3.5" />
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group/row relative rounded-[10px]", isDragging && "z-10 bg-surface shadow-pop")}
    >
      {renderRow(item, {
        handle,
        canMoveUp,
        canMoveDown,
        moveUp: () => onMove(-1),
        moveDown: () => onMove(1),
        isDragging,
      })}
    </li>
  );
}

/** Shared look of a sidebar link row (matches the NAV items). */
export const SIDEBAR_ROW_LINK_CLASS =
  "flex h-9 min-w-0 flex-1 items-center gap-3 rounded-[10px] px-3 text-sm font-medium outline-none pointer-coarse:h-10 " +
  "transition-control active:scale-[0.98] " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

/** Row menu trigger: shows on hover / focus, always on touch screens. */
export const SIDEBAR_ROW_MENU_CLASS =
  "relative inline-flex size-7 shrink-0 items-center justify-center rounded-full text-fg-subtle outline-none " +
  "opacity-0 transition-opacity duration-(--dur-2) group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100 " +
  "hover:bg-fg/[0.06] hover:text-fg focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5";

export interface SidebarSectionHeadingProps {
  id: string;
  children: ReactNode;
  action?: ReactNode;
}

/** Section label in the NAV group style, with an optional trailing control. */
export function SidebarSectionHeading({ id, children, action }: SidebarSectionHeadingProps) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2 px-3">
      <p id={id} className="text-[11px] font-medium leading-4 text-fg-muted">
        {children}
      </p>
      {action}
    </div>
  );
}
