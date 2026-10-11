import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "accent" | "blue" | "amber" | "danger" | "neutral";

const TONES: Record<StatTone, string> = {
  accent: "bg-accent-soft text-accent",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  danger: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300",
  neutral: "bg-surface-2 text-fg-muted",
};

export interface StatCardProps {
  label: string;
  value: number;
  caption: string;
  icon: LucideIcon;
  tone?: StatTone;
  className?: string;
}

/** A single dashboard metric: tinted icon square, big number, one-line caption. */
export function StatCard({ label, value, caption, icon: Icon, tone = "neutral", className }: StatCardProps) {
  const danger = tone === "danger";
  return (
    <Card className={cn("flex items-start gap-4 p-5", danger && "border-danger/30", className)}>
      <div
        className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", TONES[tone])}
      >
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg-muted">{label}</p>
        <p
          className={cn(
            "mt-1 text-2xl font-semibold leading-8 tabular-nums tracking-tight",
            danger ? "text-danger" : "text-fg",
          )}
        >
          {value}
        </p>
        <p className="mt-0.5 truncate text-xs text-fg-subtle">{caption}</p>
      </div>
    </Card>
  );
}
