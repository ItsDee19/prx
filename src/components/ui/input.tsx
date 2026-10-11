import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Shared look for text-like form controls (also used by NativeSelect). */
export const CONTROL_CLASS =
  "w-full rounded-md border border-border bg-surface text-sm text-fg " +
  "placeholder:text-fg-subtle transition-[border-color,box-shadow] duration-150 outline-none " +
  "hover:border-border-strong " +
  "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 " +
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border " +
  "aria-invalid:border-danger aria-invalid:hover:border-danger " +
  "aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:ring-danger/30";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Marks the field as invalid (danger border + ring) and sets aria-invalid. */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, type = "text", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_CLASS,
        "h-9 px-3 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL_CLASS, "min-h-20 resize-y px-3 py-2 leading-5", className)}
      {...props}
    />
  );
});
