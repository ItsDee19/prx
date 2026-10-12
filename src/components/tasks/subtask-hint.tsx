import { CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SubtaskHintProps {
  /** The parent's key ("PRX-12"); without it the hint just says "Subtask". */
  parentKey?: string | null;
  className?: string;
}

/** "Subtask of PRX-n" marker for lists and boards that mix subtasks with top-level tasks. */
export function SubtaskHint({ parentKey, className }: SubtaskHintProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1 text-[11px] text-fg-muted", className)}>
      <CornerDownRight aria-hidden className="size-3 shrink-0 text-fg-subtle" />
      <span className="truncate">
        {parentKey ? (
          <>
            Subtask of <span className="font-mono text-fg-subtle">{parentKey}</span>
          </>
        ) : (
          "Subtask"
        )}
      </span>
    </span>
  );
}
