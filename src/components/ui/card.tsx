import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn("rounded-lg border border-border bg-surface", className)} {...props} />
  );
});

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pb-3 pt-5", className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold leading-5 text-fg", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-0.5 text-sm text-fg-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-b-lg border-t border-border bg-surface-2/50 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
