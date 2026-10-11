import type { ReactNode } from "react";
import type { BadgeTone } from "@/lib/constants";
import { cn } from "@/lib/utils";

/* Each tone carries its own light + dark classes (the one place `dark:` is used per tone). */
const TONES: Record<BadgeTone, string> = {
  neutral:
    "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-300 dark:ring-zinc-400/30",
  slate:
    "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/30",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/30",
  amber:
    "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30",
  green:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30",
  violet:
    "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/30",
  orange:
    "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/30",
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** Prefix the label with a small dot (tone text colour unless `dotClassName` is given). */
  dot?: boolean;
  dotClassName?: string;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", dot = false, dotClassName, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 text-xs font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full bg-current", dotClassName)} />
      ) : null}
      {children}
    </span>
  );
}
