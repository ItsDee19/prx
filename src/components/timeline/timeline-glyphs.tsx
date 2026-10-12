import type { CSSProperties } from "react";
import { Flag } from "lucide-react";
import type { MilestoneStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/*
 * Small decorative shapes of the timeline (milestone diamond, gate post,
 * go-live flag, tuning hatch, today line). Server-safe; meaning is always
 * carried by text elsewhere (aria-label, tooltip, legend).
 */

/** Bar colour for a row, falling back to the accent. */
export function rowColor(color: string | null | undefined): string {
  return color && color.trim() ? color : "var(--accent)";
}

/** `color` mixed with transparency, e.g. tint("#0066cc", 18). */
export function tint(color: string, percent: number): string {
  return `color-mix(in oklch, ${color} ${percent}%, transparent)`;
}

/** The tuning window's hatched band. */
export const TUNING_STYLE: CSSProperties = {
  backgroundColor: tint("var(--accent-3)", 7),
  backgroundImage: `repeating-linear-gradient(135deg, ${tint("var(--accent-3)", 40)} 0 2px, transparent 2px 7px)`,
  borderColor: tint("var(--accent-3)", 50),
};

const DIAMOND_TONE: Record<MilestoneStatus, string> = {
  planned: "border-fg-muted bg-surface",
  active: "border-accent bg-surface",
  gate_review: "border-warning bg-warning/30",
  done: "border-success bg-success",
  stopped: "border-danger bg-danger/25",
};

export function MilestoneDiamond({
  status = "planned",
  color,
  className,
}: {
  status?: MilestoneStatus;
  /** Overrides the planned/active border colour (project colour). */
  color?: string;
  className?: string;
}) {
  const custom = color && (status === "planned" || status === "active") ? { borderColor: color } : undefined;
  return (
    <span aria-hidden className={cn("relative inline-flex size-3 items-center justify-center", className)}>
      {status === "gate_review" ? (
        <span className="absolute inset-[-3px] rotate-45 rounded-[3px] bg-warning/40 motion-safe:[animation:prx-pulse-soft_2s_ease-in-out_3]" />
      ) : null}
      <span className={cn("relative size-2.5 rotate-45 rounded-[2px] border-2", DIAMOND_TONE[status])} style={custom} />
    </span>
  );
}

const GATE_TONE: Record<MilestoneStatus, string> = {
  planned: "bg-fg-muted",
  active: "bg-fg-muted",
  gate_review: "bg-warning",
  done: "bg-success",
  stopped: "bg-danger",
};

/** A gate post: a thin bar with a square cap (amber while the gate is under review). */
export function GateGlyph({ status = "planned", className }: { status?: MilestoneStatus; className?: string }) {
  return (
    <span aria-hidden className={cn("relative inline-flex h-4 w-2.5 flex-col items-center", className)}>
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-[2px]",
          GATE_TONE[status],
          status === "gate_review" && "motion-safe:[animation:prx-pulse-soft_2s_ease-in-out_3]",
        )}
      />
      <span className={cn("w-0.5 flex-1 rounded-full", GATE_TONE[status])} />
    </span>
  );
}

export function GoLiveGlyph({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex items-center justify-center text-accent-2", className)}>
      <Flag className="size-3.5 fill-current" strokeWidth={2.25} />
    </span>
  );
}

export function TuningSwatch({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block h-3 w-5 rounded-[3px] border border-dashed", className)} style={TUNING_STYLE} />;
}

export function PhaseSwatch({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-3 w-5 overflow-hidden rounded-[3px] border", className)}
      style={{ backgroundColor: tint("var(--accent)", 30), borderColor: tint("var(--accent)", 70) }}
    />
  );
}

export function TodaySwatch({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-3.5 w-0.5 rounded-full bg-accent-3", className)}
      style={{ boxShadow: "0 0 6px var(--accent-3)" }}
    />
  );
}
