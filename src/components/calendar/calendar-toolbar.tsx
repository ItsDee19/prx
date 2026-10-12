"use client";

import { Building2, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, FolderKanban, Tag, UserRound, X } from "lucide-react";
import { FilterMenu, FilterPill } from "@/components/tasks/task-filters";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import { SaveViewButton } from "@/components/views/save-view-button";
import type { ClientSummary, Label, ProjectSummary, SavedViewFilters, UserSummary } from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { rangeContains, rangeTitle, shiftAnchor, type CalendarViewMode } from "./calendar-dates";
import { ASSIGNEE_ME, ASSIGNEE_NONE, countCalendarFilters, type CalendarParams, type CalendarScope } from "./calendar-params";

export type CalendarNavigate = (patch: Record<string, string | null>, mode?: "push" | "replace") => void;

export interface CalendarToolbarProps {
  params: CalendarParams;
  today: string;
  projects: ProjectSummary[];
  clients: ClientSummary[];
  labels: Label[];
  users: UserSummary[];
  viewerId: string;
  itemCount: number;
  pending: boolean;
  navigate: CalendarNavigate;
}

/**
 * Period navigation (previous / today / next), the Month/Week switch and the
 * Mine/All scope, project, client, assignee (All only) and label filters.
 * Everything lives in the URL; dates push history, filters replace it.
 */
export function CalendarToolbar({
  params,
  today,
  projects,
  clients,
  labels,
  users,
  viewerId,
  itemCount,
  pending,
  navigate,
}: CalendarToolbarProps) {
  const { view, date } = params;
  const title = rangeTitle(view, date);
  const showsToday = rangeContains(view, date, today);
  const unit = view === "month" ? "month" : "week";

  const goTo = (anchor: string | null) => navigate({ date: anchor === today ? null : anchor }, "push");
  const switchView = (next: CalendarViewMode) => {
    // Keep today in view when it is visible now; otherwise keep the anchor.
    const anchor = rangeContains(view, date, today) ? today : date;
    navigate({ view: next === "month" ? null : next, date: anchor === today ? null : anchor }, "push");
  };

  const selectedClient = clients.find((client) => client.id === params.clientId) ?? null;
  const projectOptions = (selectedClient ? projects.filter((project) => project.client_code === selectedClient.code) : projects).map(
    (project) => ({
      value: project.id,
      label: project.client_code ? `${project.client_code} · ${project.name}` : project.name,
      icon: (
        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color ?? "var(--fg-subtle)" }} />
      ),
    }),
  );
  const filtered = countCalendarFilters(params) > 0;
  // A saved calendar view keeps the layout and filters but never the anchor
  // date, so opening it always lands on the current period.
  const viewFilters: SavedViewFilters = {};
  if (view === "week") viewFilters.view = "week";
  if (params.scope === "all") viewFilters.scope = "all";
  if (params.projectId) viewFilters.project = params.projectId;
  if (params.clientId) viewFilters.client = params.clientId;
  if (params.labelId) viewFilters.label = params.labelId;
  if (params.assignee) viewFilters.assignee = params.assignee;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={`Previous ${unit}`}
            title={`Previous ${unit}`}
            onClick={() => goTo(shiftAnchor(view, date, -1))}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="outline" size="sm" onClick={() => goTo(null)} disabled={showsToday && !params.hasDate}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={`Next ${unit}`}
            title={`Next ${unit}`}
            onClick={() => goTo(shiftAnchor(view, date, 1))}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <h2 aria-live="polite" className="min-w-0 truncate px-1 text-base font-semibold tracking-[-0.01em] text-fg tabular-nums">
          {title}
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <span role="status" aria-live="polite" className="hidden items-center gap-2 text-xs tabular-nums text-fg-muted sm:inline-flex">
            {pending ? <Spinner size="sm" /> : null}
            {pluralize(itemCount, "item")}
          </span>
          <SegmentedControl<CalendarViewMode>
            value={view}
            onChange={switchView}
            ariaLabel="Calendar view"
            options={[
              { value: "month", label: "Month", icon: CalendarDays },
              { value: "week", label: "Week", icon: CalendarRange },
            ]}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <SegmentedControl<CalendarScope>
          value={params.scope}
          onChange={(next) => navigate({ scope: next === "mine" ? null : next, assignee: null })}
          ariaLabel="Whose calendar"
          options={[
            { value: "mine", label: "Mine" },
            { value: "all", label: "Everyone" },
          ]}
        />
        <FilterMenu
          label="Project"
          allLabel="All projects"
          value={params.projectId}
          onChange={(value) => navigate({ project: value || null })}
          icon={<FolderKanban aria-hidden className="size-3.5" />}
          options={projectOptions}
        />
        <FilterMenu
          label="Client"
          allLabel="All clients"
          value={params.clientId}
          onChange={(value) => navigate({ client: value || null, project: null })}
          icon={<Building2 aria-hidden className="size-3.5" />}
          options={clients.map((client) => ({
            value: client.id,
            label: `${client.code} · ${client.name}`,
            icon: <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: client.color }} />,
          }))}
        />
        {params.scope === "all" ? (
          <FilterMenu
            label="Assignee"
            allLabel="Everyone"
            value={params.assignee}
            onChange={(value) => navigate({ assignee: value || null })}
            icon={<UserRound aria-hidden className="size-3.5" />}
            specialOptions={[
              { value: ASSIGNEE_ME, label: "Me" },
              { value: ASSIGNEE_NONE, label: "Unassigned" },
            ]}
            options={users
              .filter((member) => member.id !== viewerId)
              .map((member) => ({ value: member.id, label: member.name }))}
          />
        ) : null}
        <FilterMenu
          label="Label"
          allLabel="Any label"
          value={params.labelId}
          onChange={(value) => navigate({ label: value || null })}
          icon={<Tag aria-hidden className="size-3.5" />}
          options={labels.map((label) => ({
            value: label.id,
            label: label.name,
            icon: <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />,
          }))}
        />
        {filtered ? (
          <FilterPill
            active={false}
            onClick={() => navigate({ project: null, client: null, label: null, assignee: null })}
            className="border-transparent bg-transparent"
          >
            <X aria-hidden className="size-3.5" />
            Clear filters
          </FilterPill>
        ) : null}
        <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-xs tabular-nums text-fg-muted sm:hidden">
          {pending ? <Spinner size="sm" /> : null}
          {pluralize(itemCount, "item")}
        </span>
        <SaveViewButton scope="calendar" filters={viewFilters} className="ml-auto" />
      </div>
    </div>
  );
}
