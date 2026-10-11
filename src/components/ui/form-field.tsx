import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

export interface FormFieldProps {
  label: ReactNode;
  /** id of the control inside; the hint/error ids are derived from it. */
  htmlFor: string;
  error?: string | null;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Label + control + hint + error. Consumers may point the control at
 * `${htmlFor}-hint` / `${htmlFor}-error` through aria-describedby.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
