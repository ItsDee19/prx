import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Styled native checkbox; the check mark comes from the `--checkbox-icon` token in globals.css.
 *
 * On coarse pointers it grows to 20px and an invisible `::after` (11px past
 * the 18px padding box) extends the hit area to 40px; Chromium and WebKit
 * render pseudo-elements on `appearance: none` inputs. Firefox does not, so
 * callers should wrap the checkbox in a `<label>` that also covers its text,
 * padded with `pointer-coarse:min-h-10 pointer-coarse:min-w-10` where there
 * is no text.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "peer relative size-4 shrink-0 cursor-pointer appearance-none rounded-[5px] border border-input-border bg-surface",
        "pointer-coarse:size-5 pointer-coarse:after:absolute pointer-coarse:after:-inset-[11px] pointer-coarse:after:content-['']",
        "bg-center bg-no-repeat transition-control outline-none active:scale-90",
        "hover:border-fg-muted",
        "checked:border-accent checked:bg-accent checked:bg-(image:--checkbox-icon) checked:hover:border-accent-hover checked:hover:bg-accent-hover",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
