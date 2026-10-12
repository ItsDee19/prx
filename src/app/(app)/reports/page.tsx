import type { Metadata } from "next";
import { CommercialSection } from "@/components/reports/commercial-section";
import { DeliverySection } from "@/components/reports/delivery-section";
import { ExportMenu } from "@/components/reports/export-menu";
import { VIZ_THEME_CLASS } from "@/components/reports/chart-types";
import { rangeLabel } from "@/components/reports/format";
import {
  REPORT_TABS,
  REPORT_TAB_CONFIG,
  parseReportParams,
  reportsHref,
  type ReportSectionProps,
  type ReportTab,
} from "@/components/reports/report-params";
import { ReportsToolbar } from "@/components/reports/reports-toolbar";
import { TeamSection } from "@/components/reports/team-section";
import { TimeSection } from "@/components/reports/time-section";
import { PageHeader } from "@/components/ui/page-header";
import { TabLinks } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth";
import type { IconName } from "@/lib/constants";
import { getAppSettings } from "@/lib/data/app-settings";
import { listClientSummaries } from "@/lib/data/clients";
import { cn } from "@/lib/utils";
import { safeTimeZone, workspaceToday } from "@/lib/workspace-time";

export const metadata: Metadata = { title: "Reports" };

const TAB_ICONS: Record<ReportTab, IconName> = {
  delivery: "ChartColumn",
  time: "Clock",
  team: "Users",
  commercial: "Wallet",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

interface ReportsPageProps {
  searchParams: Promise<RawSearchParams>;
}

/**
 * /reports (SPEC.md section 19.1): `?tab=delivery|time|team|commercial&from&to&client`.
 * Only the active tab's section renders (and loads its data). Commercial is
 * admin-only: members asking for it get Delivery, its tab link is never
 * rendered for them, and no commercial figure reaches their HTML.
 */
export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const [raw, settings, clients] = await Promise.all([searchParams, getAppSettings(), listClientSummaries()]);
  const timeZone = safeTimeZone(settings.workspace_timezone);
  const today = workspaceToday(timeZone);
  const params = parseReportParams(raw, today, isAdmin);

  const tabs = REPORT_TABS.filter((tab) => isAdmin || !REPORT_TAB_CONFIG[tab].adminOnly).map((tab) => ({
    id: tab,
    label: REPORT_TAB_CONFIG[tab].label,
    href: reportsHref({ ...params, tab }, today),
    icon: TAB_ICONS[tab],
  }));

  const section: ReportSectionProps = { params, today, timeZone, cadenceDays: settings.update_cadence_days };

  return (
    <div className={cn("min-w-0", VIZ_THEME_CLASS)}>
      <PageHeader
        title="Reports"
        description={`${REPORT_TAB_CONFIG[params.tab].description} ${rangeLabel(params.from, params.to)}.`}
        actions={<ExportMenu from={params.from} to={params.to} clientId={params.clientId} />}
      />

      <TabLinks items={tabs} activeId={params.tab} aria-label="Report sections" className="mb-4 sm:mb-5" />

      <ReportsToolbar
        from={params.from}
        to={params.to}
        clientId={params.clientId}
        clients={clients}
        today={today}
        showRange
      />

      {params.tab === "delivery" ? <DeliverySection {...section} /> : null}
      {params.tab === "time" ? <TimeSection {...section} /> : null}
      {params.tab === "team" ? <TeamSection {...section} /> : null}
      {isAdmin && params.tab === "commercial" ? <CommercialSection {...section} /> : null}
    </div>
  );
}
