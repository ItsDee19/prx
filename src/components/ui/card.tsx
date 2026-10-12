import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Content card: solid surface, 1px border, card shadow, 16px radius (never glass). */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn("min-w-0 rounded-2xl border border-border bg-surface shadow-card", className)}
      {...props}
    />
  );
});

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pb-3 pt-5", className)} {...props} />
  );
}

/** Section title: 16/24 semibold per the type scale; pass `className` for a smaller variant. */
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-base font-semibold leading-6 tracking-[-0.011em] text-fg [overflow-wrap:anywhere]",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-0.5 text-sm text-fg-muted [overflow-wrap:anywhere]", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-border bg-surface-2/50 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
