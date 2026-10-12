/**
 * Pure helpers shared by the milestone components (server and client). No
 * React and no data access.
 */
import { GATE_DECISIONS, type GateDecision, type GateDecidedMeta, type MilestoneWithMeta } from "@/lib/types";
import { formatDate, isHttpUrl } from "@/lib/utils";

const SHORT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

/** "Oct 1" (deterministic, en-US). */
export function shortDate(date: string): string {
  return formatDate(date, SHORT);
}

/**
 * Compact date span for a phase: "Oct 1 – Nov 14", "Due Nov 14", "From Oct 1",
 * or null when the phase has no dates. Point milestones show their one date.
 */
export function phaseDateRange(milestone: Pick<MilestoneWithMeta, "kind" | "start_date" | "due_date">): string | null {
  const { start_date: start, due_date: due } = milestone;
  if (milestone.kind === "milestone") {
    const date = due ?? start;
    return date ? shortDate(date) : null;
  }
  if (start && due) return start === due ? shortDate(due) : `${shortDate(start)} – ${shortDate(due)}`;
  if (due) return `Due ${shortDate(due)}`;
  if (start) return `From ${shortDate(start)}`;
  return null;
}

/** Full, unambiguous version of phaseDateRange for titles and screen readers. */
export function phaseDateRangeLong(milestone: Pick<MilestoneWithMeta, "kind" | "start_date" | "due_date">): string {
  const { start_date: start, due_date: due } = milestone;
  if (milestone.kind === "milestone") {
    const date = due ?? start;
    return date ? formatDate(date) : "No date";
  }
  if (start && due) return `${formatDate(start)} to ${formatDate(due)}`;
  if (due) return `Due ${formatDate(due)}`;
  if (start) return `From ${formatDate(start)}`;
  return "No dates";
}

/** The current phase: the first phase (by position) that is active or in gate review. */
export function currentPhaseId(milestones: readonly MilestoneWithMeta[]): string | null {
  const current = milestones.find(
    (m) => m.kind === "phase" && (m.status === "active" || m.status === "gate_review"),
  );
  return current ? current.id : null;
}

/** What the phases card selects first: the current phase, else the next open item, else the first. */
export function defaultSelectedId(milestones: readonly MilestoneWithMeta[]): string | null {
  const current = currentPhaseId(milestones);
  if (current) return current;
  const open = milestones.find((m) => m.status === "planned");
  return open ? open.id : (milestones[0]?.id ?? null);
}

/** Done phases out of phases that still count (stopped phases excluded), as for progress_mode "milestones". */
export function phaseTally(milestones: readonly MilestoneWithMeta[]): { done: number; total: number } {
  const phases = milestones.filter((m) => m.kind === "phase" && m.status !== "stopped");
  return { done: phases.filter((m) => m.status === "done").length, total: phases.length };
}

/** An open phase or milestone whose due date is before workspace today. */
export function isMilestoneOverdue(
  milestone: Pick<MilestoneWithMeta, "status" | "due_date">,
  today: string | undefined,
): boolean {
  if (!today || !milestone.due_date) return false;
  if (milestone.status === "done" || milestone.status === "stopped") return false;
  return milestone.due_date < today;
}

/* ------------------------------ Gate history ----------------------------- */

export type ParsedGateDecision = Pick<
  GateDecidedMeta,
  "decision" | "extend_count" | "new_due_date" | "fix_list" | "signoff" | "evidence_url"
>;

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isGateDecision(value: unknown): value is GateDecision {
  return typeof value === "string" && (GATE_DECISIONS as readonly string[]).includes(value);
}

/**
 * Reads the fields of a `gate_decided` activity meta (GateDecidedMeta) without
 * trusting its shape. Returns null when the decision itself is missing.
 */
export function parseGateDecidedMeta(meta: Record<string, unknown>): ParsedGateDecision | null {
  if (!isGateDecision(meta.decision)) return null;
  const signoff =
    typeof meta.signoff === "object" && meta.signoff !== null ? (meta.signoff as Record<string, unknown>) : {};
  const evidence = textOrNull(meta.evidence_url);
  return {
    decision: meta.decision,
    extend_count: typeof meta.extend_count === "number" ? meta.extend_count : 0,
    new_due_date: textOrNull(meta.new_due_date),
    fix_list: textOrNull(meta.fix_list),
    signoff: { name: textOrNull(signoff.name), date: textOrNull(signoff.date) },
    evidence_url: evidence && isHttpUrl(evidence) ? evidence : null,
  };
}
