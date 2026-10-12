import type { CSSProperties } from "react";
import type { TemplatePayload } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";

export interface PhaseStripProps {
  payload: TemplatePayload;
  /** Show the phase names as chips under the strip (at most `maxChips`, then "+N"). */
  showChips?: boolean;
  maxChips?: number;
  className?: string;
}

/** Phase fills cycle through the brand accents; the tuning window is hatched. */
const FILLS = ["bg-accent", "bg-accent-2", "bg-accent-3"] as const;

const HATCH: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, color-mix(in oklch, var(--accent-3) 55%, transparent) 0 3px, transparent 3px 6px)",
};

function phaseText(payload: TemplatePayload): string {
  if (payload.milestones.length === 0) return "No phases.";
  return payload.milestones
    .map((milestone) =>
      milestone.kind === "milestone"
        ? `${milestone.name} (milestone)`
        : `${milestone.name}, ${pluralize(Math.max(milestone.duration_days, 1), "day")}${milestone.requires_gate ? ", gated" : ""}${milestone.is_tuning ? ", tuning" : ""}`,
    )
    .join("; ");
}

/**
 * The template's plan as a proportional strip: one segment per phase placed
 * by its day offset and length (tuning hatched, a tick at each go/no-go
 * gate), point milestones as diamonds. Segments grow in on first paint
 * (static with reduced motion). Screen readers get the phase list as text.
 */
export function PhaseStrip({ payload, showChips = false, maxChips = 4, className }: PhaseStripProps) {
  const total = Math.max(
    1,
    payload.milestones.reduce((max, milestone) => Math.max(max, milestone.offset_days + Math.max(milestone.duration_days, 1)), 0),
  );
  const phases = payload.milestones.filter((milestone) => milestone.kind === "phase");
  const points = payload.milestones.filter((milestone) => milestone.kind === "milestone");
  const chips = payload.milestones.slice(0, maxChips);
  const hidden = payload.milestones.length - chips.length;

  return (
    <span className={cn("block min-w-0", className)}>
      <span className="sr-only">Phases: {phaseText(payload)}</span>
      <span aria-hidden className="relative block h-2 w-full rounded-full bg-surface-2">
        {phases.map((milestone, index) => {
          const left = (milestone.offset_days / total) * 100;
          const width = (Math.max(milestone.duration_days, 1) / total) * 100;
          return (
            <span
              key={`${milestone.key}-${index}`}
              className={cn(
                "progress-fill absolute inset-y-0 rounded-full ring-1 ring-inset ring-surface",
                milestone.is_tuning ? "bg-accent-3/15" : FILLS[index % FILLS.length],
              )}
              style={{
                left: `${left}%`,
                width: `max(${width}%, 4px)`,
                animationDelay: `${Math.min(index, 7) * 35}ms`,
                ...(milestone.is_tuning ? HATCH : {}),
              }}
            >
              {milestone.requires_gate ? (
                <span className="absolute -right-px top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-fg" />
              ) : null}
            </span>
          );
        })}
        {points.map((milestone, index) => (
          <span
            key={`${milestone.key}-point-${index}`}
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2 border-surface bg-fg"
            style={{ left: `${(milestone.offset_days / total) * 100}%` }}
          />
        ))}
      </span>
      {showChips && chips.length > 0 ? (
        <span aria-hidden className="mt-2 flex min-w-0 flex-wrap gap-1">
          {chips.map((milestone, index) => (
            <span
              key={`${milestone.key}-chip-${index}`}
              className="inline-flex h-5 max-w-full items-center gap-1 truncate rounded-full bg-surface-2 px-2 text-[11px] font-medium text-fg-muted"
            >
              {milestone.kind === "milestone" ? (
                <span className="size-1.5 shrink-0 rotate-45 rounded-[1px] bg-fg-muted" />
              ) : (
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    milestone.is_tuning ? "bg-accent-3" : FILLS[phases.indexOf(milestone) % FILLS.length],
                  )}
                />
              )}
              <span className="truncate">{milestone.name}</span>
            </span>
          ))}
          {hidden > 0 ? (
            <span className="inline-flex h-5 items-center rounded-full bg-surface-2 px-2 text-[11px] font-medium tabular-nums text-fg-muted">
              +{hidden}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
