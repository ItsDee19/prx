import { Fragment } from "react";
import { cn, splitMentions } from "@/lib/utils";

export interface MentionTextProps {
  /** Comment body with inline `@[Name](user:<id>)` tokens. */
  body: string;
  className?: string;
}

/**
 * Renders a comment body with mentions as accent chips. Plain text keeps its
 * whitespace when the parent uses `whitespace-pre-wrap`. Server-safe.
 */
export function MentionText({ body, className }: MentionTextProps) {
  const segments = splitMentions(body);
  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.type === "text" ? (
          <Fragment key={index}>{segment.text}</Fragment>
        ) : (
          <span
            key={index}
            data-user-id={segment.userId}
            className={cn(
              "inline-flex items-baseline rounded-full bg-accent-soft px-1.5 font-medium text-accent-soft-fg",
              "[overflow-wrap:normal] whitespace-nowrap",
            )}
          >
            @{segment.name}
          </span>
        ),
      )}
    </span>
  );
}
