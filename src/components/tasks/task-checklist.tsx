"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
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
import { ArrowDown, ArrowUp, Ellipsis, GripVertical, Pencil, Plus, Trash } from "lucide-react";
import { toast } from "sonner";
import {
  addChecklistItemAction,
  deleteChecklistItemAction,
  reorderChecklistAction,
  updateChecklistItemAction,
} from "@/actions/tasks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { CHECKLIST_TITLE_MAX } from "@/lib/schemas/tasks";
import type { TaskChecklistItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TaskCheck } from "./task-check";

/** Checklist items only move up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

export interface TaskChecklistProps {
  taskId: string;
  items: TaskChecklistItem[];
  /** Called after every saved change (the drawer reloads; defaults to router.refresh()). */
  onChanged?: () => void;
  className?: string;
}

/**
 * Checklist: tick items (check-draw animation), add (Enter keeps focus),
 * rename inline, delete, and reorder by drag (pointer, touch or keyboard)
 * or with the "Move up" / "Move down" menu items.
 */
export function TaskChecklist({ taskId, items: initialItems, onChanged, className }: TaskChecklistProps) {
  const router = useRouter();
  const dndId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(initialItems);
  const [synced, setSynced] = useState(initialItems);
  if (synced !== initialItems) {
    setSynced(initialItems);
    setItems(initialItems);
  }
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const done = items.filter((item) => item.done).length;
  const changed = () => (onChanged ? onChanged() : router.refresh());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const titleOf = (id: string | number) => items.find((item) => item.id === id)?.title ?? "item";
  const positionOf = (id: string | number) => `${items.findIndex((item) => item.id === id) + 1} of ${items.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up checklist item ${titleOf(active.id)}. Use the arrow keys to move it.`,
    onDragOver: ({ active, over }) =>
      over ? `${titleOf(active.id)} is now at position ${positionOf(over.id)}.` : `${titleOf(active.id)} is not over the list.`,
    onDragEnd: ({ active, over }) =>
      over ? `${titleOf(active.id)} was dropped at position ${positionOf(over.id)}.` : `${titleOf(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
  };

  async function persistOrder(next: TaskChecklistItem[], previous: TaskChecklistItem[]) {
    setItems(next);
    const result = await reorderChecklistAction(
      taskId,
      next.map((item) => item.id),
    );
    if (!result.ok) {
      setItems(previous);
      toast.error(result.error);
      return;
    }
    changed();
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    void persistOrder(arrayMove(items, from, to), items);
  }

  function move(id: string, delta: -1 | 1) {
    const from = items.findIndex((item) => item.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= items.length) return;
    void persistOrder(arrayMove(items, from, to), items);
  }

  async function toggle(item: TaskChecklistItem, value: boolean) {
    const previous = items;
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, done: value } : entry)));
    const result = await updateChecklistItemAction(item.id, { done: value });
    if (!result.ok) {
      setItems(previous);
      toast.error(result.error);
      return;
    }
    changed();
  }

  async function rename(item: TaskChecklistItem, title: string) {
    setEditingId(null);
    const value = title.trim();
    if (!value || value === item.title) return;
    const previous = items;
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, title: value } : entry)));
    const result = await updateChecklistItemAction(item.id, { title: value });
    if (!result.ok) {
      setItems(previous);
      toast.error(result.error);
      return;
    }
    changed();
  }

  async function remove(item: TaskChecklistItem) {
    const previous = items;
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    const result = await deleteChecklistItemAction(item.id);
    if (!result.ok) {
      setItems(previous);
      toast.error(result.error);
      return;
    }
    toast.success("Checklist item removed.", { duration: 2000 });
    changed();
  }

  async function add() {
    const title = draft.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      const result = await addChecklistItemAction(taskId, title);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDraft("");
      setItems((current) => [...current, result.data]);
      changed();
    } finally {
      setAdding(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {items.length > 0 ? (
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Checklist progress"
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={done}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className="h-full origin-left rounded-full bg-success transition-transform duration-(--dur-3) ease-(--ease-out-quart)"
              style={{ transform: `scaleX(${items.length === 0 ? 0 : done / items.length})` }}
            />
          </div>
          <span className="text-xs font-medium tabular-nums text-fg-muted">
            {done}/{items.length}
          </span>
        </div>
      ) : null}

      {items.length > 0 ? (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[verticalOnly]}
          accessibility={{ announcements }}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <ul role="list" className="-mx-1.5 space-y-0.5">
              {items.map((item, index) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  editing={editingId === item.id}
                  canMoveUp={index > 0}
                  canMoveDown={index < items.length - 1}
                  onToggle={(value) => void toggle(item, value)}
                  onEdit={() => setEditingId(item.id)}
                  onRename={(title) => void rename(item, title)}
                  onCancelEdit={() => setEditingId(null)}
                  onMove={(delta) => move(item.id, delta)}
                  onRemove={() => void remove(item)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}

      <div className="relative flex items-center gap-2 pl-1">
        <Plus aria-hidden className="size-4 shrink-0 text-fg-subtle" />
        <label htmlFor={inputId} className="sr-only">
          Add a checklist item
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={draft}
          readOnly={adding}
          maxLength={CHECKLIST_TITLE_MAX}
          placeholder="Add an item"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void add();
            }
          }}
          className="h-8 min-w-0 flex-1 rounded-[10px] bg-transparent px-1.5 text-base text-fg outline-none placeholder:text-fg-subtle focus-visible:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-ring/40 sm:text-sm"
        />
        {adding ? <Spinner size="sm" /> : null}
      </div>
    </div>
  );
}

interface ChecklistRowProps {
  item: TaskChecklistItem;
  editing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: (done: boolean) => void;
  onEdit: () => void;
  onRename: (title: string) => void;
  onCancelEdit: () => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}

function ChecklistRow({
  item,
  editing,
  canMoveUp,
  canMoveDown,
  onToggle,
  onEdit,
  onRename,
  onCancelEdit,
  onMove,
  onRemove,
}: ChecklistRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    attributes: { roleDescription: "sortable checklist item" },
  });
  const [value, setValue] = useState(item.title);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onRename(value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setValue(item.title);
      onCancelEdit();
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group/item relative flex min-h-9 items-center gap-1.5 rounded-[10px] px-1.5",
        "transition-[background-color] duration-(--dur-2) hover:bg-surface-2/60",
        isDragging && "z-10 bg-surface shadow-pop",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${item.title}`}
        className={cn(
          "relative inline-flex h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-fg-subtle outline-none",
          "opacity-0 transition-opacity duration-(--dur-2) group-hover/item:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
          "focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <GripVertical aria-hidden className="size-3.5" />
      </button>
      <TaskCheck checked={item.done} onCheckedChange={onToggle} label={`${item.title}: mark ${item.done ? "not done" : "done"}`} />
      {editing ? (
        <input
          type="text"
          autoFocus
          value={value}
          maxLength={CHECKLIST_TITLE_MAX}
          aria-label="Checklist item"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => onRename(value)}
          className="h-7 min-w-0 flex-1 rounded-md border border-input-border bg-surface px-2 text-base text-fg outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={onEdit}
          title="Rename"
          className={cn(
            "min-w-0 flex-1 cursor-text rounded-md px-1 py-1 text-left text-sm leading-5 outline-none [overflow-wrap:anywhere]",
            "transition-opacity duration-(--dur-2) focus-visible:ring-2 focus-visible:ring-ring",
            item.done ? "text-fg-muted line-through decoration-fg-subtle/60" : "text-fg",
          )}
          aria-label={`${item.title}. Rename`}
        >
          {item.title}
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${item.title}`}
            className={cn(
              "relative inline-flex size-7 shrink-0 items-center justify-center rounded-full text-fg-subtle outline-none",
              "opacity-0 transition-opacity duration-(--dur-2) group-hover/item:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100",
              "hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5",
            )}
          >
            <Ellipsis aria-hidden className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove(-1)}>
            <ArrowUp aria-hidden />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove(1)}>
            <ArrowDown aria-hidden />
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={onRemove}>
            <Trash aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
