import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTROL_CLASS } from "./input";

export interface NativeSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  /** Classes for the outer wrapper (use this for width/margin). */
  wrapperClassName?: string;
}

/** A styled native <select> with a chevron overlay. `className` applies to the <select>. */
export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(function NativeSelect(
  { invalid = false, className, wrapperClassName, children, ...props },
  ref,
) {
  return (
    <span className={cn("relative block min-w-0", wrapperClassName)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL_CLASS, "h-9 cursor-pointer appearance-none pl-3 pr-8", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
      />
    </span>
  );
});
