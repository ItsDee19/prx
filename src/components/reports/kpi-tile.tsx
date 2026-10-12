import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { currencySymbol } from "@/lib/money";
import type { Currency } from "@/lib/types";
import { cn } from "@/lib/utils";

export type KpiValue =
  | { kind: "count"; value: number }
  | { kind: "percent"; value: number | null }
  | { kind: "hours"; minutes: number }
  | { kind: "money"; amount: number; currency: Currency };

export interface KpiTileProps {
  label: string;
  value: KpiValue;
  icon: LucideIcon;
  /** One short line under the number. */
  hint?: ReactNode;
  tone?: "accent" | "success" | "warning" | "danger" | "neutral";
  className?: string;
}

const TONE: Record<NonNullable<KpiTileProps["tone"]>, string> = {
  accent: "bg-accent-soft text-accent-soft-fg",
  success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning",
  danger: "bg-danger/12 text-danger",
  neutral: "bg-surface-2 text-fg-muted",
};

function KpiNumber({ value }: { value: KpiValue }) {
  switch (value.kind) {
    case "count":
      return <NumberTicker value={value.value} />;
    case "percent":
      return value.value === null ? <span className="text-fg-muted">—</span> : <NumberTicker value={value.value} suffix="%" />;
    case "hours":
      return <NumberTicker value={Math.round(value.minutes / 6) / 10} format={{ maximumFractionDigits: 1 }} suffix="h" />;
    case "money":
      return (
        <NumberTicker
          value={value.amount}
          locale={value.currency === "INR" ? "en-IN" : "en-US"}
          format={{ maximumFractionDigits: 0 }}
          prefix={currencySymbol(value.currency)}
        />
      );
  }
}

/** KPI tile: icon chip, label, rolling number (NumberTicker; jumps with reduced motion) and a hint. */
export function KpiTile({ label, value, icon: Icon, hint, tone = "accent", className }: KpiTileProps) {
  return (
    <div className={cn("flex min-w-0 flex-col rounded-[20px] border border-border bg-surface p-4 shadow-card sm:p-5", className)}>
      <div className="flex items-center gap-2">
        <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", TONE[tone])}>
          <Icon className="size-4" />
        </span>
        <p className="min-w-0 truncate text-sm font-medium text-fg-muted">{label}</p>
      </div>
      <p className="mt-3 text-[30px] font-semibold leading-9 tracking-[-0.02em] text-fg tabular-nums">
        <KpiNumber value={value} />
      </p>
      {hint ? <p className="mt-1 text-xs text-fg-muted [overflow-wrap:anywhere]">{hint}</p> : null}
    </div>
  );
}
