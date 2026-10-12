"use client";

import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { AtSign } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/input";
import type { UserSummary } from "@/lib/types";
import { cn, mentionToken } from "@/lib/utils";

export interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  /** Active users offered after "@". */
  users: UserSummary[];
  /** Cmd/Ctrl+Enter. */
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  rows?: number;
  invalid?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  autoFocus?: boolean;
  maxLength?: number;
  className?: string;
}

/** People shown in the suggestion list at once. */
const MAX_SUGGESTIONS = 8;

/**
 * "@" at the start of the text or after whitespace / an opening bracket,
 * followed by up to two words, ending at the caret.
 */
const TRIGGER_PATTERN = /(?:^|[\s([{])@([^\s@[\]()]{0,40}(?: [^\s@[\]()]{0,40})?)$/u;

interface MentionQuery {
  /** Index of the "@" in the value. */
  start: number;
  /** Caret position (end of the query). */
  end: number;
  query: string;
}

function findQuery(value: string, caret: number): MentionQuery | null {
  const before = value.slice(0, caret);
  const match = TRIGGER_PATTERN.exec(before);
  if (!match) return null;
  const query = match[1];
  return { start: caret - query.length - 1, end: caret, query };
}

function rankUsers(users: UserSummary[], query: string): UserSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return users.slice(0, MAX_SUGGESTIONS);
  const scored: { user: UserSummary; score: number }[] = [];
  for (const user of users) {
    const name = user.name.toLowerCase();
    const email = user.email.toLowerCase();
    let score = -1;
    if (name.startsWith(needle)) score = 0;
    else if (name.split(/\s+/).some((part) => part.startsWith(needle))) score = 1;
    else if (email.startsWith(needle)) score = 2;
    else if (name.includes(needle)) score = 3;
    if (score >= 0) scored.push({ user, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.user.name.localeCompare(b.user.name))
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.user);
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

/**
 * Drop-in replacement for `Textarea` in comment composers. Typing "@" opens a
 * listbox of people under the field; arrow keys move, Enter or Tab inserts the
 * mention token (`@[Name](user:<id>)`), Escape closes. Focus never leaves the
 * textarea (it carries aria-activedescendant). Cmd/Ctrl+Enter calls `onSubmit`.
 */
export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(function MentionTextarea(
  {
    value,
    onChange,
    users,
    onSubmit,
    placeholder,
    disabled = false,
    id,
    rows = 3,
    invalid = false,
    "aria-label": ariaLabel,
    "aria-describedby": ariaDescribedBy,
    autoFocus,
    maxLength,
    className,
  },
  forwardedRef,
) {
  const baseId = useId();
  const listId = `${baseId}-mentions`;
  const hintId = `${baseId}-mention-hint`;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Escape closes the list for this "@"; typing elsewhere re-arms it.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const suggestions = useMemo(() => (mention ? rankUsers(users, mention.query) : []), [mention, users]);
  const open = mention !== null && suggestions.length > 0 && !disabled && dismissedAt !== mention.start;
  const safeActive = Math.min(activeIndex, Math.max(0, suggestions.length - 1));
  const optionId = (index: number) => `${baseId}-mention-${index}`;

  const setRefs = useCallback(
    (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  function sync(nextValue: string, caret: number | null) {
    const next = caret === null ? null : findQuery(nextValue, caret);
    if (mention?.start !== next?.start) setActiveIndex(0);
    setMention(next);
    if (next === null || (dismissedAt !== null && next.start !== dismissedAt)) setDismissedAt(null);
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
    sync(event.target.value, event.target.selectionStart === event.target.selectionEnd ? event.target.selectionStart : null);
  }

  function handleCaretMove() {
    const node = textareaRef.current;
    if (!node) return;
    sync(node.value, node.selectionStart === node.selectionEnd ? node.selectionStart : null);
  }

  function insert(user: UserSummary) {
    if (!mention) return;
    const token = `${mentionToken(user)} `;
    const next = value.slice(0, mention.start) + token + value.slice(mention.end);
    const caret = mention.start + token.length;
    onChange(next);
    setMention(null);
    setDismissedAt(null);
    window.requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(caret, caret);
    });
  }

  function highlight(index: number) {
    setActiveIndex(index);
    document.getElementById(optionId(index))?.scrollIntoView({ block: "nearest" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          highlight((safeActive + 1) % suggestions.length);
          return;
        case "ArrowUp":
          event.preventDefault();
          highlight((safeActive - 1 + suggestions.length) % suggestions.length);
          return;
        case "Enter":
        case "Tab":
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) break;
          event.preventDefault();
          insert(suggestions[safeActive]);
          return;
        case "Escape":
          event.preventDefault();
          // Keep the surrounding dialog or drawer open: this Escape only closes the list.
          event.stopPropagation();
          if (mention) setDismissedAt(mention.start);
          return;
        default:
          break;
      }
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && onSubmit) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(next) => (!next && mention ? setDismissedAt(mention.start) : undefined)}>
      <PopoverPrimitive.Anchor asChild>
        <div className="relative min-w-0">
          <Textarea
            ref={setRefs}
            id={id}
            rows={rows}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            invalid={invalid}
            autoFocus={autoFocus}
            maxLength={maxLength}
            aria-label={ariaLabel}
            aria-describedby={ariaDescribedBy ? `${ariaDescribedBy} ${hintId}` : hintId}
            aria-autocomplete="list"
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open ? optionId(safeActive) : undefined}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
                handleCaretMove();
              }
            }}
            onClick={handleCaretMove}
            onBlur={() => setMention(null)}
            className={className}
          />
          <span id={hintId} className="sr-only">
            Type @ to mention someone.
          </span>
          <span aria-live="polite" className="sr-only">
            {open
              ? `${suggestions.length} ${suggestions.length === 1 ? "person" : "people"} found. Use the up and down arrows to choose, Enter to insert.`
              : ""}
          </span>
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // The textarea is the anchor: pressing it must not count as "outside".
          onInteractOutside={(event) => {
            if (event.target instanceof Node && textareaRef.current?.contains(event.target)) event.preventDefault();
          }}
          className={cn(
            "z-50 w-64 rounded-[14px] border border-glass-border glass-panel p-1.5 text-fg shadow-pop outline-none",
            "max-h-(--radix-popover-content-available-height) max-w-[min(calc(100vw-1rem),var(--radix-popover-content-available-width,100vw))]",
            "overflow-y-auto overscroll-contain origin-(--radix-popover-content-transform-origin)",
            "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          )}
        >
          <p className="flex items-center gap-1.5 px-2 pb-1 pt-0.5 text-xs font-medium text-fg-muted">
            <AtSign aria-hidden className="size-3.5" />
            Mention someone
          </p>
          <ul id={listId} role="listbox" aria-label="People to mention" className="max-h-64 overflow-y-auto">
            {suggestions.map((user, index) => {
              const active = index === safeActive;
              return (
                <li
                  key={user.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={active}
                  onPointerMove={() => {
                    if (activeIndex !== index) setActiveIndex(index);
                  }}
                  // Keep focus (and the caret) in the textarea.
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => insert(user)}
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-sm",
                    "transition-colors duration-(--dur-1) pointer-coarse:py-2.5",
                    active && "bg-surface-2",
                  )}
                >
                  <UserAvatar user={user} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium leading-5">{user.name}</span>
                    <span className="block truncate text-xs leading-4 text-fg-muted">{user.job_title ?? user.email}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
});
