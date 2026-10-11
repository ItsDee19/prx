"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, LayoutGrid, List, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import { PRIORITY_CONFIG, STATUS_CONFIG, STATUS_ORDER } from "@/lib/constants";
import { PRIORITIES, type ProjectStatus, type UserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  countActiveFilters,
  DEFAULT_SORT,
  DEFAULT_VIEW,
  isPriority,
  isProjectSort,
  SORT_OPTIONS,
  type ParsedProjectParams,
  type ProjectView,
} from "./project-filters";

export interface ProjectsToolbarProps {
  params: ParsedProjectParams;
  users: UserSummary[];
  className?: string;
}

const SEARCH_DEBOUNCE_MS = 300;

const VIEW_OPTIONS: { value: ProjectView; label: string; icon: typeof LayoutGrid }[] = [
  { value: "board", label: "Board view", icon: LayoutGrid },
  { value: "list", label: "List view", icon: List },
];

/**
 * Every filter lives in the URL so views are shareable. The toolbar only
 * edits the search params; the server page re-renders with the results.
 */
export function ProjectsToolbar({ params, users, className }: ProjectsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState(params.q);
  const searchRef = useRef<HTMLInputElement>(null);

  const activeCount = countActiveFilters(params);

  /** Applies a set of changes to the current URL (null removes the key). */
  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // Debounced search -> ?q=
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === params.q) return;
    const timer = window.setTimeout(() => setParams({ q: trimmed || null }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, params.q, setParams]);

  // When the URL changes under us (Clear filters, back button), adopt its query
  // unless the user is mid-typing in the box.
  useEffect(() => {
    if (document.activeElement === searchRef.current) return;
    setQuery(params.q);
  }, [params.q]);

  function toggleStatus(status: ProjectStatus, checked: boolean) {
    const current = new Set(params.status);
    if (checked) current.add(status);
    else current.delete(status);
    const ordered = STATUS_ORDER.filter((value) => current.has(value));
    setParams({ status: ordered.length > 0 ? ordered.join(",") : null });
  }

  function clearFilters() {
    setQuery("");
    setParams({ q: null, status: null, priority: null, owner: null, sub: null });
  }

  const statusSummary =
    params.status.length === 0
      ? "Status"
      : params.status.length === 1
        ? STATUS_CONFIG[params.status[0]].label
        : `Status · ${params.status.length}`;

  return (
    <div
      role="search"
      aria-label="Filter projects"
      className={cn("mb-5 flex flex-wrap items-center gap-2", className)}
    >
      <div className="relative w-full sm:w-64">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
        />
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
          }}
          placeholder="Search projects"
          aria-label="Search projects"
          autoComplete="off"
          enterKeyHint="search"
          className="pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
        />
        {isPending ? (
          <Spinner size="sm" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
        ) : query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-fg-subtle outline-none transition-colors duration-150 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="md"
            aria-label={`Filter by status${params.status.length > 0 ? ` (${params.status.length} selected)` : ""}`}
            className={cn(params.status.length > 0 && "border-accent/50 bg-accent-soft/60 text-fg")}
          >
            {statusSummary}
            <ChevronDown aria-hidden className="text-fg-subtle" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[12rem]">
          <DropdownMenuLabel>Show statuses</DropdownMenuLabel>
          {STATUS_ORDER.map((status) => {
            const config = STATUS_CONFIG[status];
            return (
              <DropdownMenuCheckboxItem
                key={status}
                checked={params.status.includes(status)}
                onCheckedChange={(checked) => toggleStatus(status, checked)}
              >
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", config.dotClass)} />
                {config.label}
              </DropdownMenuCheckboxItem>
            );
          })}
          {params.status.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <button
                type="button"
                onClick={() => setParams({ status: null })}
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs font-medium text-fg-muted outline-none transition-colors duration-150 hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
              >
                Clear statuses
              </button>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <NativeSelect
        aria-label="Filter by priority"
        value={params.priority ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          setParams({ priority: isPriority(value) ? value : null });
        }}
        wrapperClassName="w-auto"
        className={cn("w-auto", params.priority && "border-accent/50 bg-accent-soft/60")}
      >
        <option value="">Any priority</option>
        {PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {PRIORITY_CONFIG[priority].label}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        aria-label="Filter by owner"
        value={params.owner ?? ""}
        onChange={(event) => setParams({ owner: event.target.value || null })}
        wrapperClassName="w-auto"
        className={cn("w-auto max-w-44", params.owner && "border-accent/50 bg-accent-soft/60")}
      >
        <option value="">Anyone</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
        {params.owner && !users.some((user) => user.id === params.owner) ? (
          <option value={params.owner}>Unknown user</option>
        ) : null}
      </NativeSelect>

      <label className="inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-fg transition-colors duration-150 hover:border-border-strong">
        <Checkbox checked={params.includeSub} onChange={(event) => setParams({ sub: event.target.checked ? "1" : null })} />
        Include sub-projects
      </label>

      {activeCount > 0 ? (
        <Button variant="ghost" size="md" onClick={clearFilters} className="gap-1.5">
          <X aria-hidden />
          Clear
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular-nums text-accent-fg">
            {activeCount}
            <span className="sr-only"> active filters</span>
          </span>
        </Button>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <NativeSelect
          aria-label="Sort projects"
          value={params.sort}
          onChange={(event) => {
            const value = event.target.value;
            setParams({ sort: isProjectSort(value) && value !== DEFAULT_SORT ? value : null });
          }}
          wrapperClassName="w-auto"
          className="w-auto"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              Sort: {option.label}
            </option>
          ))}
        </NativeSelect>

        <SegmentedControl
          ariaLabel="View"
          value={params.view}
          onChange={(view) => setParams({ view: view === DEFAULT_VIEW ? null : view })}
          options={VIEW_OPTIONS}
          iconOnly
          className="h-9 px-1"
        />
      </div>
    </div>
  );
}
