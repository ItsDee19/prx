"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { Minus, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { LABEL_GROUP_ORDER } from "@/lib/constants";
import type { LabelSummary } from "@/lib/types";
import { isDateOnly } from "@/lib/workspace-time";
import { pluralize } from "@/lib/utils";

/* -------------------------------- Labels -------------------------------- */

type LabelMode = "add" | "remove";

export interface BulkLabelsPopoverProps {
  labels: LabelSummary[];
  /** Single focusable element that opens the popover. */
  trigger: ReactNode;
  onApply: (change: { add_label_ids?: string[]; remove_label_ids?: string[] }) => void;
}

/**
 * Add or remove labels on every selected row: pick the mode, tick labels
 * (searchable), Apply. Only the ticked labels change; other labels stay.
 */
export function BulkLabelsPopover({ labels, trigger, onApply }: BulkLabelsPopoverProps) {
  const searchId = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LabelMode>("add");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());

  const sorted = useMemo(
    () =>
      [...labels].sort(
        (a, b) =>
          LABEL_GROUP_ORDER.indexOf(a.label_group) - LABEL_GROUP_ORDER.indexOf(b.label_group) ||
          a.name.localeCompare(b.name),
      ),
    [labels],
  );
  const needle = query.trim().toLowerCase();
  const shown = needle ? sorted.filter((label) => label.name.toLowerCase().includes(needle)) : sorted;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setPicked(new Set());
    }
  }

  function flip(id: string, value: boolean) {
    setPicked((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function apply() {
    const ids = [...picked];
    if (ids.length === 0) return;
    onApply(mode === "add" ? { add_label_ids: ids } : { remove_label_ids: ids });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-72 space-y-3 p-3">
        <SegmentedControl<LabelMode>
          value={mode}
          onChange={setMode}
          ariaLabel="Add or remove labels"
          size="sm"
          className="w-full"
          options={[
            { value: "add", label: "Add", icon: Plus },
            { value: "remove", label: "Remove", icon: Minus },
          ]}
        />
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Search labels
          </label>
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            id={searchId}
            autoFocus
            value={query}
            placeholder="Search labels…"
            onChange={(event) => setQuery(event.target.value)}
            className="pl-8"
          />
        </div>
        {shown.length === 0 ? (
          <p role="status" className="py-4 text-center text-sm text-fg-muted">
            {labels.length === 0 ? "No labels yet. Create them in Settings." : "No labels match."}
          </p>
        ) : (
          <ul aria-label="Labels" className="-mx-1 max-h-56 space-y-0.5 overflow-y-auto overscroll-contain">
            {shown.map((label) => (
              <li key={label.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-sm text-fg transition-colors duration-(--dur-1) hover:bg-fg/[0.05] pointer-coarse:min-h-10">
                  <Checkbox checked={picked.has(label.id)} onChange={(event) => flip(label.id, event.target.checked)} />
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                  <span className="min-w-0 flex-1 truncate">{label.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <Button size="sm" className="w-full" disabled={picked.size === 0} onClick={apply}>
          {picked.size === 0
            ? mode === "add"
              ? "Pick labels to add"
              : "Pick labels to remove"
            : `${mode === "add" ? "Add" : "Remove"} ${pluralize(picked.size, "label")}`}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------- Due date ------------------------------- */

export interface BulkDueDatePopoverProps {
  trigger: ReactNode;
  onApply: (date: string | null) => void;
}

/** Sets (or clears) the due date of every selected task. */
export function BulkDueDatePopover({ trigger, onApply }: BulkDueDatePopoverProps) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const valid = isDateOnly(value);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) setValue("");
  }

  function apply(date: string | null) {
    onApply(date);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-64 space-y-3 p-3">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) apply(value);
          }}
        >
          <label htmlFor={inputId} className="block text-xs font-medium text-fg">
            New due date
          </label>
          <Input id={inputId} type="date" autoFocus value={value} onChange={(event) => setValue(event.target.value)} />
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={() => apply(null)}>
              Clear due date
            </Button>
            <Button type="submit" size="sm" className="flex-1" disabled={!valid}>
              Set date
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
