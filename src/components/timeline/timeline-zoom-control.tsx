"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { TIMELINE_ZOOMS, ZOOM_LABELS } from "./timeline-math";
import type { TimelineZoom } from "./types";
import { useTimelineParams } from "./use-timeline-params";

const OPTIONS = TIMELINE_ZOOMS.map((value) => ({ value, label: ZOOM_LABELS[value] }));

export interface TimelineZoomControlProps {
  zoom: TimelineZoom;
  /** The zoom used when `?zoom=` is absent (writing it removes the param). */
  defaultZoom: TimelineZoom;
  className?: string;
}

/** Week / Month / Quarter, kept in `?zoom=` (other params are preserved). */
export function TimelineZoomControl({ zoom, defaultZoom, className }: TimelineZoomControlProps) {
  const { setParams, isPending } = useTimelineParams();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <SegmentedControl
        ariaLabel="Zoom"
        value={zoom}
        onChange={(value) => setParams({ zoom: value === defaultZoom ? null : value })}
        options={OPTIONS}
        className="h-9 px-1"
      />
      {isPending ? <Spinner size="sm" className="text-fg-subtle" /> : null}
    </div>
  );
}
