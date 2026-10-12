"use client";

import { useId } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { SaveViewButton } from "@/components/views/save-view-button";
import { RAG_CONFIG, RAG_ORDER, SERVICE_LINE_CONFIG, SERVICE_LINE_ORDER } from "@/lib/constants";
import type { ClientSummary, RagHealth, ServiceLine } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TimelineZoomControl } from "./timeline-zoom-control";
import type { TimelineZoom } from "./types";
import { useTimelineParams } from "./use-timeline-params";

export interface TimelineToolbarProps {
  zoom: TimelineZoom;
  defaultZoom: TimelineZoom;
  client: string | null;
  service: ServiceLine | null;
  health: RagHealth | "none" | null;
  closed: boolean;
  clients: ClientSummary[];
  className?: string;
}

const ACTIVE_FILTER = "border-accent/50 bg-accent-soft/60";

/**
 * The /timeline toolbar: zoom, client, service line, health and "Show
 * closed", all in the URL (`?zoom&client&service&health&closed=1`).
 */
export function TimelineToolbar({ zoom, defaultZoom, client, service, health, closed, clients, className }: TimelineToolbarProps) {
  const { setParams } = useTimelineParams();
  const switchId = useId();
  const filtered = Boolean(client || service || health || closed);
  const unknownClient = client && !clients.some((item) => item.id === client);

  return (
    <div role="search" aria-label="Filter the timeline" className={cn("mb-4 flex flex-wrap items-center gap-2 sm:mb-5", className)}>
      <TimelineZoomControl zoom={zoom} defaultZoom={defaultZoom} className="w-full sm:w-auto" />

      <NativeSelect
        aria-label="Filter by client"
        value={client ?? ""}
        onChange={(event) => setParams({ client: event.target.value || null })}
        wrapperClassName="min-w-36 flex-1 sm:w-auto sm:flex-none"
        className={cn("sm:w-auto sm:max-w-56", client && ACTIVE_FILTER)}
      >
        <option value="">All clients</option>
        {clients.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} ({item.code})
          </option>
        ))}
        {unknownClient ? <option value={client}>Archived client</option> : null}
      </NativeSelect>

      <NativeSelect
        aria-label="Filter by service line"
        value={service ?? ""}
        onChange={(event) => setParams({ service: event.target.value || null })}
        wrapperClassName="min-w-36 flex-1 sm:w-auto sm:flex-none"
        className={cn("sm:w-auto", service && ACTIVE_FILTER)}
      >
        <option value="">Any service line</option>
        {SERVICE_LINE_ORDER.map((value) => (
          <option key={value} value={value}>
            {SERVICE_LINE_CONFIG[value].label}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        aria-label="Filter by health"
        value={health ?? ""}
        onChange={(event) => setParams({ health: event.target.value || null })}
        wrapperClassName="min-w-32 flex-1 sm:w-auto sm:flex-none"
        className={cn("sm:w-auto", health && ACTIVE_FILTER)}
      >
        <option value="">Any health</option>
        {RAG_ORDER.map((value) => (
          <option key={value} value={value}>
            {RAG_CONFIG[value].label}
          </option>
        ))}
        <option value="none">No update yet</option>
      </NativeSelect>

      <div className="flex h-9 items-center gap-2">
        <Switch id={switchId} checked={closed} onCheckedChange={(checked) => setParams({ closed: checked ? "1" : null })} />
        <label htmlFor={switchId} className="cursor-pointer select-none whitespace-nowrap text-sm text-fg">
          Show closed
        </label>
      </div>

      {filtered ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setParams({ client: null, service: null, health: null, closed: null })}
          className="sm:ml-auto"
        >
          <X aria-hidden />
          Clear filters
        </Button>
      ) : null}

      <SaveViewButton scope="timeline" className={cn(!filtered && "sm:ml-auto")} />
    </div>
  );
}
