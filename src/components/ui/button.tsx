import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

/*
 * Pill-shaped (an AvlysAI cue). Press: scale 0.97 over 100ms; hover deepens
 * the shadow or tint, it never moves the button. Focus: 2px ring, 2px offset.
 */
const BASE =
  "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full font-medium " +
  "transition-control outline-none active:scale-[0.97] " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 " +
  /*
   * Touch screens: an invisible, centred hit area of at least 40x40px (the
   * button itself or larger), so compact and icon-only buttons stay easy to tap
   * without changing how anything looks. Mouse/trackpad pointers are unaffected.
   */
  "pointer-coarse:after:absolute pointer-coarse:after:left-1/2 pointer-coarse:after:top-1/2 " +
  "pointer-coarse:after:size-full pointer-coarse:after:min-h-10 pointer-coarse:after:min-w-10 " +
  "pointer-coarse:after:-translate-1/2";

const VARIANTS: Record<ButtonVariant, string> = {
  // A 1px brand-gradient sheen along the top edge; a soft accent glow on hover.
  primary:
    "bg-accent text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(0_0_0/0.12)] hover:bg-accent-hover hover:shadow-glow " +
    "before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:rounded-full before:bg-grad-brand before:opacity-80",
  secondary: "bg-surface-2 text-fg hover:bg-border",
  outline:
    "border border-border bg-surface text-fg shadow-card hover:border-border-strong hover:bg-surface-2",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger:
    "bg-danger text-danger-fg shadow-[0_1px_2px_rgb(0_0_0/0.12)] hover:bg-danger/90 hover:shadow-[0_6px_20px_-6px_color-mix(in_oklch,var(--danger)_55%,transparent)]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-9 gap-2 px-4 text-sm",
  lg: "h-10 gap-2 px-5 text-sm",
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
      // Lets layouts tell icon-only buttons apart (e.g. PageHeader grows text buttons on phones).
      data-size={size}
      className={buttonVariants({ variant, size, className })}
      {...props}
    >
      {loading ? <Spinner size={size === "sm" ? "sm" : "md"} /> : null}
      {/* An icon-only button has no room for both the spinner and its icon. */}
      {loading && size === "icon" ? null : children}
    </button>
  );
});
