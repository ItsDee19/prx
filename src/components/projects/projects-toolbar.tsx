"use client";

import { useCallback, useEffect, useId, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, LayoutGrid, List, ListFilter, Search, SlidersHorizontal, Tag, X } from "lucide-react";
import { LabelPicker } from "@/components/labels/label-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RagDot } from "@/components/ui/rag-dot";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import { SaveViewButton } from "@/components/views/save-view-button";
import {
  ENGAGEMENT_TYPE_CONFIG,
  ENGAGEMENT_TYPE_ORDER,
  PRIORITY_CONFIG,
  RAG_CONFIG,
  RAG_ORDER,
  SERVICE_LINE_CONFIG,
  SERVICE_LINE_ORDER,
  STATUS_CONFIG,
  STATUS_ORDER,
} from "@/lib/constants";
import {
  PRIORITIES,
  type ClientSummary,
  type EngagementType,
  type LabelSummary,
  type ProjectStatus,
  type RagHealth,
  type ServiceLine,
  type UserSummary,
} from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import {
  CLEARED_FILTER_PARAMS,
  CLEARED_REFINEMENTS,
  countActiveFilters,
  countRefinements,
  countSecondaryRefinements,
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
  /** Clients for the client filter (non-archived). */
  clients?: ClientSummary[];
  /** Label catalogue for the label filter. */
  labels?: LabelSummary[];
  /** Number of projects listed; labels the confirm button of the phone filter sheet. */
  resultCount?: number;
  className?: string;
}

/** Optimistic changes to the parsed params (the search box keeps its own state). */
type ParamsPatch = Partial<Omit<ParsedProjectParams, "q">>;

const SEARCH_DEBOUNCE_MS = 300;

/** Highlight for a filter control that currently narrows the results. */
const ACTIVE_CONTROL_CLASS = "border-accent/50 bg-accent-soft/60 text-fg";

/** Bordered checkbox tile used in the phone sheet and the "More" popover. */
const TILE_CLASS = cn(
  "flex h-10 min-w-0 cursor-pointer select-none items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-fg",
  "transition-colors duration-150 hover:border-border-strong has-checked:border-accent/50 has-checked:bg-accent-soft/60",
);

const VIEW_OPTIONS: { value: ProjectView; label: string; icon: typeof LayoutGrid }[] = [
  { value: "board", label: "Board view", icon: LayoutGrid },
  { value: "list", label: "List view", icon: List },
];

function CountBadge({ count, label }: { count: number; label: string }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular-nums text-accent-fg">
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

/** Adds or removes `value`, keeping the canonical `order`. */
function toggled<T extends string>(list: T[], value: T, checked: boolean, order: readonly T[]): T[] {
  const set = new Set(list);
  if (checked) set.add(value);
  else set.delete(value);
  return order.filter((item) => set.has(item));
}

/** "Service", "AI agents", "Service · 3". */
function summary(base: string, labels: string[]): string {
  if (labels.length === 0) return base;
  if (labels.length === 1) return labels[0];
  return `${base} · ${labels.length}`;
}

function SheetGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium leading-5 text-fg">{legend}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Every filter lives in the URL so views are shareable. The toolbar only
 * edits the search params; the server page re-renders with the results.
 *
 * Phones get the search field, a "Filters" button (a sheet with every
 * refinement and the sort) and the view toggle. From md the main filters
 * (status, client, service line, health, labels) sit inline and the rest
 * (priority, owner, engagement type, sub-projects) live behind "More". Both
 * layouts are always rendered and swapped with CSS, so server and client
 * markup match at every width.
 */
export function ProjectsToolbar({ params, users, clients = [], labels = [], resultCount, className }: ProjectsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Controls show a change at once; the server page catches up when the navigation lands.
  const [filters, applyPatch] = useOptimistic(
    params,
    (state: ParsedProjectParams, patch: ParamsPatch): ParsedProjectParams => ({ ...state, ...patch }),
  );

  const [query, setQuery] = useState(params.q);
  const searchRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const fieldId = useId();

  // Query string of the latest request. Quick successive changes (ticking two
  // statuses in a row) build on it instead of on a URL that has not caught up.
  const latestQuery = useRef(searchParams.toString());
  useEffect(() => {
    if (!isPending) latestQuery.current = searchParams.toString();
  }, [searchParams, isPending]);

  const activeCount = countActiveFilters(filters);
  const refinementCount = countRefinements(filters);
  const secondaryCount = countSecondaryRefinements(filters);

  /** Applies a set of changes to the current URL (null removes the key). */
  const setParams = useCallback(
    (changes: Record<string, string | null>, patch?: ParamsPatch) => {
      const next = new URLSearchParams(latestQuery.current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      latestQuery.current = qs;
      startTransition(() => {
        if (patch) applyPatch(patch);
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [applyPatch, pathname, router],
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

  const joined = (list: string[]) => (list.length > 0 ? list.join(",") : null);

  function toggleStatus(status: ProjectStatus, checked: boolean) {
    const next = toggled(filters.status, status, checked, STATUS_ORDER);
    setParams({ status: joined(next) }, { status: next });
  }

  function toggleService(value: ServiceLine, checked: boolean) {
    const next = toggled(filters.service, value, checked, SERVICE_LINE_ORDER);
    setParams({ service: joined(next) }, { service: next });
  }

  function toggleEngagement(value: EngagementType, checked: boolean) {
    const next = toggled(filters.engagement, value, checked, ENGAGEMENT_TYPE_ORDER);
    setParams({ engagement: joined(next) }, { engagement: next });
  }

  function toggleHealth(value: RagHealth, checked: boolean) {
    const next = toggled(filters.health, value, checked, RAG_ORDER);
    setParams({ health: joined(next) }, { health: next });
  }

  function setLabels(ids: string[]) {
    const next = Array.from(new Set(ids));
    setParams({ label: joined(next) }, { labels: next });
  }

  function setClient(value: string) {
    const client = value || null;
    setParams({ client }, { client });
  }

  function setPriority(value: string) {
    const priority = isPriority(value) ? value : null;
    setParams({ priority }, { priority });
  }

  function setOwner(value: string) {
    const owner = value || null;
    setParams({ owner }, { owner });
  }

  function setIncludeSub(includeSub: boolean) {
    setParams({ sub: includeSub ? "1" : null }, { includeSub });
  }

  function setSort(value: string) {
    const sort = isProjectSort(value) ? value : DEFAULT_SORT;
    setParams({ sort: sort === DEFAULT_SORT ? null : sort }, { sort });
  }

  function setView(view: ProjectView) {
    setParams({ view: view === DEFAULT_VIEW ? null : view }, { view });
  }

  /** Every refinement except the search query (the phone sheet's "Clear filters"). */
  function clearRefinements() {
    setParams({ ...CLEARED_FILTER_PARAMS }, CLEARED_REFINEMENTS);
  }

  /** Every narrowing filter including the search query (the inline "Clear"). */
  function clearFilters() {
    setQuery("");
    setParams({ q: null, ...CLEARED_FILTER_PARAMS }, CLEARED_REFINEMENTS);
  }

  /** Priority, owner, engagement type and sub-projects (the "More" popover's reset). */
  function clearSecondary() {
    setParams(
      { priority: null, owner: null, engagement: null, sub: null },
      { priority: null, owner: null, engagement: [], includeSub: false },
    );
  }

  const statusSummary = summary(
    "Status",
    filters.status.map((status) => STATUS_CONFIG[status].label),
  );
  const serviceSummary = summary(
    "Service line",
    filters.service.map((value) => SERVICE_LINE_CONFIG[value].label),
  );
  const healthSummary = summary(
    "Health",
    filters.health.map((value) => RAG_CONFIG[value].label),
  );
  const labelNames = filters.labels
    .map((id) => labels.find((label) => label.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const labelSummary = filters.labels.length === 0 ? "Labels" : labelNames.length === 1 && filters.labels.length === 1 ? labelNames[0] : `Labels · ${filters.labels.length}`;

  const unknownOwner = filters.owner && !users.some((user) => user.id === filters.owner) ? filters.owner : null;
  const unknownClient = filters.client && !clients.some((client) => client.id === filters.client) ? filters.client : null;

  const priorityOptions = (
    <>
      <option value="">Any priority</option>
      {PRIORITIES.map((priority) => (
        <option key={priority} value={priority}>
          {PRIORITY_CONFIG[priority].label}
        </option>
      ))}
    </>
  );

  const ownerOptions = (
    <>
      <option value="">Any owner</option>
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {user.name}
        </option>
      ))}
      {unknownOwner ? <option value={unknownOwner}>Unknown user</option> : null}
    </>
  );

  const clientOptions = (
    <>
      <option value="">Any client</option>
      {clients.map((client) => (
        <option key={client.id} value={client.id}>
          {client.code} · {client.name}
        </option>
      ))}
      {unknownClient ? <option value={unknownClient}>Archived or unknown client</option> : null}
    </>
  );

  const sheetConfirmLabel =
    isPending || resultCount === undefined ? "Show results" : `Show ${pluralize(resultCount, "project")}`;

  const engagementTiles = (
    <div className="grid grid-cols-2 gap-2">
      {ENGAGEMENT_TYPE_ORDER.map((value) => {
        const config = ENGAGEMENT_TYPE_CONFIG[value];
        return (
          <label key={value} className={TILE_CLASS}>
            <Checkbox
              checked={filters.engagement.includes(value)}
              onChange={(event) => toggleEngagement(value, event.target.checked)}
            />
            <Icon name={config.icon} className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
            <span className="truncate">{config.label}</span>
          </label>
        );
      })}
    </div>
  );

  const includeSubTile = (
    <label className={cn(TILE_CLASS, "h-auto min-h-10 py-2")}>
      <Checkbox checked={filters.includeSub} onChange={(event) => setIncludeSub(event.target.checked)} />
      Include sub-projects
    </label>
  );

  return (
    <div
      role="search"
      aria-label="Filter projects"
      className={cn("mb-4 flex flex-wrap items-center gap-2 sm:mb-5", className)}
    >
      <div className="relative w-full md:w-60 xl:w-72">
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
          className="pl-8 pr-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {isPending ? (
          <Spinner size="sm" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
        ) : query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-fg-subtle outline-none transition-colors duration-150 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:right-0.5 pointer-coarse:size-8"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {/* Phones: the refinements live in a sheet behind one button. */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="md" className={cn("md:hidden", refinementCount > 0 && ACTIVE_CONTROL_CLASS)}>
            <SlidersHorizontal aria-hidden className="text-fg-muted" />
            Filters
            {refinementCount > 0 ? <CountBadge count={refinementCount} label="active" /> : null}
          </Button>
        </DialogTrigger>
        <DialogContent title="Filters" size="sm">
          <div className="space-y-5">
            <SheetGroup legend="Status">
              <div className="grid grid-cols-2 gap-2">
                {STATUS_ORDER.map((status) => {
                  const config = STATUS_CONFIG[status];
                  return (
                    <label key={status} className={TILE_CLASS}>
                      <Checkbox
                        checked={filters.status.includes(status)}
                        onChange={(event) => toggleStatus(status, event.target.checked)}
                      />
                      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", config.dotClass)} />
                      <span className="truncate">{config.label}</span>
                    </label>
                  );
                })}
              </div>
            </SheetGroup>

            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-client`}>Client</Label>
              <NativeSelect
                id={`${fieldId}-client`}
                value={filters.client ?? ""}
                onChange={(event) => setClient(event.target.value)}
                className={cn(filters.client && ACTIVE_CONTROL_CLASS)}
              >
                {clientOptions}
              </NativeSelect>
            </div>

            <SheetGroup legend="Service line">
              <div className="grid grid-cols-2 gap-2">
                {SERVICE_LINE_ORDER.map((value) => {
                  const config = SERVICE_LINE_CONFIG[value];
                  return (
                    <label key={value} className={TILE_CLASS}>
                      <Checkbox
                        checked={filters.service.includes(value)}
                        onChange={(event) => toggleService(value, event.target.checked)}
                      />
                      <Icon name={config.icon} className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
                      <span className="truncate">{config.label}</span>
                    </label>
                  );
                })}
              </div>
            </SheetGroup>

            <SheetGroup legend="Health">
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
                {RAG_ORDER.map((value) => (
                  <label key={value} className={TILE_CLASS}>
                    <Checkbox
                      checked={filters.health.includes(value)}
                      onChange={(event) => toggleHealth(value, event.target.checked)}
                    />
                    <RagDot health={value} showLabel className="min-w-0" />
                  </label>
                ))}
              </div>
            </SheetGroup>

            <div className="space-y-1.5">
              <p className="text-sm font-medium leading-5 text-fg">Labels</p>
              <LabelPicker
                labels={labels}
                value={filters.labels}
                onChange={setLabels}
                allowCreate={false}
                aria-label="Filter by labels"
                className="w-full"
              />
            </div>

            <SheetGroup legend="Engagement type">{engagementTiles}</SheetGroup>

            <div className="grid grid-cols-1 gap-4 min-[380px]:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${fieldId}-priority`}>Priority</Label>
                <NativeSelect
                  id={`${fieldId}-priority`}
                  value={filters.priority ?? ""}
                  onChange={(event) => setPriority(event.target.value)}
                  className={cn(filters.priority && ACTIVE_CONTROL_CLASS)}
                >
                  {priorityOptions}
                </NativeSelect>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${fieldId}-owner`}>Owner</Label>
                <NativeSelect
                  id={`${fieldId}-owner`}
                  value={filters.owner ?? ""}
                  onChange={(event) => setOwner(event.target.value)}
                  className={cn("truncate", filters.owner && ACTIVE_CONTROL_CLASS)}
                >
                  {ownerOptions}
                </NativeSelect>
              </div>
            </div>

            {includeSubTile}

            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-sort`}>Sort by</Label>
              <NativeSelect id={`${fieldId}-sort`} value={filters.sort} onChange={(event) => setSort(event.target.value)}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={clearRefinements} disabled={refinementCount === 0}>
              Clear filters
            </Button>
            <DialogClose asChild>
              <Button>{sheetConfirmLabel}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* md and up: the main controls inline. `contents` lets them wrap as toolbar items. */}
      <div className="hidden md:contents">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="md"
              aria-label={`Filter by status${filters.status.length > 0 ? ` (${filters.status.length} selected)` : ""}`}
              className={cn(filters.status.length > 0 && ACTIVE_CONTROL_CLASS)}
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
                  checked={filters.status.includes(status)}
                  onCheckedChange={(checked) => toggleStatus(status, checked)}
                >
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", config.dotClass)} />
                  {config.label}
                </DropdownMenuCheckboxItem>
              );
            })}
            {filters.status.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setParams({ status: null }, { status: [] })}>Clear statuses</DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <NativeSelect
          aria-label="Filter by client"
          value={filters.client ?? ""}
          onChange={(event) => setClient(event.target.value)}
          wrapperClassName="w-auto min-w-0"
          className={cn("w-auto max-w-48", filters.client && ACTIVE_CONTROL_CLASS)}
        >
          {clientOptions}
        </NativeSelect>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="md"
              aria-label={`Filter by service line${filters.service.length > 0 ? ` (${filters.service.length} selected)` : ""}`}
              className={cn("max-w-56", filters.service.length > 0 && ACTIVE_CONTROL_CLASS)}
            >
              <span className="truncate">{serviceSummary}</span>
              <ChevronDown aria-hidden className="text-fg-subtle" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[13rem]">
            <DropdownMenuLabel>Service lines</DropdownMenuLabel>
            {SERVICE_LINE_ORDER.map((value) => {
              const config = SERVICE_LINE_CONFIG[value];
              return (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={filters.service.includes(value)}
                  onCheckedChange={(checked) => toggleService(value, checked)}
                >
                  <Icon name={config.icon} aria-hidden />
                  {config.label}
                </DropdownMenuCheckboxItem>
              );
            })}
            {filters.service.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setParams({ service: null }, { service: [] })}>
                  Clear service lines
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="md"
              aria-label={`Filter by health${filters.health.length > 0 ? ` (${filters.health.length} selected)` : ""}`}
              className={cn(filters.health.length > 0 && ACTIVE_CONTROL_CLASS)}
            >
              {filters.health.length === 1 ? <RagDot health={filters.health[0]} /> : null}
              {healthSummary}
              <ChevronDown aria-hidden className="text-fg-subtle" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[12rem]">
            <DropdownMenuLabel>Latest status update</DropdownMenuLabel>
            {RAG_ORDER.map((value) => (
              <DropdownMenuCheckboxItem
                key={value}
                checked={filters.health.includes(value)}
                onCheckedChange={(checked) => toggleHealth(value, checked)}
              >
                <RagDot health={value} showLabel />
              </DropdownMenuCheckboxItem>
            ))}
            {filters.health.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setParams({ health: null }, { health: [] })}>Clear health</DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <LabelPicker
          labels={labels}
          value={filters.labels}
          onChange={setLabels}
          allowCreate={false}
          aria-label="Filter by labels"
          trigger={
            <Button
              variant="outline"
              size="md"
              aria-label={`Filter by labels${filters.labels.length > 0 ? ` (${filters.labels.length} selected)` : ""}`}
              className={cn("max-w-48", filters.labels.length > 0 && ACTIVE_CONTROL_CLASS)}
            >
              <Tag aria-hidden className="text-fg-muted" />
              <span className="truncate">{labelSummary}</span>
              <ChevronDown aria-hidden className="text-fg-subtle" />
            </Button>
          }
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="md"
              aria-label={`More filters${secondaryCount > 0 ? ` (${secondaryCount} active)` : ""}`}
              className={cn(secondaryCount > 0 && ACTIVE_CONTROL_CLASS)}
            >
              <ListFilter aria-hidden className="text-fg-muted" />
              More
              {secondaryCount > 0 ? <CountBadge count={secondaryCount} label="active" /> : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(22rem,calc(100vw-1rem))] space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${fieldId}-more-priority`}>Priority</Label>
                <NativeSelect
                  id={`${fieldId}-more-priority`}
                  value={filters.priority ?? ""}
                  onChange={(event) => setPriority(event.target.value)}
                  className={cn(filters.priority && ACTIVE_CONTROL_CLASS)}
                >
                  {priorityOptions}
                </NativeSelect>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${fieldId}-more-owner`}>Owner</Label>
                <NativeSelect
                  id={`${fieldId}-more-owner`}
                  value={filters.owner ?? ""}
                  onChange={(event) => setOwner(event.target.value)}
                  className={cn("truncate", filters.owner && ACTIVE_CONTROL_CLASS)}
                >
                  {ownerOptions}
                </NativeSelect>
              </div>
            </div>
            <SheetGroup legend="Engagement type">{engagementTiles}</SheetGroup>
            {includeSubTile}
            {secondaryCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={clearSecondary} className="w-full">
                Reset these filters
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>

        {activeCount > 0 ? (
          <Button variant="ghost" size="md" onClick={clearFilters} className="gap-1.5">
            <X aria-hidden />
            Clear
            <CountBadge count={activeCount} label="active filters" />
          </Button>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <SaveViewButton scope="projects" />

        <NativeSelect
          aria-label="Sort projects"
          value={filters.sort}
          onChange={(event) => setSort(event.target.value)}
          wrapperClassName="hidden w-auto md:block"
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
          value={filters.view}
          onChange={setView}
          options={VIEW_OPTIONS}
          iconOnly
          className="h-9 px-1"
        />
      </div>
    </div>
  );
}
