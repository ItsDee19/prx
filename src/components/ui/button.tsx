import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const BASE =
  "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-medium " +
  "transition-colors duration-150 outline-none " +
  "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "bg-surface-2 text-fg hover:bg-border",
  outline: "border border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white hover:bg-danger/90",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-[13px]",
  md: "h-9 gap-2 px-3.5 text-sm",
  lg: "h-10 gap-2 rounded-lg px-4 text-sm",
  icon: "size-9",
};

export interface ButtonVariantOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/** Class string for button-looking elements (e.g. a `Link` styled as a button). */
export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: ButtonVariantOptions = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button while an async action runs. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    type = "button",
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading ? "" : undefined}
      className={buttonVariants({ variant, size, className })}
      {...props}
    >
      {loading ? <Spinner size={size === "sm" ? "sm" : "md"} /> : null}
      {/* An icon-only button has no room for both the spinner and its icon. */}
      {loading && size === "icon" ? null : children}
    </button>
  );
});
