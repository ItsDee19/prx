"use client";

import Link from "next/link";
import { RISK_SCALE } from "@/lib/constants";
import type { RagHealth, RiskHeatCell } from "@/lib/types";
import { cn, pluralize, riskSeverity } from "@/lib/utils";
import { impactLabel, likelihoodLabel, SEVERITY_LABELS } from "./risk-utils";

export interface RiskHeatmapProps {
  /** 25 cells (getRiskHeatmap): open/mitigating items by likelihood and impact. */
  cells: RiskHeatCell[];
  selected?: { likelihood: number; impact: number } | null;
  /**
   * Server callers: cells render as links to `${linkBase}&l=<likelihood>&i=<impact>`
   * (the selected cell links back to `linkBase`, clearing the filter).
   */
  linkBase?: string;
  /** Client callers: cells render as toggle buttons; null clears. */
  onSelect?: (cell: { likelihood: number; impact: number } | null) => void;
  className?: string;
}

/** Background per severity zone; stronger when the cell holds items. */
const ZONE: Record<RagHealth, { empty: string; filled: string }> = {
  green: { empty: "bg-success/[0.06]", filled: "bg-success/25 text-fg" },
  amber: { empty: "bg-warning/[0.08]", filled: "bg-warning/30 text-fg" },
  red: { empty: "bg-danger/[0.07]", filled: "bg-danger/30 text-fg" },
};

/**
 * 5 x 5 likelihood-by-impact grid (likelihood 5 at the top, impact 1 on the
 * left). Each cell shows its count over a tint for its score zone and is a
 * link or toggle button that filters the RAID list to that cell. Accessible
 * names spell out the coordinates, score, severity and count.
 */
export function RiskHeatmap({ cells, selected = null, linkBase, onSelect, className }: RiskHeatmapProps) {
  const byKey = new Map(cells.map((cell) => [`${cell.likelihood}:${cell.impact}`, cell.count]));
  const rows = [...RISK_SCALE].reverse();
  const total = cells.reduce((sum, cell) => sum + cell.count, 0);

  return (
    <div className={cn("min-w-0", className)}>
      <div
        role="group"
        aria-label={`Risk heat map: ${pluralize(total, "open item")} by likelihood and impact`}
        className="grid grid-cols-[1.25rem_auto_repeat(5,minmax(0,1fr))] gap-1"
      >
        <div
          aria-hidden
          className="row-span-5 flex items-center justify-center text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle [writing-mode:vertical-rl] rotate-180"
        >
          Likelihood
        </div>
        {rows.map((likelihood) => (
          <Row
            key={likelihood}
            likelihood={likelihood}
            byKey={byKey}
            selected={selected}
            linkBase={linkBase}
            onSelect={onSelect}
          />
        ))}
        <div aria-hidden />
        <div aria-hidden />
        {RISK_SCALE.map((impact) => (
          <div
            key={impact}
            aria-hidden
            title={impactLabel(impact)}
            className="pt-0.5 text-center text-[11px] tabular-nums text-fg-muted"
          >
            {impact}
          </div>
        ))}
        <div aria-hidden />
        <div aria-hidden />
        <div
          aria-hidden
          className="col-span-5 text-center text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle"
        >
          Impact
        </div>
      </div>
    </div>
  );
}

function Row({
  likelihood,
  byKey,
  selected,
  linkBase,
  onSelect,
}: {
  likelihood: number;
  byKey: Map<string, number>;
  selected: { likelihood: number; impact: number } | null;
  linkBase?: string;
  onSelect?: (cell: { likelihood: number; impact: number } | null) => void;
}) {
  return (
    <>
      <div
        aria-hidden
        title={likelihoodLabel(likelihood)}
        className="flex items-center justify-end pr-1 text-[11px] tabular-nums text-fg-muted"
      >
        {likelihood}
      </div>
      {RISK_SCALE.map((impact) => {
        const count = byKey.get(`${likelihood}:${impact}`) ?? 0;
        const score = likelihood * impact;
        const severity = riskSeverity(score) ?? "green";
        const isSelected = selected?.likelihood === likelihood && selected?.impact === impact;
        const label = `Likelihood ${likelihood} (${likelihoodLabel(likelihood)}), impact ${impact} (${impactLabel(impact)}), score ${score}, ${SEVERITY_LABELS[severity].toLowerCase()}: ${pluralize(count, "open item")}.${isSelected ? " Selected; activate to clear the filter." : " Activate to filter the list."}`;
        const cellClass = cn(
          "relative flex aspect-square min-h-10 items-center justify-center rounded-lg text-sm font-semibold tabular-nums",
          "transition-[transform,box-shadow,background-color] duration-150 ease-[var(--ease-out-quart)]",
          "hover:scale-[1.04] active:scale-[0.97] motion-reduce:hover:scale-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          count > 0 ? ZONE[severity].filled : cn(ZONE[severity].empty, "text-fg-subtle/70"),
          isSelected && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
        );
        const content = count > 0 ? count : <span aria-hidden className="text-xs font-normal">·</span>;

        if (linkBase !== undefined) {
          const href = isSelected ? linkBase : `${linkBase}&l=${likelihood}&i=${impact}`;
          return (
            <Link
              key={impact}
              href={href}
              scroll={false}
              aria-label={label}
              aria-current={isSelected ? "true" : undefined}
              className={cellClass}
            >
              {content}
            </Link>
          );
        }
        return (
          <button
            key={impact}
            type="button"
            aria-label={label}
            aria-pressed={isSelected}
            onClick={() => onSelect?.(isSelected ? null : { likelihood, impact })}
            className={cellClass}
          >
            {content}
          </button>
        );
      })}
    </>
  );
}
