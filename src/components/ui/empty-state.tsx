import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Small decorative scene above an empty state: the icon on a lifted tile over a
 * patch of the Aurora grid and a soft glow. The tile breathes twice and then
 * rests (no endless loop); static with reduced motion.
 */
function EmptyIllustration({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div aria-hidden className="relative mb-4 flex h-20 w-32 items-center justify-center">
      <div
        className={cn(
          "absolute inset-0 bg-size-[16px_16px]",
          "bg-[linear-gradient(to_right,var(--grid-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-line)_1px,transparent_1px)]",
          "[mask-image:radial-gradient(ellipse_at_center,#000_20%,transparent_70%)]",
        )}
      />
      <div className="absolute size-20 rounded-full bg-[radial-gradient(circle,var(--glow-1),transparent_70%)]" />
      <div className="relative animate-float">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-surface text-accent shadow-card">
          <Icon className="size-5" />
        </div>
        <span className="absolute -right-1.5 -top-1.5 size-2.5 rounded-full border-2 border-surface bg-accent-2" />
      </div>
    </div>
  );
}

/** Empty list or section: illustration, a short title, a one-line description and an optional action. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "reveal-fade flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/40 px-4 py-10 text-center sm:px-6",
        className,
      )}
    >
      {icon ? <EmptyIllustration icon={icon} /> : null}
      <p className="text-sm font-semibold text-fg [overflow-wrap:anywhere]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-fg-muted text-pretty [overflow-wrap:anywhere]">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
