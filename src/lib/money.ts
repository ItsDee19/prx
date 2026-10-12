/**
 * Money formatting and per-currency totals. Pure.
 *
 * Rules (SPEC.md section 23):
 * - Amounts are whole currency units (INTEGER in the database): no paise/cents.
 * - Every amount travels with its currency. INR and USD are never added
 *   together: totals are CurrencyTotals (one number per currency), and the UI
 *   shows them side by side.
 * - The only cross-currency maths is the APPROXIMATE margin, which converts
 *   USD with the admin-set app_settings.usd_inr_rate (toInr) and is labelled
 *   approximate wherever it is shown.
 * - INR uses en-IN grouping (12,34,567), USD en-US (1,234,567).
 * - Output is deterministic (symbol + grouped digits, hand-rolled compact
 *   suffixes) so server-rendered and hydrated text always match. Intl's
 *   compact notation is avoided: CLDR en-IN gives "₹45T" for 45,000 and its
 *   output differs between ICU versions.
 */
import { CURRENCY_CONFIG, CURRENCY_ORDER, MAX_MONEY } from "./constants";
import { CURRENCIES, type Currency, type CurrencyTotals } from "./types";

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

export function currencySymbol(currency: Currency): string {
  return CURRENCY_CONFIG[currency].symbol;
}

export interface FormatMoneyOptions {
  /** "₹12.3L", "₹2.5Cr", "$1.2M" style (amounts below 1L / 1K stay in full). */
  compact?: boolean;
  /** Append the ISO code: "₹12,00,000 INR". */
  withCode?: boolean;
}

/** Compact tiers, largest first: divide by `size` and append `suffix`. */
const COMPACT_TIERS: Record<Currency, { size: number; suffix: string }[]> = {
  INR: [
    { size: 10_000_000, suffix: "Cr" },
    { size: 100_000, suffix: "L" },
  ],
  USD: [
    { size: 1_000_000_000, suffix: "B" },
    { size: 1_000_000, suffix: "M" },
    { size: 1_000, suffix: "K" },
  ],
};

function groupDigits(value: number, currency: Currency, maximumFractionDigits: number): string {
  return new Intl.NumberFormat(CURRENCY_CONFIG[currency].locale, {
    maximumFractionDigits,
    minimumFractionDigits: 0,
    useGrouping: true,
  }).format(value);
}

/** Unsigned compact body such as "12.3L" or "10,000Cr"; null when the amount stays in full. */
function compactBody(abs: number, currency: Currency): string | null {
  const tiers = COMPACT_TIERS[currency];
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (abs < tier.size) continue;
    const scaled = Math.round((abs / tier.size) * 10) / 10;
    // Rounding up to the next tier's size (e.g. 99.95L) promotes it: "1Cr", not "100L".
    const bigger = tiers[i - 1];
    if (bigger && scaled * tier.size >= bigger.size) {
      return `${groupDigits(Math.round((abs / bigger.size) * 10) / 10, currency, 1)}${bigger.suffix}`;
    }
    return `${groupDigits(scaled, currency, 1)}${tier.suffix}`;
  }
  return null;
}

/**
 * "₹12,34,567" / "$1,234,567"; compact "₹12.3L" / "₹2.5Cr" / "$45K"; "—" for
 * null/undefined. Negative amounts (approximate margin) get a leading "-".
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: Currency,
  options: FormatMoneyOptions = {},
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  const whole = Math.round(amount);
  const abs = Math.abs(whole);
  const body = (options.compact ? compactBody(abs, currency) : null) ?? groupDigits(abs, currency, 0);
  const text = `${whole < 0 ? "-" : ""}${CURRENCY_CONFIG[currency].symbol}${body}`;
  return options.withCode ? `${text} ${currency}` : text;
}

export function formatMoneyCompact(amount: number | null | undefined, currency: Currency): string {
  return formatMoney(amount, currency, { compact: true });
}

/** { INR: 0, USD: 0 }. */
export function emptyTotals(): CurrencyTotals {
  return { INR: 0, USD: 0 };
}

/** Sums amounts per currency; items without an amount or currency are skipped. */
export function sumByCurrency(
  items: Iterable<{ amount: number | null | undefined; currency: Currency | null | undefined }>,
): CurrencyTotals {
  const totals = emptyTotals();
  for (const item of items) {
    if (item.amount === null || item.amount === undefined || !item.currency) continue;
    totals[item.currency] += item.amount;
  }
  return totals;
}

export function addTotals(a: CurrencyTotals, b: CurrencyTotals): CurrencyTotals {
  return { INR: a.INR + b.INR, USD: a.USD + b.USD };
}

/** Currencies with a non-zero total, in display order. */
export function currenciesWithValue(totals: CurrencyTotals): Currency[] {
  return CURRENCY_ORDER.filter((currency) => totals[currency] !== 0);
}

/** "₹12,00,000 · $45,000" (non-zero currencies only); "—" when all are zero. */
export function formatTotals(totals: CurrencyTotals, options: FormatMoneyOptions = {}): string {
  const present = currenciesWithValue(totals);
  if (present.length === 0) return "—";
  return present.map((currency) => formatMoney(totals[currency], currency, options)).join(" · ");
}

/** APPROXIMATE conversion to INR for margin only. Never use it to add currencies in a total. */
export function toInr(amount: number, currency: Currency, usdInrRate: number): number {
  return currency === "INR" ? amount : Math.round(amount * usdInrRate);
}

const SUFFIX_MULTIPLIER: Record<string, number> = {
  k: 1_000,
  l: 100_000,
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  m: 1_000_000,
  cr: 10_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
};

/**
 * Parses money typed by an admin: "12,00,000", "₹ 1200000", "$45,000",
 * "1.5L", "2 cr", "50k", "1.2M", "5000 INR". Returns whole units, or null
 * when invalid, negative or above MAX_MONEY (the INTEGER column limit).
 */
export function parseMoneyInput(input: string): number | null {
  const text = input
    .trim()
    .toLowerCase()
    .replace(/[₹$,\s]/g, "")
    .replace(/^(inr|usd|rs\.?)/, "")
    .replace(/(inr|usd|rs\.?)$/, "");
  if (!text) return null;
  const match = /^(\d+(?:\.\d+)?)([a-z]*)$/.exec(text);
  if (!match) return null;
  const multiplier = match[2] ? SUFFIX_MULTIPLIER[match[2]] : 1;
  if (!multiplier) return null;
  const value = Math.round(Number(match[1]) * multiplier);
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY ? value : null;
}
