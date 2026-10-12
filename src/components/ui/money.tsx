import { currenciesWithValue, formatMoney } from "@/lib/money";
import type { Currency, CurrencyTotals } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface MoneyProps {
  /** Whole units of `currency`; null renders "—". */
  amount: number | null;
  currency: Currency;
  /** "₹12.3L" / "$45K" style; the full amount is kept in the tooltip title. */
  compact?: boolean;
  className?: string;
}

/** One amount in its currency, with tabular figures. Server-safe. */
export function Money({ amount, currency, compact = false, className }: MoneyProps) {
  const text = formatMoney(amount, currency, { compact });
  const full = compact && amount !== null ? formatMoney(amount, currency) : null;
  return (
    <span
      title={full && full !== text ? full : undefined}
      className={cn("whitespace-nowrap tabular-nums", className)}
    >
      {text}
      {full && full !== text ? <span className="sr-only"> ({full})</span> : null}
    </span>
  );
}

export interface MoneyTotalsProps {
  totals: CurrencyTotals;
  compact?: boolean;
  className?: string;
}

/**
 * Per-currency totals side by side ("₹15,00,000 · $45,000"). INR and USD are
 * never added together; currencies with a zero total are left out and "—"
 * shows when every total is zero.
 */
export function MoneyTotals({ totals, compact = false, className }: MoneyTotalsProps) {
  const present = currenciesWithValue(totals);
  if (present.length === 0) {
    return <span className={cn("tabular-nums text-fg-muted", className)}>—</span>;
  }
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5", className)}>
      {present.map((currency, index) => (
        <span key={currency} className="inline-flex items-baseline gap-x-1.5">
          {index > 0 ? (
            <span aria-hidden className="text-fg-subtle">
              ·
            </span>
          ) : null}
          <Money amount={totals[currency]} currency={currency} compact={compact} />
        </span>
      ))}
    </span>
  );
}
