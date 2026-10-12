import { cn } from "@/lib/utils";

/**
 * Loading placeholder with a shimmer sliding across (translateX, 1.4s);
 * static when motion is reduced. Size and shape come from `className`.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}
