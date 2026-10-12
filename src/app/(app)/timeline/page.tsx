import type { Metadata } from "next";
import Link from "next/link";
import { ChartGantt, SearchX } from "lucide-react";
import { portfolioRows } from "@/components/timeline/build-rows";
import { TimelineGrid } from "@/components/timeline/timeline-grid";
import { parseZoom } from "@/components/timeline/timeline-math";
import { TimelineToolbar } from "@/components/timeline/timeline-toolbar";
import type { TimelineZoom } from "@/components/timeline/types";
import { UnscheduledList } from "@/components/timeline/unscheduled-list";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { listClientSummaries } from "@/lib/data/clients";
import { listTimeline, type TimelinePortfolioFilters } from "@/lib/data/timeline";
import { RAG_HEALTHS, SERVICE_LINES, type RagHealth, type ServiceLine } from "@/lib/types";
import { pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Timeline" };

type RawSearchParams = Record<string, string | string[] | undefined>;

interface TimelinePageProps {
  searchParams: Promise<RawSearchParams>;
}

const DEFAULT_ZOOM: TimelineZoom = "month";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function parseService(value: string): ServiceLine | null {
  return (SERVICE_LINES as readonly string[]).includes(value) ? (value as ServiceLine) : null;
}

function parseHealth(value: string): RagHealth | "none" | null {
  if (value === "none") return "none";
  return (RAG_HEALTHS as readonly string[]).includes(value) ? (value as RagHealth) : null;
}

/**
 * Portfolio timeline (SPEC.md section 19.1): every top-level engagement as a
 * bar grouped by client, with phases, milestones, gates, go-live, tuning
 * window and today line. `?zoom=week|month|quarter&client=&service=&health=&closed=1`.
 * Read-only; the chart scrolls inside its own container.
 */
export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  await requireUser();
  const raw = await searchParams;
  const zoom = parseZoom(raw.zoom, DEFAULT_ZOOM);
  const client = first(raw.client).slice(0, 64) || null;
  const service = parseService(first(raw.service));
  const health = parseHealth(first(raw.health));
  const closed = first(raw.closed) === "1";

  const filters: TimelinePortfolioFilters = { includeClosed: closed };
  if (client) filters.clientId = client;
  if (service) filters.serviceLine = service;
  if (health) filters.health = health;

  const [data, clients, today] = await Promise.all([listTimeline(filters), listClientSummaries(), getWorkspaceToday()]);
  const { rows, groups } = portfolioRows(data, today);
  const filtered = Boolean(client || service || health);
  const scheduledClients = data.groups.filter((group) => group.client !== null).length;
  const total = rows.length + data.unscheduled.length;

  const description =
    total === 0
      ? filtered
        ? "No engagements match these filters."
        : "Every engagement as a bar, grouped by client."
      : `${pluralize(total, closed ? "engagement" : "open engagement")} · ${pluralize(scheduledClients, "client")}${
          data.unscheduled.length > 0 ? ` · ${data.unscheduled.length} unscheduled` : ""
        }`;

  return (
    <div className="min-w-0">
      <PageHeader title="Timeline" description={description} />

      <TimelineToolbar
        zoom={zoom}
        defaultZoom={DEFAULT_ZOOM}
        client={client}
        service={service}
        health={health}
        closed={closed}
        clients={clients}
      />

      {rows.length > 0 && data.range ? (
        <TimelineGrid
          rows={rows}
          groups={groups}
          groupLabels
          range={data.range}
          zoom={zoom}
          today={today}
          labelHeading="Engagement"
          aria-label="Portfolio timeline"
        />
      ) : total === 0 && filtered ? (
        <EmptyState
          icon={SearchX}
          title="No engagements match."
          description="Try another client, service line or health, or clear the filters."
          action={
            <Link href={closed ? "/timeline?closed=1" : "/timeline"} className={buttonVariants({ variant: "outline" })}>
              Clear filters
            </Link>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ChartGantt}
          title={total === 0 ? "Nothing on the timeline yet." : "No scheduled engagements."}
          description={
            total === 0
              ? closed
                ? "Engagements appear here once they exist."
                : "Open engagements appear here. Turn on Show closed to see finished work."
              : "Give the engagements below a start or due date to see them as bars."
          }
          action={
            <Link href="/projects" className={buttonVariants({ variant: "outline" })}>
              Go to projects
            </Link>
          }
        />
      ) : null}

      <UnscheduledList projects={data.unscheduled} className="mt-4 sm:mt-6" />
    </div>
  );
}
