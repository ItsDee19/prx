"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export interface UseSelectionOptions {
  /**
   * Ids of the selectable rows in display order (visible rows only). Shift
   * ranges follow this order, and ids that disappear (a refresh after a bulk
   * delete, a filter change) drop out of the selection.
   */
  itemIds: readonly string[];
  /** Ids selected on first render. */
  initialSelected?: readonly string[];
}

export interface ToggleOptions {
  /** Shift-click: apply to the range between the last toggled row and this one. */
  shiftKey?: boolean;
  /** Force a state instead of flipping (e.g. a checkbox's new `checked`). */
  selected?: boolean;
}

export interface Selection {
  /** Selected ids, in `itemIds` order. */
  selectedIds: string[];
  count: number;
  isSelected: (id: string) => boolean;
  /** Click / x key: flips (or sets) one row; with `shiftKey`, the whole range from the anchor. */
  toggle: (id: string, options?: ToggleOptions) => void;
  /** Replace the selection (TaskList / ProjectList `onSelectionChange`). Unknown ids are ignored. */
  setSelectedIds: (ids: readonly string[]) => void;
  /** Ctrl/Cmd+A or a header checkbox. */
  selectAll: () => void;
  /** Esc or the bulk bar's clear button. */
  clear: () => void;
  allSelected: boolean;
  /** Some but not all rows are selected (header checkbox `indeterminate`). */
  someSelected: boolean;
}

/**
 * Multi-select state for lists that feed the BulkActionBar: toggle, shift-
 * click ranges (from the last toggled row), select all and clear. The
 * selection is always a subset of `itemIds`.
 */
export function useSelection({ itemIds, initialSelected = [] }: UseSelectionOptions): Selection {
  const [raw, setRaw] = useState<ReadonlySet<string>>(() => new Set(initialSelected));
  const anchor = useRef<string | null>(null);

  const order = useMemo(() => new Map(itemIds.map((id, index) => [id, index])), [itemIds]);
  const selectedIds = useMemo(() => itemIds.filter((id) => raw.has(id)), [itemIds, raw]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const isSelected = useCallback((id: string) => selectedSet.has(id), [selectedSet]);

  const toggle = useCallback(
    (id: string, options: ToggleOptions = {}) => {
      const index = order.get(id);
      if (index === undefined) return;
      const value = options.selected ?? !selectedSet.has(id);
      const from = anchor.current !== null ? order.get(anchor.current) : undefined;
      setRaw(() => {
        const next = new Set(selectedSet);
        if (options.shiftKey && from !== undefined && from !== index) {
          const [start, end] = from < index ? [from, index] : [index, from];
          for (const rangeId of itemIds.slice(start, end + 1)) {
            if (value) next.add(rangeId);
            else next.delete(rangeId);
          }
        } else if (value) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });
      anchor.current = id;
    },
    [itemIds, order, selectedSet],
  );

  const setSelectedIds = useCallback(
    (ids: readonly string[]) => setRaw(new Set(ids.filter((id) => order.has(id)))),
    [order],
  );
  const selectAll = useCallback(() => setRaw(new Set(itemIds)), [itemIds]);
  const clear = useCallback(() => {
    anchor.current = null;
    setRaw(new Set());
  }, []);

  const count = selectedIds.length;
  return {
    selectedIds,
    count,
    isSelected,
    toggle,
    setSelectedIds,
    selectAll,
    clear,
    allSelected: itemIds.length > 0 && count === itemIds.length,
    someSelected: count > 0 && count < itemIds.length,
  };
}
