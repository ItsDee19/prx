import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...props }, ref) {
    return (
      <label
        ref={ref}
        className={cn("block select-none text-sm font-medium leading-5 text-fg", className)}
        {...props}
      />
    );
  },
);
