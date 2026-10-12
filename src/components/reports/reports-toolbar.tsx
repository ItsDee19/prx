"use client";

import { useCallback, useId, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import type { ClientSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isDateOnly } from "@/lib/workspace-time";
import { RANGE_PRESETS, matchingPreset, presetRange } from "./report-params";

export interface ReportsToolbarProps {
  from: string;
  to: string;
  clientId: string | null;
  clients: ClientSummary[];
  /** Workspace today (presets end today). */
  today: string;
  /** Whether the range and client filters apply to the active tab. */
  showRange: boolean;
  className?: string;
}

const ACTIVE_FILTER = "border-accent/50 bg-accent-soft/60";

function useReportParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );
  return { setParams, isPending };
}

/**
 * Range (presets or custom native dates) and client filter for /reports.
 * Everything lives in the URL (`?from&to&client`) so views are shareable.
 */
export function ReportsToolbar({ from, to, clientId, clients, today, showRange, className }: ReportsToolbarProps) {
  const { setParams, isPending } = useReportParams();
  const fromId = useId();
  const toId = useId();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [synced, setSynced] = useState({ from, to });
  // Keep the inputs in step with the URL (back/forward, presets, clear).
  if (synced.from !== from || synced.to !== to) {
    setSynced({ from, to });
    setDraftFrom(from);
    setDraftTo(to);
  }

  const preset = matchingPreset(from, to, today);
  const defaultPreset = preset === "12w";
  const unknownClient = clientId && !clients.some((client) => client.id === clientId);
  const filtered = Boolean(clientId) || (showRange && !defaultPreset);

  function applyPreset(id: string) {
    const match = RANGE_PRESETS.find((item) => item.id === id);
    if (!match) return;
    if (match.id === "12w") {
      setParams({ from: null, to: null });
      return;
    }
    const range = presetRange(today, match.weeks);
    setParams({ from: range.from, to: range.to });
  }

  function commitDate(which: "from" | "to", value: string) {
    if (!isDateOnly(value)) return;
    const nextFrom = which === "from" ? value : draftFrom;
    const nextTo = which === "to" ? value : draftTo;
    if (!isDateOnly(nextFrom) || !isDateOnly(nextTo)) return;
    const [start, end] = nextFrom <= nextTo ? [nextFrom, nextTo] : [nextTo, nextFrom];
    setParams({ from: start, to: end });
  }

  return (
    <div
      role="search"
      aria-label="Filter reports"
      aria-busy={isPending || undefined}
      className={cn("mb-4 flex flex-wrap items-end gap-2 sm:mb-5", className)}
    >
      {showRange ? (
        <>
          <NativeSelect
            aria-label="Date range"
            value={preset ?? "custom"}
            onChange={(event) => applyPreset(event.target.value)}
            wrapperClassName="w-full sm:w-auto"
            className={cn("sm:w-auto", !defaultPreset && ACTIVE_FILTER)}
          >
            {RANGE_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
            <option value="custom" disabled>
              Custom range
            </option>
          </NativeSelect>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <label htmlFor={fromId} className="sr-only">
              From
            </label>
            <Input
              id={fromId}
              type="date"
              value={draftFrom}
              max={draftTo || undefined}
              onChange={(event) => {
                setDraftFrom(event.target.value);
                commitDate("from", event.target.value);
              }}
              className="h-9 min-w-0 flex-1 px-3 tabular-nums sm:w-40 sm:flex-none"
            />
            <span aria-hidden className="text-sm text-fg-muted">
              to
            </span>
            <label htmlFor={toId} className="sr-only">
              To
            </label>
            <Input
              id={toId}
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              onChange={(event) => {
                setDraftTo(event.target.value);
                commitDate("to", event.target.value);
              }}
              className="h-9 min-w-0 flex-1 px-3 tabular-nums sm:w-40 sm:flex-none"
            />
          </div>
        </>
      ) : null}

      <NativeSelect
        aria-label="Filter by client"
        value={clientId ?? ""}
        onChange={(event) => setParams({ client: event.target.value || null })}
        wrapperClassName="min-w-40 flex-1 sm:w-auto sm:flex-none"
        className={cn("sm:w-auto sm:max-w-60", clientId && ACTIVE_FILTER)}
      >
        <option value="">All clients</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name} ({client.code})
          </option>
        ))}
        {unknownClient ? <option value={clientId}>Archived client</option> : null}
      </NativeSelect>

      <div className="flex h-9 items-center gap-2 sm:ml-auto">
        {isPending ? <Spinner size="sm" className="text-fg-muted" /> : null}
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => setParams({ from: null, to: null, client: null })}>
            <X aria-hidden />
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
