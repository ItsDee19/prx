import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared look for text-like form controls (also used by NativeSelect):
 * 10px radius, the input-border token (3:1 against the surface), an accent
 * ring on focus. 16px text on phones (iOS Safari zooms into any focused field
 * under 16px), the denser 14px from `sm` up.
 */
export const CONTROL_CLASS =
  "w-full min-w-0 rounded-[10px] border border-input-border bg-surface text-base text-fg shadow-[inset_0_1px_1px_rgb(0_0_0/0.03)] sm:text-sm " +
  "placeholder:text-fg-subtle transition-[border-color,box-shadow,background-color] duration-(--dur-2) ease-out-quart outline-none " +
  "hover:border-fg-muted " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 " +
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60 disabled:hover:border-input-border " +
  "aria-invalid:border-danger aria-invalid:hover:border-danger " +
  "aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:ring-danger/25";

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
      className={cn(CONTROL_CLASS, "min-h-20 resize-y px-3 py-2 leading-6 sm:leading-5", className)}
      {...props}
    />
  );
});
