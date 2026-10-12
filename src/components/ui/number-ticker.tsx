"use client";

import NumberFlow, { type Format } from "@number-flow/react";
import { useReducedMotionPreference } from "@/components/motion/use-motion-preference";
import { cn } from "@/lib/utils";

export interface NumberTickerProps {
  value: number;
  /** Intl.NumberFormat options (e.g. `{ style: "percent" }`, `{ maximumFractionDigits: 1 }`). */
  format?: Intl.NumberFormatOptions;
  /** BCP 47 locale; "en-IN" gives Indian digit grouping. Defaults to "en-US". */
  locale?: string;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/** NumberFlow supports standard and compact notation only; others fall back to standard. */
function toFlowFormat(format: Intl.NumberFormatOptions | undefined): Format | undefined {
  if (!format) return undefined;
  const { notation, ...rest } = format;
  return { ...rest, notation: notation === "compact" ? "compact" : notation ? "standard" : undefined };
}

/**
 * Animated KPI number (@number-flow/react): digits roll to the new value with
 * tabular figures. Follows the app's motion setting (Settings > Appearance):
 * with reduced motion the value changes without animation.
 */
export function NumberTicker({ value, format, locale = "en-US", prefix, suffix, className }: NumberTickerProps) {
  const reduced = useReducedMotionPreference();
  return (
    <NumberFlow
      value={value}
      format={toFlowFormat(format)}
      locales={locale}
      prefix={prefix}
      suffix={suffix}
      animated={!reduced}
      // The app-level preference already folds in the OS setting (and lets "Full" override it).
      respectMotionPreference={false}
      willChange={false}
      className={cn("tabular-nums", className)}
    />
  );
}
