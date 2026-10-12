"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as m from "motion/react-m";
import { CornerDownLeft, Search, X } from "lucide-react";
import { searchAction } from "@/actions/search";
import { UserAvatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { matchesHotkey } from "@/hooks/use-hotkeys";
import {
  MOTION,
  SAVED_VIEW_SCOPE_CONFIG,
  SEARCH_QUERY_MAX,
  SEARCH_RESULTS_PER_GROUP,
  navSections,
  type IconName,
} from "@/lib/constants";
import type { GlobalSearchResults } from "@/lib/schemas/search";
import type { SavedView, UserSummary } from "@/lib/types";
import { buildQueryString, cn, dispatchAppCommand, parseTaskKey, subscribeAppCommands } from "@/lib/utils";
import {
  filterPaletteItems,
  projectIdFromPathname,
  readRecentItems,
  rememberRecentItem,
  type PaletteHit,
  type PaletteHitKind,
} from "./palette-utils";
import { PALETTE_ACTIONS, type PaletteAction } from "./registry";

export interface CommandPaletteProps {
  /** Active users: People matches show instantly from this list while the server search runs. */
  users: UserSummary[];
  /** The viewer's saved views (W5); rendered as a "Saved views" group when given. */
  savedViews?: SavedView[];
  /** Shows admin-only navigation entries. */
  isAdmin?: boolean;
}

const DEBOUNCE_MS = 150;
const LOADER_DELAY_MS = 150;
const LOADER_MIN_MS = 300;

const HIT_ICON: Record<PaletteHitKind, IconName> = {
  project: "FolderKanban",
  task: "ListChecks",
  client: "Building2",
  person: "Users",
  comment: "MessageSquare",
  label: "Tag",
};

const RESULT_GROUPS: { key: Exclude<keyof GlobalSearchResults, "query">; heading: string }[] = [
  { key: "projects", heading: "Projects" },
  { key: "tasks", heading: "Tasks" },
  { key: "clients", heading: "Clients" },
  { key: "people", heading: "People" },
  { key: "labels", heading: "Labels" },
  { key: "comments", heading: "Comments" },
];

function normalizeQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, SEARCH_QUERY_MAX).trim();
}

/** A loader flag that turns on after `delay` and, once shown, stays on for at least `minVisible`. */
function useDelayedFlag(active: boolean, delay = LOADER_DELAY_MS, minVisible = LOADER_MIN_MS): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (active) {
      if (visible) return;
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, delay);
      return () => clearTimeout(timer);
    }
    if (!visible) return;
    const remaining = Math.max(0, shownAt.current + minVisible - Date.now());
    const timer = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [active, visible, delay, minVisible]);
  return visible;
}

/** Bolds the first case-insensitive occurrence of `query` in `text`. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const index = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-transparent font-semibold text-fg">{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  );
}

interface PaletteRowProps {
  value: string;
  onSelect: () => void;
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: string | null;
  keys?: string;
  keywords?: string[];
}

function PaletteRow({ value, onSelect, icon, title, subtitle, badge, keys, keywords }: PaletteRowProps) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className={cn(
        "group/item relative flex min-h-10 cursor-pointer select-none items-center gap-3 rounded-[10px] px-2.5 py-2 text-sm text-fg outline-none",
        "transition-colors duration-100 ease-(--ease-out-quart)",
        "data-[selected=true]:bg-accent-soft data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        // The active-nav gradient bar marks the highlighted row.
        "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-grad-brand before:opacity-0",
        "before:transition-opacity before:duration-100 data-[selected=true]:before:opacity-100",
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-fg-muted group-data-[selected=true]/item:text-accent-soft-fg">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate leading-5">{title}</span>
        {subtitle ? <span className="truncate text-xs leading-4 text-fg-muted">{subtitle}</span> : null}
      </span>
      {badge ? (
        <span className="shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[11px] leading-4 text-fg-muted">
          {badge}
        </span>
      ) : null}
      {keys ? <Kbd keys={keys} className="hidden shrink-0 sm:inline-flex" /> : null}
      <CornerDownLeft
        aria-hidden
        className="hidden size-3.5 shrink-0 text-fg-subtle opacity-0 group-data-[selected=true]/item:opacity-100 sm:block"
      />
    </Command.Item>
  );
}

function HitIcon({ hit }: { hit: PaletteHit }) {
  if (hit.kind === "person") {
    return <UserAvatar user={{ name: hit.title, color: hit.color ?? "#86868f" }} size="xs" />;
  }
  return (
    <span className="relative flex">
      <Icon name={HIT_ICON[hit.kind]} aria-hidden className="size-4" />
      {hit.color ? (
        <span
          aria-hidden
          className="absolute -bottom-1 -right-1 size-2 rounded-full ring-2 ring-surface-2"
          style={{ backgroundColor: hit.color }}
        />
      ) : null}
    </span>
  );
}

function PaletteGroup({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-muted"
    >
      {children}
    </Command.Group>
  );
}

/**
 * Ctrl/Cmd+K command menu (SPEC.md section 20.2, W3 search): cmdk inside the
 * ui Dialog root, mounted once in GlobalOverlays. Opens on the `open-palette`
 * AppCommand (GlobalHotkeys sends it for Ctrl/Cmd+K and "/", the
 * CommandMenuTrigger on click). Groups: Recent (empty query), Navigate,
 * Actions, project actions (on `/projects/[id]`), then the debounced server
 * results and Saved views.
 */
export function CommandPalette({ users, savedViews, isAdmin = false }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const projectId = projectIdFromPathname(pathname);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [recent, setRecent] = useState<PaletteHit[]>([]);
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const requestId = useRef(0);
  /** Set when an action opens another overlay, so closing the palette does not pull focus back. */
  const skipFocusReturn = useRef(false);

  const q = normalizeQuery(query);
  const showLoader = useDelayedFlag(pending && q.length > 0);

  const openPalette = useCallback(() => {
    setRecent(readRecentItems());
    setOpen(true);
  }, []);

  const reset = useCallback(() => {
    requestId.current += 1;
    setQuery("");
    setResults(null);
    setPending(false);
    setError(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) openPalette();
      else {
        setOpen(false);
        reset();
      }
    },
    [openPalette, reset],
  );

  useEffect(
    () =>
      subscribeAppCommands((command) => {
        if (command.type === "open-palette") openPalette();
      }),
    [openPalette],
  );

  // Debounced server search; stale responses are ignored.
  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    if (!q) {
      setPending(false);
      setError(null);
      return;
    }
    setPending(true);
    const timer = setTimeout(() => {
      searchAction(q)
        .then((result) => {
          if (id !== requestId.current) return;
          if (result.ok) {
            setResults(result.data);
            setError(null);
          } else {
            setError(result.error);
          }
        })
        .catch(() => {
          if (id === requestId.current) setError("Search is unavailable right now. Please try again.");
        })
        .finally(() => {
          if (id === requestId.current) setPending(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, q]);

  /* ------------------------------ items ----------------------------- */

  const navItems = useMemo(
    () =>
      navSections(isAdmin).flatMap((section) =>
        section.items.map((item) => ({ ...item, groupLabel: section.group.label })),
      ),
    [isAdmin],
  );
  const shownNav = filterPaletteItems(navItems, q, (item) => ({
    label: item.label,
    keywords: ["go", "open", "navigate", item.groupLabel, item.href],
  }));
  const shownActions = filterPaletteItems(
    PALETTE_ACTIONS.filter((action) => action.group === "actions"),
    q,
    (action) => ({ label: action.label, keywords: action.keywords }),
  );
  const shownProjectActions = projectId
    ? filterPaletteItems(
        PALETTE_ACTIONS.filter((action) => action.group === "project"),
        q,
        (action) => ({ label: action.label, keywords: [...(action.keywords ?? []), "project", "here"] }),
      )
    : [];
  const shownViews = savedViews
    ? filterPaletteItems(savedViews, q, (view) => ({
        label: view.name,
        keywords: ["view", "saved", SAVED_VIEW_SCOPE_CONFIG[view.scope].label],
      }))
    : [];
  const shownRecent = q ? [] : recent;

  // Server results only once they belong to (roughly) the current query; people show instantly from `users`.
  const freshResults = results && q ? results : null;
  const localPeople = useMemo<PaletteHit[]>(() => {
    if (!q) return [];
    const needle = q.toLowerCase();
    return users
      .filter((user) => user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle))
      .slice(0, SEARCH_RESULTS_PER_GROUP)
      .map((user) => ({
        kind: "person",
        id: user.id,
        title: user.name,
        subtitle: user.email,
        href: `/tasks?assignee=${encodeURIComponent(user.id)}`,
        badge: null,
        color: user.color,
      }));
  }, [q, users]);

  const resultGroups = RESULT_GROUPS.map((group) => {
    const hits: PaletteHit[] =
      group.key === "people" && (!freshResults || freshResults.query !== q)
        ? localPeople
        : ((freshResults?.[group.key] ?? []) as PaletteHit[]);
    return { ...group, hits };
  }).filter((group) => group.hits.length > 0);
  // An exact task key ("PRX-12") puts the Tasks group first.
  if (parseTaskKey(q) !== null) {
    resultGroups.sort((a, b) => Number(b.key === "tasks") - Number(a.key === "tasks"));
  }

  const values: string[] = [
    ...shownRecent.map((hit) => `recent:${hit.kind}:${hit.id}`),
    ...shownProjectActions.map((action) => `project-action:${action.id}`),
    ...shownNav.map((item) => `nav:${item.id}`),
    ...shownActions.map((action) => `action:${action.id}`),
    ...resultGroups.flatMap((group) => group.hits.map((hit) => `${hit.kind}:${hit.id}`)),
    ...shownViews.map((view) => `view:${view.id}`),
  ];
  const valuesKey = values.join("|");
  const firstValue = values[0] ?? "";

  // Keep a valid highlighted row: the first one whenever the query or the result set changes.
  useEffect(() => {
    setSelected(firstValue);
  }, [q, valuesKey, firstValue]);

  /* ----------------------------- running ---------------------------- */

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const openHit = (hit: PaletteHit) => {
    setRecent(rememberRecentItem(hit));
    go(hit.href);
  };

  const runAction = (action: PaletteAction) => {
    if (action.href) {
      if (projectId) go(action.href({ projectId }));
      return;
    }
    skipFocusReturn.current = true;
    close();
    // Let the palette close first so the next dialog takes focus cleanly.
    window.setTimeout(() => {
      if (action.run) action.run();
      else if (action.command) {
        dispatchAppCommand(
          typeof action.command === "function" ? action.command({ projectId: projectId ?? undefined }) : action.command,
        );
      }
    }, 0);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Ctrl/Cmd+K toggles the palette closed (GlobalHotkeys skips prevented events).
    if (matchesHotkey(event, "mod+k")) {
      event.preventDefault();
      close();
    }
  };

  const nothingFound =
    q.length > 0 &&
    !pending &&
    !error &&
    shownNav.length === 0 &&
    shownActions.length === 0 &&
    shownProjectActions.length === 0 &&
    shownViews.length === 0 &&
    resultGroups.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-overlay backdrop-blur-[3px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out"
        />
        <DialogPrimitive.Content
          asChild
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            if (skipFocusReturn.current) {
              event.preventDefault();
              skipFocusReturn.current = false;
            }
          }}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: MOTION.duration.hover, ease: [...MOTION.ease.outExpo] }}
            className={cn(
              // Glass panel, 640px wide; full width with 12px margins on phones.
              "fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 mx-auto flex w-auto max-w-[640px] origin-top flex-col",
              "max-h-[min(34rem,calc(100dvh-1.5rem))] overflow-hidden rounded-[20px] border border-glass-border glass-panel text-fg shadow-pop outline-none",
              "sm:top-[12dvh] sm:max-h-[min(34rem,76dvh)]",
              "data-[state=closed]:animate-fade-out",
            )}
          >
            <DialogPrimitive.Title className="sr-only">Command menu</DialogPrimitive.Title>
            <Command
              label="Command menu"
              shouldFilter={false}
              vimBindings={false}
              loop
              value={selected}
              onValueChange={setSelected}
              onKeyDown={onKeyDown}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="shrink-0 border-b border-border p-2 sm:p-3">
                <div
                  className={cn(
                    "relative flex items-center gap-2 rounded-[14px] border bg-surface/60 px-3 transition-[border-color] duration-150",
                    inputFocused ? "conic-border border-transparent" : "border-border",
                  )}
                >
                  <Search aria-hidden className="size-4 shrink-0 text-fg-subtle" />
                  <Command.Input
                    value={query}
                    onValueChange={setQuery}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    maxLength={SEARCH_QUERY_MAX}
                    placeholder="Search projects, tasks, clients, people… or type a command"
                    aria-label="Search or type a command"
                    className="h-11 w-full min-w-0 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle sm:text-sm"
                  />
                  {showLoader ? <Spinner size="sm" label="Searching" className="shrink-0 text-fg-muted" /> : null}
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                      className="relative flex size-7 shrink-0 items-center justify-center rounded-full text-fg-muted transition-control hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5"
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  ) : (
                    <Kbd keys="esc" className="hidden shrink-0 sm:inline-flex" />
                  )}
                </div>
              </div>

              <Command.List
                label="Results"
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 scroll-py-2"
              >
                {showLoader && resultGroups.length === 0 ? (
                  <Command.Loading label="Searching">
                    <div className="space-y-1 px-1 pt-3" aria-hidden>
                      {[0, 1, 2].map((row) => (
                        <div key={row} className="flex items-center gap-3 px-1.5 py-2">
                          <span className="skeleton size-7 rounded-lg" />
                          <span className="flex flex-1 flex-col gap-1.5">
                            <span className="skeleton h-3 w-2/5 rounded-full" />
                            <span className="skeleton h-2.5 w-1/4 rounded-full" />
                          </span>
                        </div>
                      ))}
                    </div>
                  </Command.Loading>
                ) : null}

                {error ? (
                  <p role="alert" className="px-3 py-6 text-center text-sm text-danger">
                    {error}
                  </p>
                ) : null}

                {nothingFound ? (
                  <div className="px-4 py-8 text-center" role="status">
                    <p className="text-sm font-medium text-fg [overflow-wrap:anywhere]">No results for “{q}”.</p>
                    <p className="mt-1 text-xs text-fg-muted">Try a project, a task key such as PRX-12, a client or a person.</p>
                  </div>
                ) : null}

                {shownRecent.length > 0 ? (
                  <PaletteGroup heading="Recent">
                    {shownRecent.map((hit) => (
                      <PaletteRow
                        key={`recent:${hit.kind}:${hit.id}`}
                        value={`recent:${hit.kind}:${hit.id}`}
                        onSelect={() => openHit(hit)}
                        icon={<HitIcon hit={hit} />}
                        title={hit.title}
                        subtitle={hit.subtitle}
                        badge={hit.badge}
                      />
                    ))}
                  </PaletteGroup>
                ) : null}

                {shownProjectActions.length > 0 ? (
                  <PaletteGroup heading="This project">
                    {shownProjectActions.map((action) => (
                      <PaletteRow
                        key={action.id}
                        value={`project-action:${action.id}`}
                        onSelect={() => runAction(action)}
                        icon={<Icon name={action.icon} aria-hidden className="size-4" />}
                        title={<Highlight text={action.label} query={q} />}
                        keys={action.keys}
                      />
                    ))}
                  </PaletteGroup>
                ) : null}

                {shownNav.length > 0 ? (
                  <PaletteGroup heading="Navigate">
                    {shownNav.map((item) => (
                      <PaletteRow
                        key={item.id}
                        value={`nav:${item.id}`}
                        onSelect={() => go(item.href)}
                        icon={<Icon name={item.icon} aria-hidden className="size-4" />}
                        title={<Highlight text={item.label} query={q} />}
                        keys={item.shortcut}
                      />
                    ))}
                  </PaletteGroup>
                ) : null}

                {shownActions.length > 0 ? (
                  <PaletteGroup heading="Actions">
                    {shownActions.map((action) => (
                      <PaletteRow
                        key={action.id}
                        value={`action:${action.id}`}
                        onSelect={() => runAction(action)}
                        icon={<Icon name={action.icon} aria-hidden className="size-4" />}
                        title={<Highlight text={action.label} query={q} />}
                        keys={action.keys}
                      />
                    ))}
                  </PaletteGroup>
                ) : null}

                {resultGroups.map((group) => (
                  <PaletteGroup key={group.key} heading={group.heading}>
                    {group.hits.map((hit) => (
                      <PaletteRow
                        key={`${hit.kind}:${hit.id}`}
                        value={`${hit.kind}:${hit.id}`}
                        onSelect={() => openHit(hit)}
                        icon={<HitIcon hit={hit} />}
                        title={<Highlight text={hit.title} query={q} />}
                        subtitle={hit.subtitle}
                        badge={hit.badge}
                      />
                    ))}
                  </PaletteGroup>
                ))}

                {shownViews.length > 0 ? (
                  <PaletteGroup heading="Saved views">
                    {shownViews.map((view) => {
                      const scope = SAVED_VIEW_SCOPE_CONFIG[view.scope];
                      return (
                        <PaletteRow
                          key={view.id}
                          value={`view:${view.id}`}
                          onSelect={() => go(`${scope.href}${buildQueryString(view.filters)}`)}
                          icon={<Icon name={scope.icon} aria-hidden className="size-4" />}
                          title={<Highlight text={view.name} query={q} />}
                          subtitle={view.is_shared ? `${scope.label} · Shared by ${view.owner.name}` : scope.label}
                        />
                      );
                    })}
                  </PaletteGroup>
                ) : null}
              </Command.List>

              <div className="hidden shrink-0 items-center gap-4 border-t border-border px-4 py-2 text-xs text-fg-muted sm:flex">
                <span className="inline-flex items-center gap-1.5">
                  <Kbd keys="up" />
                  <Kbd keys="down" />
                  to move
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Kbd keys="enter" />
                  to open
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5">
                  <Kbd keys="mod+k" />
                  to close
                </span>
              </div>
            </Command>
          </m.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
