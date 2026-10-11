"use client";

import { forwardRef, type RefObject } from "react";

export interface HiddenTriggerProps {
  /** Receives focus whenever a dialog returns focus to this hidden trigger. */
  focusTarget: RefObject<HTMLElement | null>;
}

/**
 * A visually hidden, non-tabbable button used as the `trigger` of a trigger-driven
 * dialog (ProjectDialog) when the real control lives somewhere the trigger cannot:
 * inside a dropdown-menu item (unmounted on close) or behind a Tooltip wrapper.
 * The visible control calls `.click()` on it; focus is handed back to that control
 * when the dialog closes.
 */
export const HiddenTrigger = forwardRef<HTMLButtonElement, HiddenTriggerProps>(
  function HiddenTrigger({ focusTarget }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onFocus={() => focusTarget.current?.focus()}
      />
    );
  },
);
