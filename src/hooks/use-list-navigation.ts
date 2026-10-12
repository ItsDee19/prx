"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useHotkeys, type HotkeyBinding } from "./use-hotkeys";

/**
 * Keyboard navigation for lists and boards (SPEC.md section 20.2, W3 search).
 *
 * Items are the elements carrying `data-list-item-id="<id>"` for the ids in
 * `itemIds` (in that order). The hook keeps a roving tabindex on them (the
 * active item is `tabIndex=0`, the others `-1`, so Tab enters the list once):
 *
 * - j / k move focus to the next / previous item (from anywhere on the page);
 * - x toggles selection, Enter opens, s opens the status menu and a assigns
 *   the item to the viewer, each acting on the focused item (only while focus
 *   is on an item; Enter only when the item itself has focus, so nested
 *   buttons and links keep their own Enter);
 * - moves and selection changes are announced in a shared polite live region.
 *
 * Built on `useHotkeys`: inactive while focus is in a text field or a
 * dialog, popover or menu is open.
 */

export interface UseListNavigationOptions {
  itemIds: string[];
  onOpen: (id: string) => void;
  onToggleSelect?: (id: string) => void;
  onStatusMenu?: (id: string) => void;
  onAssignMe?: (id: string) => void;
  /** Currently selected ids, so "x" can announce "Selected" or "Deselected". */
  selectedIds?: string[];
  /** Restricts the item lookup to this container (default: the whole document). */
  containerRef?: RefObject<HTMLElement | null>;
  /** Default true. Turn off while the list is hidden (e.g. another view is active). */
  enabled?: boolean;
}

export interface ListNavigation {
  /** The item that owns the roving tab stop (null for an empty list). */
  activeId: string | null;
  /** Moves the tab stop (and focus) to an item. */
  focusItem: (id: string) => void;
}

const ITEM_ATTRIBUTE = "data-list-item-id";
const ANNOUNCER_ID = "prx-list-announcer";
const LABEL_MAX = 100;

function escapeAttributeValue(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

function getAnnouncer(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let region = document.getElementById(ANNOUNCER_ID);
  if (!region) {
    region = document.createElement("div");
    region.id = ANNOUNCER_ID;
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    // Visually hidden (sr-only).
    Object.assign(region.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "-1px",
      overflow: "hidden",
      clip: "rect(0, 0, 0, 0)",
      whiteSpace: "nowrap",
      border: "0",
    });
    document.body.appendChild(region);
  }
  return region;
}

let announceTimer: ReturnType<typeof setTimeout> | undefined;

/** Speaks `message` through the shared polite live region (repeats are re-announced). */
export function announceListChange(message: string): void {
  const region = getAnnouncer();
  if (!region) return;
  region.textContent = "";
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    region.textContent = message;
  }, 50);
}

function itemLabel(element: HTMLElement): string {
  const text = (element.getAttribute("aria-label") ?? element.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text || "Item";
}

export function useListNavigation(options: UseListNavigationOptions): ListNavigation {
  const { itemIds, onOpen, onToggleSelect, onStatusMenu, onAssignMe, selectedIds, containerRef, enabled = true } = options;
  const [activeIdState, setActiveIdState] = useState<string | null>(null);
  const idsKey = itemIds.join("\u0000");
  const idSet = useMemo(() => new Set(idsKey ? idsKey.split("\u0000") : []), [idsKey]);
  const activeId = activeIdState !== null && idSet.has(activeIdState) ? activeIdState : (itemIds[0] ?? null);

  const latest = useRef({ itemIds, idSet, containerRef });
  useEffect(() => {
    latest.current = { itemIds, idSet, containerRef };
  });

  const findElement = useCallback((id: string): HTMLElement | null => {
    const root: ParentNode = latest.current.containerRef?.current ?? document;
    return root.querySelector<HTMLElement>(`[${ITEM_ATTRIBUTE}="${escapeAttributeValue(id)}"]`);
  }, []);

  /** The list item that currently contains focus, if any. */
  const focusedItemId = useCallback((): string | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const item = active.closest<HTMLElement>(`[${ITEM_ATTRIBUTE}]`);
    const id = item?.getAttribute(ITEM_ATTRIBUTE) ?? null;
    if (id === null || !latest.current.idSet.has(id)) return null;
    const container = latest.current.containerRef?.current;
    return container && !container.contains(item) ? null : id;
  }, []);

  const focusItem = useCallback(
    (id: string) => {
      const element = findElement(id);
      if (!element) return;
      setActiveIdState(id);
      if (element.tabIndex < 0) element.tabIndex = 0;
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      const ids = latest.current.itemIds;
      announceListChange(`${itemLabel(element)}, ${ids.indexOf(id) + 1} of ${ids.length}`);
    },
    [findElement],
  );

  // Roving tabindex: only the active item is in the Tab order.
  useEffect(() => {
    if (!enabled) return;
    for (const id of idsKey ? idsKey.split("\u0000") : []) {
      const element = findElement(id);
      if (element) element.tabIndex = id === activeId ? 0 : -1;
    }
  }, [enabled, idsKey, activeId, findElement]);

  // Clicking or tabbing into an item makes it the active one.
  useEffect(() => {
    if (!enabled) return;
    const onFocusIn = () => {
      const id = focusedItemId();
      if (id !== null) setActiveIdState(id);
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [enabled, focusedItemId]);

  const move = useCallback(
    (delta: 1 | -1) => {
      const ids = latest.current.itemIds;
      if (ids.length === 0) return;
      const current = focusedItemId();
      if (current === null) {
        // First keypress enters the list at its tab stop.
        focusItem(activeId ?? ids[0]);
        return;
      }
      const index = ids.indexOf(current);
      const next = ids[Math.min(ids.length - 1, Math.max(0, index + delta))];
      focusItem(next);
    },
    [activeId, focusItem, focusedItemId],
  );

  /** Item shortcuts act only while focus is on (or inside) one of this list's items. */
  const focusInList = () => focusedItemId() !== null;
  const bindings: HotkeyBinding[] = [
    { keys: "j", handler: () => move(1) },
    { keys: "k", handler: () => move(-1) },
    {
      keys: "enter",
      // Only the item element itself: nested buttons and links keep their own Enter.
      when: () => {
        const id = focusedItemId();
        return id !== null && document.activeElement === findElement(id);
      },
      handler: () => {
        const id = focusedItemId();
        if (id !== null) onOpen(id);
      },
    },
  ];
  if (onToggleSelect) {
    bindings.push({
      keys: "x",
      when: focusInList,
      handler: () => {
        const id = focusedItemId();
        if (id === null) return;
        const element = findElement(id);
        const label = element ? itemLabel(element) : "Item";
        const wasSelected = selectedIds?.includes(id);
        onToggleSelect(id);
        announceListChange(
          wasSelected === undefined ? `Selection changed: ${label}` : `${wasSelected ? "Deselected" : "Selected"} ${label}`,
        );
      },
    });
  }
  if (onStatusMenu) {
    bindings.push({
      keys: "s",
      when: focusInList,
      handler: () => {
        const id = focusedItemId();
        if (id !== null) onStatusMenu(id);
      },
    });
  }
  if (onAssignMe) {
    bindings.push({
      keys: "a",
      when: focusInList,
      handler: () => {
        const id = focusedItemId();
        if (id !== null) onAssignMe(id);
      },
    });
  }

  useHotkeys(bindings, { enabled: enabled && itemIds.length > 0 });

  return { activeId, focusItem };
}
