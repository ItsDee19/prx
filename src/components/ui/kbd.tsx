"use client";

import { Fragment, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export interface KbdProps {
  /**
   * Space-separated sequence of chords; "+" joins keys pressed together.
   * "mod" is Cmd on macOS and Ctrl elsewhere: "mod+k", "g h", "shift+c", "?".
   */
  keys: string;
  className?: string;
}

interface KeyGlyph {
  /** What is printed on the key cap. */
  text: string;
  /** Spoken name when the printed text is a symbol. */
  spoken?: string;
}

const NAMED_KEYS: Record<string, { other: KeyGlyph; mac: KeyGlyph }> = {
  mod: { other: { text: "Ctrl" }, mac: { text: "⌘", spoken: "Command" } },
  ctrl: { other: { text: "Ctrl" }, mac: { text: "⌃", spoken: "Control" } },
  shift: { other: { text: "Shift" }, mac: { text: "⇧", spoken: "Shift" } },
  alt: { other: { text: "Alt" }, mac: { text: "⌥", spoken: "Option" } },
  enter: { other: { text: "Enter" }, mac: { text: "↵", spoken: "Return" } },
  escape: { other: { text: "Esc" }, mac: { text: "Esc" } },
  esc: { other: { text: "Esc" }, mac: { text: "Esc" } },
  backspace: { other: { text: "Backspace" }, mac: { text: "⌫", spoken: "Delete" } },
  tab: { other: { text: "Tab" }, mac: { text: "Tab" } },
  space: { other: { text: "Space" }, mac: { text: "Space" } },
  up: { other: { text: "↑", spoken: "Up arrow" }, mac: { text: "↑", spoken: "Up arrow" } },
  down: { other: { text: "↓", spoken: "Down arrow" }, mac: { text: "↓", spoken: "Down arrow" } },
  left: { other: { text: "←", spoken: "Left arrow" }, mac: { text: "←", spoken: "Left arrow" } },
  right: { other: { text: "→", spoken: "Right arrow" }, mac: { text: "→", spoken: "Right arrow" } },
};

function glyphFor(key: string, mac: boolean): KeyGlyph {
  const named = NAMED_KEYS[key.toLowerCase()];
  if (named) return mac ? named.mac : named.other;
  return { text: key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1) };
}

function detectMac(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const noopSubscribe = () => () => {};

/**
 * Keyboard shortcut hint. Renders "Ctrl" on the server and swaps to the macOS
 * glyphs (⌘ ⇧ ⌥) after hydration, so server and client markup always match.
 */
export function Kbd({ keys, className }: KbdProps) {
  const mac = useSyncExternalStore(noopSubscribe, detectMac, () => false);
  const steps = keys.trim().split(/\s+/).filter(Boolean);

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 align-middle", className)}>
      {steps.map((step, stepIndex) => {
        // "+" on its own (or "mod++") is the plus key itself, not a separator.
        const chord = step === "+" ? ["+"] : step.split(/\+(?!$)/);
        return (
          <Fragment key={`${step}-${stepIndex}`}>
            {stepIndex > 0 ? <span className="text-[11px] text-fg-muted">then</span> : null}
            <span className="inline-flex items-center gap-0.5">
              {chord.map((key, keyIndex) => {
                const glyph = glyphFor(key, mac);
                return (
                  <kbd
                    key={`${key}-${keyIndex}`}
                    className={cn(
                      "inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-border bg-raised px-1",
                      "font-mono text-[11px] font-medium leading-none text-fg-muted shadow-[inset_0_-1px_0_var(--border)]",
                    )}
                  >
                    {glyph.spoken ? (
                      <>
                        <span aria-hidden>{glyph.text}</span>
                        <span className="sr-only">{glyph.spoken}</span>
                      </>
                    ) : (
                      glyph.text
                    )}
                  </kbd>
                );
              })}
            </span>
          </Fragment>
        );
      })}
    </span>
  );
}
