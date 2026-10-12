import { Lock, Wallet } from "lucide-react";
import { Money } from "@/components/ui/money";
import { CURRENCY_CONFIG } from "@/lib/constants";
import type { HomeContractValue } from "@/lib/data/home";
import { currenciesWithValue } from "@/lib/money";
import { CURRENCIES } from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { BentoTile, TileEmpty } from "./bento";

export interface ContractValueTileProps {
  /** ADMIN-ONLY data: render this tile only for admins (server component, never a client prop). */
  value: HomeContractValue;
  className?: string;
}

/**
 * Admin-only: contract value of open top-level engagements, one figure per
 * currency side by side. INR and USD are never added together.
 */
export function ContractValueTile({ value, className }: ContractValueTileProps) {
  const present = currenciesWithValue(value.totals);
  return (
    <BentoTile
      id="home-contract-value"
      title="Open contract value"
      icon={Wallet}
      iconClassName="bg-success/10 text-success"
      description={
        <>
          <Lock aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />
          Admins only. Each currency on its own.
        </>
      }
      action={{ href: "/clients", label: "Clients" }}
      className={className}
    >
      {present.length === 0 ? (
        <TileEmpty
          icon={Wallet}
          title="No contract values recorded."
          description="Pick a currency and enter the contract value when you edit an engagement; open ones add up here per currency."
        />
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
          {CURRENCIES.filter((currency) => present.includes(currency)).map((currency) => (
            <div key={currency} className="min-w-0 rounded-2xl border border-border bg-surface-2/50 px-4 py-3">
              <dt className="text-xs font-medium text-fg-muted">{CURRENCY_CONFIG[currency].label}</dt>
              <dd className="mt-1 text-2xl font-semibold leading-8 tracking-[-0.02em] text-fg">
                <Money amount={value.totals[currency]} currency={currency} compact />
              </dd>
              <dd className="mt-0.5 text-xs tabular-nums text-fg-muted">
                across {pluralize(value.project_counts[currency], "engagement")}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </BentoTile>
  );
}
