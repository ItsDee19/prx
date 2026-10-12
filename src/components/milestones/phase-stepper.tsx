"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Ban, Check, Gavel } from "lucide-react";
import { ProgressRing, type ProgressRingTone } from "@/components/ui/progress-ring";
import { Stagger, StaggerItem, useReducedMotionPreference } from "@/components/motion";
import { MILESTONE_KIND_CONFIG, MILESTONE_STATUS_CONFIG, MOTION } from "@/lib/constants";
import type { MilestoneStatus, MilestoneWithMeta } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GateActionSlot } from "./gate-action-slot";
import { currentPhaseId, isMilestoneOverdue, phaseDateRange, phaseDateRangeLong } from "./milestone-utils";

export interface PhaseStepperProps {
  milestones: MilestoneWithMeta[];
  projectId: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Admin or project owner: renders the gate action for phases in gate review. */
  canDecideGate: boolean;
  /** Workspace today; marks open phases past their due date. */
  today?: string;
  className?: string;
}

const RING_TONE: Record<MilestoneStatus, ProgressRingTone> = {
  planned: "accent",
  active: "accent",
  gate_review: "warning",
  done: "success",
  stopped: "danger",
};

/** Share of the connector after a node that is filled: done = all, current = its progress. */
function connectorFill(milestone: MilestoneWithMeta): number {
  if (milestone.status === "done") return 1;
  if (milestone.status === "active" || milestone.status === "gate_review") {
    return Math.max(0, Math.min(1, milestone.progress / 100));
  }
  return 0;
}

/**
 * Amber conic ring around a phase that waits for its gate decision. It turns
 * with the design's `--anim-conic` (4s, via the registered `--angle`), which
 * is `none` when motion is reduced, leaving a static ring.
 */
const CONIC_RING_STYLE: CSSProperties = {
  background:
    "conic-gradient(from var(--angle, 0deg), var(--color-warning), transparent 35%, var(--color-warning) 60%, transparent 85%, var(--color-warning))",
  WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
  mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
  animation: "var(--anim-conic)",
};

/**
 * Connectors grow in with the first-mount stagger only (the last one starts
 * about 0.64s in and runs 600ms); afterwards their grow-in is switched off so
 * nodes React re-inserts after a reorder do not grow their connector again.
 * Progress changes still glide through the progress-fill transition.
 */
const CONNECTOR_ENTER_MS = 1400;

function Marker({ milestone, index }: { milestone: MilestoneWithMeta; index: number }) {
  const { status } = milestone;
  const point = milestone.kind === "milestone";
  const current = status === "active" || status === "gate_review";

  const tone =
    status === "done"
      ? "bg-success text-surface border-transparent"
      : status === "active"
        ? "bg-accent text-accent-fg border-transparent"
        : status === "gate_review"
          ? "bg-surface text-warning border-warning"
          : status === "stopped"
            ? "bg-danger/10 text-danger border-danger/40"
            : "bg-surface text-fg-muted border-dashed border-border-strong";

  const glyph =
    status === "done" ? (
      <Check className="size-3.5" strokeWidth={3} aria-hidden />
    ) : status === "gate_review" ? (
      <Gavel className="size-3.5" aria-hidden />
    ) : status === "stopped" ? (
      <Ban className="size-3.5" aria-hidden />
    ) : point ? null : (
      <span className="text-[11px] font-semibold tabular-nums leading-none">{index + 1}</span>
    );

  return (
    <span aria-hidden className="relative flex size-7 shrink-0 items-center justify-center">
      {/* Soft breathing halo behind the current phase (design's pulse-soft; still when motion is reduced). */}
      {status === "active" ? (
        <span
          className={cn(
            "absolute bg-accent/30 animate-pulse-soft",
            point ? "inset-1 rotate-45 rounded-[6px]" : "inset-0 rounded-full",
          )}
        />
      ) : null}
      {status === "gate_review" ? <span className="absolute -inset-1 rounded-full" style={CONIC_RING_STYLE} /> : null}
      <span
        className={cn(
          "relative flex items-center justify-center border-2",
          // Springy lift on hover and a press-in on click (no movement when motion is reduced).
          "transition-[background-color,border-color,color,scale] duration-(--dur-3) ease-spring",
          "group-hover/node:scale-110 group-active/node:scale-95 motion-reduce:transition-none motion-reduce:group-hover/node:scale-100",
          point ? "size-5 rotate-45 rounded-[5px]" : "size-7 rounded-full",
          tone,
          current &&
            status === "active" &&
            "shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-accent)_18%,transparent),0_0_18px_2px_color-mix(in_oklab,var(--color-accent)_40%,transparent)]",
        )}
      >
        <span className={cn("flex items-center justify-center", point && "-rotate-45")}>{glyph}</span>
      </span>
    </span>
  );
}

/**
 * The delivery phases of a project as a horizontal stepper (Audit → Pilot →
 * Integrate → Scale style). Each node shows a status marker, the name, its
 * dates and a mini progress ring; the current phase glows and pulses softly,
 * phases in gate review get a rotating amber ring, point milestones are
 * diamonds. The connectors fill up to the current phase. Scrolls sideways on
 * narrow screens. Arrow keys move between nodes; Enter or Space selects.
 */
export function PhaseStepper({
  milestones,
  projectId,
  selectedId = null,
  onSelect,
  canDecideGate,
  today,
  className,
}: PhaseStepperProps) {
  const reduced = useReducedMotionPreference();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLButtonElement | HTMLDivElement | null)[]>([]);
  const currentId = currentPhaseId(milestones);
  const anchorId = selectedId ?? currentId;
  const anchorIndex = Math.max(
    0,
    milestones.findIndex((milestone) => milestone.id === anchorId),
  );
  const [focusIndex, setFocusIndex] = useState(anchorIndex);
  const [connectorsEntered, setConnectorsEntered] = useState(false);
  const safeFocus = Math.min(focusIndex, Math.max(0, milestones.length - 1));
  const phaseTotal = milestones.filter((milestone) => milestone.kind === "phase").length;

  /** Scrolls the track (never the page) so node `index` sits in the middle when the track overflows. */
  const revealNode = useCallback((index: number, smooth: boolean) => {
    const scroller = scrollerRef.current;
    const node = nodeRefs.current[index];
    if (!scroller || !node || scroller.scrollWidth <= scroller.clientWidth) return;
    const track = scroller.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const offset = box.left - track.left + scroller.scrollLeft;
    const target = offset - (scroller.clientWidth - box.width) / 2;
    const max = scroller.scrollWidth - scroller.clientWidth;
    scroller.scrollTo({ left: Math.max(0, Math.min(target, max)), behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setConnectorsEntered(true), CONNECTOR_ENTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Keep the selected (or current) node in view inside the scrolling track.
  useEffect(() => {
    revealNode(anchorIndex, false);
  }, [anchorIndex, revealNode]);

  function moveFocus(next: number) {
    const index = Math.max(0, Math.min(milestones.length - 1, next));
    setFocusIndex(index);
    nodeRefs.current[index]?.focus({ preventScroll: true });
    revealNode(index, !reduced);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Only the nodes themselves rove; keys inside a gate action (or anything else) pass through.
    if (!onSelect || !nodeRefs.current.some((node) => node === event.target)) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        moveFocus(safeFocus + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        moveFocus(safeFocus - 1);
        break;
      case "Home":
        moveFocus(0);
        break;
      case "End":
        moveFocus(milestones.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  let phaseNumber = 0;

  // The track is the labelled group (Stagger renders the bare <ol>); the nodes' own labels carry
  // "phase n of N". Stagger reveals the nodes on first mount only, so nodes React moves after a
  // reorder (router.refresh behind the Manage dialog) never replay their entrance.
  return (
    <div
      ref={scrollerRef}
      role="group"
      aria-label="Delivery phases"
      onKeyDown={handleKeyDown}
      className={cn(
        // Bleeds to the card edges so the track can scroll edge to edge; the thin scrollbar shows
        // only for mouse users when phases overflow (touch screens swipe without one).
        "-mx-5 snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-px-5 px-5 pb-2 pt-1 pointer-coarse:scrollbar-none",
        className,
      )}
    >
      <Stagger as="ol" className="flex w-max min-w-full">
        {milestones.map((milestone, index) => {
          const isPhase = milestone.kind === "phase";
          if (isPhase) phaseNumber += 1;
          const last = index === milestones.length - 1;
          const selected = milestone.id === selectedId;
          const current = milestone.id === currentId;
          const overdue = isMilestoneOverdue(milestone, today);
          const dates = phaseDateRange(milestone);
          const status = MILESTONE_STATUS_CONFIG[milestone.status];
          const stagger = Math.min(index, MOTION.stagger.maxItems - 1) * MOTION.stagger.step;
          const label = [
            milestone.name,
            isPhase ? `phase ${phaseNumber} of ${phaseTotal}` : MILESTONE_KIND_CONFIG.milestone.label.toLowerCase(),
            status.label,
            current ? "current phase" : null,
            phaseDateRangeLong(milestone),
            overdue ? "overdue" : null,
            isPhase && milestone.task_count > 0
              ? `${milestone.task_done_count} of ${milestone.task_count} tasks done`
              : null,
          ]
            .filter(Boolean)
            .join(", ");

          const body = (
            <>
              <Marker milestone={milestone} index={phaseNumber - 1} />
              <span
                className={cn(
                  "mt-2.5 line-clamp-2 min-w-0 text-sm leading-5 [overflow-wrap:anywhere]",
                  selected || current ? "font-semibold text-fg" : "font-medium text-fg",
                )}
              >
                {milestone.name}
              </span>
              <span
                className={cn(
                  "mt-0.5 text-xs tabular-nums",
                  overdue ? "font-medium text-danger" : "text-fg-muted",
                )}
              >
                {dates ?? (isPhase ? "No dates" : "No date")}
              </span>
              {isPhase ? (
                <span className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted">
                  <ProgressRing
                    value={milestone.progress}
                    size={20}
                    strokeWidth={2.5}
                    tone={RING_TONE[milestone.status]}
                    label={`${milestone.name} progress`}
                  />
                  <span className="tabular-nums">
                    {milestone.task_count > 0
                      ? `${milestone.task_done_count}/${milestone.task_count} tasks`
                      : milestone.status === "done"
                        ? "Complete"
                        : "No tasks"}
                  </span>
                </span>
              ) : (
                <span className="mt-2 text-xs text-fg-subtle">{MILESTONE_KIND_CONFIG.milestone.label}</span>
              )}
            </>
          );

          const nodeClass = cn(
            "relative flex w-full flex-col items-start rounded-2xl p-2 pr-4 text-left outline-none",
            onSelect && "group/node",
            "transition-[background-color,box-shadow] duration-(--dur-2) ease-out-quart",
            "focus-visible:ring-2 focus-visible:ring-ring",
            selected ? "bg-surface-2 ring-1 ring-inset ring-border" : onSelect ? "hover:bg-surface-2/60" : null,
          );

          return (
            <StaggerItem
              key={milestone.id}
              as="li"
              className="relative flex min-w-[9.5rem] max-w-[16rem] flex-1 snap-start flex-col sm:min-w-[10.5rem]"
            >
              {!last ? (
                // Connector from this marker to the next one (24px marker centre + 6px gaps).
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-[2.625rem] right-[-0.125rem] top-[1.3125rem] h-0.5 overflow-hidden rounded-full bg-border"
                >
                  {/* scaleX only: grows in on first mount, glides when progress changes (design's progress-fill). */}
                  <span
                    className="progress-fill absolute inset-0 rounded-full bg-accent bg-grad-progress"
                    style={{
                      transform: `scaleX(${connectorFill(milestone)})`,
                      animationName: connectorsEntered ? "none" : undefined,
                      animationDelay: `${Math.round((0.15 + stagger * 2) * 1000)}ms`,
                    }}
                  />
                </span>
              ) : null}
              {onSelect ? (
                <button
                  ref={(element) => {
                    nodeRefs.current[index] = element;
                  }}
                  type="button"
                  tabIndex={index === safeFocus ? 0 : -1}
                  aria-pressed={selected}
                  aria-current={current ? "step" : undefined}
                  aria-label={label}
                  onFocus={() => setFocusIndex(index)}
                  onClick={() => onSelect(milestone.id)}
                  className={nodeClass}
                >
                  {body}
                </button>
              ) : (
                <div
                  ref={(element) => {
                    nodeRefs.current[index] = element;
                  }}
                  role="group"
                  aria-label={label}
                  aria-current={current ? "step" : undefined}
                  className={nodeClass}
                >
                  {body}
                </div>
              )}
              {canDecideGate && milestone.status === "gate_review" ? (
                <div className="px-2 pt-1">
                  <GateActionSlot milestone={milestone} projectId={projectId} />
                </div>
              ) : null}
            </StaggerItem>
          );
        })}
      </Stagger>
    </div>
  );
}
