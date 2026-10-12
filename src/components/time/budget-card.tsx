import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { getBudgetBurn } from "@/lib/data/time";
import { BudgetBurnBar, burnRingTone } from "./budget-burn-bar";

/**
 * Overview card (server; SPEC.md section 21.2, side column order 50, visible
 * when `budget_hours` is set): hours burn against the budget with the
 * elapsed marker and a link to the Time tab. Hours only, never money.
 */
export async function BudgetCard({ project, today }: ProjectTabProps) {
  const burn = await getBudgetBurn(project.id, today);
  if (!burn) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="min-w-0">
          <CardTitle id="project-budget-heading">Budget</CardTitle>
          <CardDescription className="text-xs">
            {burn.period === "monthly" ? `${burn.budget_hours} hours a month` : `${burn.budget_hours} hours in total`}
          </CardDescription>
        </div>
        <ProgressRing value={burn.burn_pct} size={44} tone={burnRingTone(burn.burn_pct)} showValue label="Hours budget used" />
      </CardHeader>
      <CardContent className="space-y-4">
        <BudgetBurnBar burn={burn} />
        <Link href={`/projects/${project.id}?tab=time`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Time tab
          <ArrowRight aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}
