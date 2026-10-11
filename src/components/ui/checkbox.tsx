import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Styled native checkbox; the check mark comes from the `--checkbox-icon` token in globals.css. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "peer size-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-border-strong bg-surface",
        "bg-center bg-no-repeat transition-colors duration-150 outline-none",
        "hover:border-fg-subtle",
        "checked:border-accent checked:bg-accent checked:bg-(image:--checkbox-icon)",
        "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
