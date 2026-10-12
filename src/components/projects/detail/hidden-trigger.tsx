"use client";

import { forwardRef, type ButtonHTMLAttributes, type RefObject } from "react";

export interface HiddenTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Receives focus whenever a dialog returns focus to this hidden trigger. */
  focusTarget: RefObject<HTMLElement | null>;
}

/**
 * A visually hidden, non-tabbable button used as the `trigger` of a trigger-driven
 * dialog (ProjectDialog) when the real control lives somewhere the trigger cannot:
 * inside a dropdown-menu item (unmounted on close) or behind a Tooltip wrapper.
 * The visible control calls `.click()` on it; focus is handed back to that control
 * when the dialog closes.
 *
 * The rest props must reach the DOM: `<DialogTrigger asChild>` passes its onClick (which
 * opens the dialog), data-state and aria-* attributes through Slot onto this component.
 */
export const HiddenTrigger = forwardRef<HTMLButtonElement, HiddenTriggerProps>(
  function HiddenTrigger({ focusTarget, onFocus, ...props }, ref) {
    return (
      <button
        {...props}
        ref={ref}
        type="button"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onFocus={(event) => {
          onFocus?.(event);
          focusTarget.current?.focus();
        }}
      />
    );
  },
);
