"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { AnimatePresence, useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { toggleFavoriteAction } from "@/actions/views";
import { Tooltip } from "@/components/ui/tooltip";
import { MOTION } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface FavoriteToggleProps {
  projectId: string;
  /** From `isFavorite(viewer.id, project.id)` / `listFavoriteProjectIds` on the server. */
  initial: boolean;
  /** "sm" = 28px (cards and rows), "md" = 36px (headers). Touch screens always get a 40px hit area. */
  size?: "sm" | "md";
  /** Project name for the accessible label ("Add Hospital Voice Agent to favourites"). */
  projectName?: string;
  className?: string;
}

/** A pop with a little more bounce than the default spring (a deliberate micro-interaction). */
const POP_SPRING = { ...MOTION.spring, bounce: 0.45 } as const;

/**
 * Star toggle that pins a project to the sidebar Favourites. Optimistic,
 * reverts with a toast on failure. Starring pops the star with a spring and
 * a soft ring burst (static when motion is reduced). Safe inside a card link:
 * clicks never navigate.
 */
export function FavoriteToggle({ projectId, initial, size = "sm", projectName, className }: FavoriteToggleProps) {
  const [starred, setStarred] = useState(initial);
  const [burst, setBurst] = useState(0);
  const [pending, startTransition] = useTransition();
  const reduce = useReducedMotionConfig() === true;
  // A server refresh (another tab, the sidebar menu) can change the truth.
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setStarred(initial);
  }

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;
    const next = !starred;
    setStarred(next);
    if (next) setBurst((value) => value + 1);
    startTransition(async () => {
      const result = await toggleFavoriteAction(projectId);
      if (!result.ok) {
        setStarred(!next);
        toast.error(result.error);
        return;
      }
      setStarred(result.data);
      toast.success(result.data ? "Added to favourites. It's pinned in the sidebar." : "Removed from favourites.", {
        duration: 2000,
      });
    });
  }

  const subject = projectName ? `${projectName} ` : "";
  const label = starred ? `Remove ${subject}from favourites` : `Add ${subject}to favourites`;

  return (
    <Tooltip content={starred ? "Remove from favourites" : "Add to favourites"}>
      <button
        type="button"
        aria-pressed={starred}
        aria-label={label}
        onClick={toggle}
        // Inside a draggable card (project board): the star never starts a drag.
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") event.stopPropagation();
        }}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-full outline-none",
          "transition-[background-color,color] duration-(--dur-2) ease-out-quart active:scale-[0.92]",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          "pointer-coarse:after:absolute pointer-coarse:after:left-1/2 pointer-coarse:after:top-1/2 pointer-coarse:after:size-10 pointer-coarse:after:-translate-1/2",
          size === "md" ? "size-9" : "size-7",
          starred ? "text-amber-500 hover:bg-amber-500/12" : "text-fg-subtle hover:bg-fg/[0.06] hover:text-fg-muted",
          className,
        )}
      >
        <AnimatePresence>
          {burst > 0 && starred && !reduce ? (
            <m.span
              key={burst}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-amber-400/70"
              initial={{ scale: 0.5, opacity: 0.9 }}
              animate={{ scale: 1.5, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: MOTION.ease.outQuart }}
            />
          ) : null}
        </AnimatePresence>
        <m.span
          key={starred ? "on" : "off"}
          aria-hidden
          className="inline-flex"
          initial={reduce ? false : starred ? { scale: 0.4, rotate: -30 } : { scale: 0.8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={reduce ? { duration: 0 } : starred ? POP_SPRING : MOTION.spring}
        >
          <Star className={cn(size === "md" ? "size-[18px]" : "size-4", starred && "fill-current")} />
        </m.span>
      </button>
    </Tooltip>
  );
}
