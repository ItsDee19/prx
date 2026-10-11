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

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-surface-2 text-fg-muted">
          <Icon className="size-5" aria-hidden />
        </div>
      ) : null}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
