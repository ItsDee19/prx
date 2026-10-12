import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GateGlyph, GoLiveGlyph, MilestoneDiamond, PhaseSwatch, TodaySwatch, TuningSwatch } from "./timeline-glyphs";
import type { TimelineGridRow } from "./types";

export type LegendKind = "phase" | "milestone" | "gate" | "go_live" | "tuning" | "dependency" | "today";

const LEGEND: Record<LegendKind, { label: string; glyph: ReactNode }> = {
  phase: { label: "Phase", glyph: <PhaseSwatch /> },
  milestone: { label: "Milestone", glyph: <MilestoneDiamond status="active" /> },
  gate: { label: "Gate", glyph: <GateGlyph status="planned" /> },
  go_live: { label: "Go-live", glyph: <GoLiveGlyph /> },
  tuning: { label: "Tuning window", glyph: <TuningSwatch /> },
  dependency: {
    label: "Blocked by",
    glyph: (
      <svg aria-hidden width="20" height="12" viewBox="0 0 20 12" className="shrink-0 text-fg-subtle">
        <path d="M1 2 H8 V9 H15" fill="none" stroke="currentColor" strokeWidth="1.25" />
        <path d="M14 6 L19 9 L14 12 z" fill="currentColor" />
      </svg>
    ),
  },
  today: { label: "Today", glyph: <TodaySwatch /> },
};

const ORDER: LegendKind[] = ["phase", "milestone", "gate", "go_live", "tuning", "dependency", "today"];

/** The legend entries that the rows actually use (today always). */
export function legendKindsFor(rows: readonly TimelineGridRow[], hasDependencies: boolean): LegendKind[] {
  const used = new Set<LegendKind>(["today"]);
  for (const row of rows) {
    if (row.segments?.length) used.add("phase");
    if (row.tuning) used.add("tuning");
    for (const marker of row.markers ?? []) used.add(marker.kind);
  }
  if (hasDependencies) used.add("dependency");
  return ORDER.filter((kind) => used.has(kind));
}

/** A compact key for the timeline's shapes (each with its text label). */
export function TimelineLegend({ kinds, className }: { kinds: readonly LegendKind[]; className?: string }) {
  return (
    <ul aria-label="Legend" className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {kinds.map((kind) => (
        <li key={kind} className="flex items-center gap-1.5 text-xs text-fg-muted">
          <span className="flex h-4 w-5 items-center justify-center">{LEGEND[kind].glyph}</span>
          {LEGEND[kind].label}
        </li>
      ))}
    </ul>
  );
}
