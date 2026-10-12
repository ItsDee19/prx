import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { RiskScoreBadge } from "@/components/risks/risk-score-badge";
import { UserAvatar } from "@/components/ui/avatar";
import { RISK_KIND_CONFIG } from "@/lib/constants";
import type { HomeRisk } from "@/lib/data/home";
import { pluralize } from "@/lib/utils";
import { BentoTile, TILE_ROW_CLASS, TILE_ROW_LINK_CLASS, TileEmpty } from "./bento";
import { ProjectRef } from "./project-ref";

export interface RisksTileProps {
  risks: HomeRisk[];
  /** My open items whose review date has passed. */
  overdueReviews: number;
  className?: string;
}

/** The highest-scoring open risks, issues and dependencies across open projects. */
export function RisksTile({ risks, overdueReviews, className }: RisksTileProps) {
  return (
    <BentoTile
      id="home-risks"
      title="Top risks"
      icon={ShieldAlert}
      iconClassName="bg-danger/10 text-danger"
      description={
        overdueReviews > 0 ? (
          <span>
            <span className="font-medium text-danger">{pluralize(overdueReviews, "review")} of yours</span> past
            due.
          </span>
        ) : (
          "Open RAID items by likelihood × impact."
        )
      }
      className={className}
    >
      {risks.length === 0 ? (
        <TileEmpty
          icon={ShieldAlert}
          title="No open risks."
          description="Log risks, issues and client dependencies in a project's Risks tab. The highest scores rise here."
        />
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {risks.map((risk) => (
            <li key={risk.id} className={TILE_ROW_CLASS}>
              <RiskScoreBadge likelihood={risk.likelihood} impact={risk.impact} compact />
              <div className="min-w-0 flex-1">
                <Link href={`/projects/${risk.project.id}?tab=risks`} className={TILE_ROW_LINK_CLASS}>
                  {risk.title}
                </Link>
                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
                  <span className="shrink-0">{RISK_KIND_CONFIG[risk.kind].label}</span>
                  <span aria-hidden className="text-fg-subtle">
                    ·
                  </span>
                  <ProjectRef project={risk.project} />
                </p>
              </div>
              {risk.owner ? <UserAvatar user={risk.owner} size="sm" className="relative z-10" /> : null}
            </li>
          ))}
        </ul>
      )}
    </BentoTile>
  );
}
