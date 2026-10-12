import type { ComponentType } from "react";
import { KeyLinksCard } from "@/components/attachments/key-links-card";
import { CommercialSummary } from "@/components/clients/commercial-summary";
import { TuningCard } from "@/components/golive/tuning-card";
import { PhasesCard } from "@/components/milestones/phases-card";
import { TopRisksCard } from "@/components/risks/top-risks-card";
import { ScorecardCard } from "@/components/scorecard/scorecard-card";
import { BudgetCard } from "@/components/time/budget-card";
import { LatestUpdateCard } from "@/components/updates/latest-update-card";
import { NO_GO_LIVE_SERVICE_LINES } from "@/lib/constants";
import type { ProjectTabContext, ProjectTabProps } from "../tabs/types";
import { CommentsCard } from "./comments-card";
import { DescriptionCard } from "./description-card";
import { DetailsCard } from "./details-card";
import { SubprojectsCard } from "./subprojects-card";

/**
 * Overview cards registry (SPEC.md section 21.2). The Overview tab renders the
 * visible cards of each column by `order` (one column below xl: main, then
 * side). Adding a card is one entry; cards are server components (or client
 * components with serialisable props) taking ProjectTabProps.
 *
 * Integration entries: commercial (side 40, W2 integration, admins only),
 * key links (main 5, W3 integration), scorecard (main 20), latest update
 * (side 10), go-live / tuning (side 20), top risks (side 30) (W4 integration).
 * Budget (side 50, W5 integration, when budget_hours is set).
 */
export interface OverviewCardEntry {
  id: string;
  column: "main" | "side";
  order: number;
  component: ComponentType<ProjectTabProps>;
  /** Default: always visible. */
  visible?: (ctx: ProjectTabContext) => boolean;
}

export const OVERVIEW_CARDS: readonly OverviewCardEntry[] = [
  { id: "description", column: "main", order: 0, component: DescriptionCard },
  { id: "key-links", column: "main", order: 5, component: KeyLinksCard },
  { id: "phases", column: "main", order: 10, component: PhasesCard },
  { id: "scorecard", column: "main", order: 20, component: ScorecardCard },
  { id: "subprojects", column: "main", order: 30, component: SubprojectsCard },
  { id: "comments", column: "main", order: 90, component: CommentsCard },
  { id: "details", column: "side", order: 0, component: DetailsCard },
  { id: "latest-update", column: "side", order: 10, component: LatestUpdateCard },
  {
    id: "go-live",
    column: "side",
    order: 20,
    component: TuningCard,
    visible: ({ project: p }) =>
      p.go_live_date !== null || p.service_line === null || !NO_GO_LIVE_SERVICE_LINES.includes(p.service_line),
  },
  { id: "top-risks", column: "side", order: 30, component: TopRisksCard },
  { id: "commercial", column: "side", order: 40, component: CommercialSummary, visible: (ctx) => ctx.isAdmin },
  {
    id: "budget",
    column: "side",
    order: 50,
    component: BudgetCard,
    visible: ({ project }) => project.budget_hours !== null,
  },
];

/** Visible cards of one column, by `order` (the first entry wins when an id repeats). */
export function visibleOverviewCards(ctx: ProjectTabContext, column: OverviewCardEntry["column"]): OverviewCardEntry[] {
  const seen = new Set<string>();
  return OVERVIEW_CARDS.filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return card.column === column && (card.visible ? card.visible(ctx) : true);
  }).sort((a, b) => a.order - b.order);
}
