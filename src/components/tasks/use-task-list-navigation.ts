"use client";

import { useCallback, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateTaskAction } from "@/actions/tasks";
import { announceListChange, useListNavigation, type ListNavigation } from "@/hooks/use-list-navigation";
import type { TaskWithMeta } from "@/lib/types";
import { useTaskHref } from "./task-link";

/** Marks the status menu trigger inside a task row or card (opened with "s"). */
export const TASK_STATUS_TRIGGER_ATTRIBUTE = "data-task-status-trigger";

export interface UseTaskListNavigationOptions {
  /** Navigable task ids, in visual order. */
  itemIds: string[];
  /** Tasks by id (for keys, titles and the current assignee). */
  tasksById: ReadonlyMap<string, TaskWithMeta>;
  /** The signed-in user: enables "a" (assign to me). */
  viewerId?: string;
  onToggleSelect?: (id: string) => void;
  selectedIds?: string[];
  containerRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
}

/**
 * j/k roving focus over task rows or board cards (`data-list-item-id`), with
 * Enter to open the task drawer, "s" to open the item's status menu, "a" to
 * assign it to the viewer and, when the list is selectable, "x" to toggle
 * selection (SPEC.md section 20.2, `useListNavigation`).
 */
export function useTaskListNavigation({
  itemIds,
  tasksById,
  viewerId,
  onToggleSelect,
  selectedIds,
  containerRef,
  enabled = true,
}: UseTaskListNavigationOptions): ListNavigation {
  const router = useRouter();
  const taskHref = useTaskHref();

  const findItem = useCallback(
    (id: string): HTMLElement | null => {
      const root: ParentNode = containerRef.current ?? document;
      return root.querySelector<HTMLElement>(`[data-list-item-id="${CSS.escape(id)}"]`);
    },
    [containerRef],
  );

  const onOpen = (id: string) => {
    const task = tasksById.get(id);
    if (task) router.push(taskHref(task.key), { scroll: false });
  };

  const onStatusMenu = (id: string) => {
    const trigger = findItem(id)?.querySelector<HTMLElement>(`[${TASK_STATUS_TRIGGER_ATTRIBUTE}]`);
    if (!trigger) return;
    trigger.focus();
    // Radix opens a menu trigger on ArrowDown and moves focus to the first item.
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true }));
  };

  const onAssignMe = viewerId
    ? (id: string) => {
        const task = tasksById.get(id);
        if (!task) return;
        if (task.assignee_id === viewerId) {
          announceListChange(`${task.key} is already assigned to you`);
          return;
        }
        void (async () => {
          try {
            const result = await updateTaskAction(id, { assignee_id: viewerId });
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success(`${task.key} assigned to you.`, { duration: 2500 });
            announceListChange(`${task.key} assigned to you`);
            router.refresh();
          } catch {
            toast.error("Could not assign the task. Please try again.");
          }
        })();
      }
    : undefined;

  return useListNavigation({
    itemIds,
    onOpen,
    onStatusMenu,
    onAssignMe,
    onToggleSelect,
    selectedIds,
    containerRef,
    enabled,
  });
}
