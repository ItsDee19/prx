import Link from "next/link";
import { Banknote, IndianRupee, Percent, ReceiptText } from "lucide-react";
import { Reveal } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { CURRENCY_ORDER, ENGAGEMENT_TYPE_CONFIG, INVOICE_STATUS_CONFIG } from "@/lib/constants";
import { contractValueByCurrency, invoiceStatusSummary, marginByProject } from "@/lib/data/reports";
import { formatHours } from "@/lib/duration";
import type { ChartColor, ChartSpec } from "./chart-types";
import { KpiTile } from "./kpi-tile";
import { ReportChart } from "./report-chart";
import type { ReportSectionProps } from "./report-params";
import type { Currency, InvoiceStatus } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";

const INVOICE_COLOR: Record<InvoiceStatus, ChartColor> = {
  not_invoiced: "muted",
  invoiced: "series-1",
  paid: "good",
};

/**
 * ADMIN-ONLY Commercial tab (the page renders it only for admins, so none of
 * this reaches a member's HTML): contract value per currency (INR and USD
 * are never summed), phase invoicing and approximate margin.
 */
export async function CommercialSection({ params }: ReportSectionProps) {
  const scope = { clientId: params.clientId ?? undefined };
  const [contracts, invoices, margins] = await Promise.all([
    contractValueByCurrency(scope),
    invoiceStatusSummary(scope),
    marginByProject({ from: params.from, to: params.to, clientId: params.clientId ?? undefined }),
  ]);

  const totals: Record<Currency, { amount: number; count: number }> = { INR: { amount: 0, count: 0 }, USD: { amount: 0, count: 0 } };
  for (const row of contracts) {
    totals[row.currency].amount += row.amount;
    totals[row.currency].count += row.project_count;
  }
  const currencies = CURRENCY_ORDER.filter((currency) => contracts.some((row) => row.currency === currency));
  const invoiceCurrencies = CURRENCY_ORDER.filter((currency) => invoices.some((row) => row.currency === currency && row.count > 0));
  const rate = margins[0]?.usd_inr_rate ?? null;
  const marginTotal = margins.reduce((sum, row) => sum + row.approx_margin_inr, 0);
  const valueTotal = margins.reduce((sum, row) => sum + row.contract_value_inr, 0);

  const marginSpec: ChartSpec = {
    kind: "bar",
    orientation: "rows",
    format: "percent",
    categoryLabel: "Project",
    series: [{ key: "margin", label: "Approximate margin", color: "series-1" }],
    rows: margins
      .filter((row) => row.margin_pct !== null)
      .map((row) => ({
        label: row.project.client_code ? `${row.project.client_code} · ${row.project.name}` : row.project.name,
        values: { margin: row.margin_pct ?? 0 },
      })),
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Reveal>
          <KpiTile
            label="Active value (INR)"
            icon={IndianRupee}
            value={{ kind: "money", amount: totals.INR.amount, currency: "INR" }}
            hint={pluralize(totals.INR.count, "open engagement")}
          />
        </Reveal>
        <Reveal delay={0.035}>
          <KpiTile
            label="Active value (USD)"
            icon={Banknote}
            value={{ kind: "money", amount: totals.USD.amount, currency: "USD" }}
            hint={pluralize(totals.USD.count, "open engagement")}
          />
        </Reveal>
        <Reveal delay={0.07}>
          <KpiTile
            label="Approx. margin"
            icon={Percent}
            tone={marginTotal < 0 ? "danger" : "success"}
            value={{ kind: "percent", value: valueTotal > 0 ? Math.round((100 * marginTotal) / valueTotal) : null }}
            hint={rate !== null ? `In INR at ${rate} per USD` : "No contracts with a value"}
          />
        </Reveal>
        <Reveal delay={0.105}>
          <KpiTile
            label="Not invoiced"
            icon={ReceiptText}
            tone="neutral"
            value={{ kind: "count", value: invoices.filter((row) => row.status === "not_invoiced").reduce((sum, row) => sum + row.count, 0) }}
            hint="Priced phases awaiting an invoice"
          />
        </Reveal>
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        {currencies.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Contract value</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">
                No open engagements have a contract value.
              </p>
            </CardContent>
          </Card>
        ) : (
          currencies.map((currency) => (
            <ReportChart
              key={currency}
              title={`Contract value (${currency})`}
              description={`Open engagements by engagement type, in ${currency} only.`}
              spec={{
                kind: "bar",
                orientation: "rows",
                format: currency === "INR" ? "money-INR" : "money-USD",
                categoryLabel: "Engagement type",
                series: [{ key: "amount", label: "Contract value", color: "series-1" }],
                rows: contracts
                  .filter((row) => row.currency === currency)
                  .map((row) => ({
                    label: row.engagement_type ? ENGAGEMENT_TYPE_CONFIG[row.engagement_type].label : "No type",
                    values: { amount: row.amount },
                  })),
              }}
              emptyText="No contract value."
            />
          ))
        )}
        {invoiceCurrencies.map((currency) => (
          <ReportChart
            key={`invoice-${currency}`}
            title={`Phase invoicing (${currency})`}
            description="Priced phases by invoice status."
            spec={{
              kind: "bar",
              orientation: "rows",
              stacked: true,
              format: currency === "INR" ? "money-INR" : "money-USD",
              categoryLabel: "Currency",
              series: (["not_invoiced", "invoiced", "paid"] as const).map((status) => ({
                key: status,
                label: INVOICE_STATUS_CONFIG[status].label,
                color: INVOICE_COLOR[status],
              })),
              rows: [
                {
                  label: currency,
                  fullLabel: `${currency} phase prices`,
                  values: Object.fromEntries(
                    invoices.filter((row) => row.currency === currency).map((row) => [row.status, row.amount]),
                  ),
                },
              ],
            }}
            height={150}
            emptyText="No priced phases."
          />
        ))}
      </div>

      <Card>
        <CardHeader className="flex-wrap">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              Margin by project <Badge tone="amber">Approximate</Badge>
            </CardTitle>
            <CardDescription>
              Contract value in INR (USD converted at {rate ?? "the workspace rate"} per USD) minus logged hours at each
              person&rsquo;s cost rate. People without a cost rate count as zero.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {margins.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">
              No projects with a contract value in this range.
            </p>
          ) : (
            <div className="max-h-[28rem] overflow-auto rounded-xl border border-border">
              <table className="w-full min-w-max border-collapse text-sm">
                <caption className="sr-only">Approximate margin by project</caption>
                <thead className="sticky top-0 bg-surface-2 text-left text-xs text-fg-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Project</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Contract</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Hours</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Cost (INR)</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Margin (INR, approx.)</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {margins.map((row) => (
                    <tr key={row.project.id} className="border-t border-border">
                      <th scope="row" className="max-w-64 truncate px-3 py-2 text-left font-medium">
                        <Link
                          href={`/projects/${row.project.id}`}
                          className="text-fg hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {row.project.client_code ? <span className="mr-1.5 font-mono text-xs text-fg-muted">{row.project.client_code}</span> : null}
                          {row.project.name}
                        </Link>
                      </th>
                      <td className="px-3 py-2 text-right">
                        <Money amount={row.contract_value} currency={row.currency} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{formatHours(row.logged_minutes)}</td>
                      <td className="px-3 py-2 text-right">
                        <Money amount={row.cost_inr} currency="INR" />
                      </td>
                      <td className={cn("px-3 py-2 text-right", row.approx_margin_inr < 0 && "text-danger")}>
                        <Money amount={row.approx_margin_inr} currency="INR" />
                      </td>
                      <td className={cn("px-3 py-2 text-right font-medium tabular-nums", row.margin_pct !== null && row.margin_pct < 0 ? "text-danger" : "text-fg")}>
                        {row.margin_pct === null ? "—" : `${row.margin_pct}%`}
                        {row.margin_pct !== null && row.margin_pct < 0 ? <span className="sr-only"> (loss)</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {marginSpec.rows.length > 0 ? (
        <ReportChart
          title="Approximate margin %"
          description="Lowest margin first. Approximate: USD contracts converted at the workspace rate."
          spec={marginSpec}
          emptyText="No margin to show."
        />
      ) : null}
    </div>
  );
}
