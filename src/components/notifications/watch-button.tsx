"use client";

import { useEffect, useState, useTransition } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { unwatchAction, watchAction } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { MOTION } from "@/lib/constants";
import type { WatchEntity } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface WatchButtonProps {
  entity: WatchEntity;
  /** From `isWatching(viewer.id, entity)` on the server. */
  initialWatching: boolean;
  /** Icon-only (tooltip carries the label). Default: icon + "Watch" / "Watching". */
  iconOnly?: boolean;
  className?: string;
}

/**
 * Watch / Unwatch toggle for a project or task header. Optimistic; reverts
 * with a toast when the action fails. Unwatch silences notifications even for
 * owners, members and assignees.
 */
export function WatchButton({ entity, initialWatching, iconOnly = false, className }: WatchButtonProps) {
  const [watching, setWatching] = useState(initialWatching);
  const [pending, startTransition] = useTransition();
  const reduce = useReducedMotionConfig() === true;
  const noun = entity.type === "project" ? "project" : "task";

  // A server refresh (another tab, a new assignment) can change the truth.
  useEffect(() => setWatching(initialWatching), [initialWatching]);

  function toggle() {
    const next = !watching;
    setWatching(next);
    startTransition(async () => {
      const result = next ? await watchAction(entity) : await unwatchAction(entity);
      if (!result.ok) {
        setWatching(!next);
        toast.error(result.error);
        return;
      }
      setWatching(result.data);
      toast.success(
        result.data ? `Watching this ${noun}. You'll be notified about changes.` : `Stopped watching this ${noun}.`,
      );
    });
  }

  const Glyph = watching ? Eye : EyeOff;
  const label = watching ? "Watching" : "Watch";
  const hint = watching
    ? `You get notifications about this ${noun}. Click to stop.`
    : `Get notifications about comments and changes on this ${noun}.`;

  return (
    <Tooltip content={hint}>
      <Button
        variant={watching ? "secondary" : "outline"}
        size={iconOnly ? "icon" : "sm"}
        aria-pressed={watching}
        aria-label={iconOnly ? `${label}: ${noun}` : undefined}
        disabled={pending}
        onClick={toggle}
        className={cn(iconOnly && "size-8", className)}
      >
        <m.span
          key={watching ? "on" : "off"}
          aria-hidden
          className="inline-flex"
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduce ? { duration: 0 } : MOTION.spring}
        >
          <Glyph />
        </m.span>
        {iconOnly ? null : <span>{label}</span>}
      </Button>
    </Tooltip>
  );
}
