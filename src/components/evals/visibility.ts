import type { ProjectTabContext } from "@/components/projects/detail/tabs/types";
import { EVAL_SERVICE_LINES } from "@/lib/constants";

/**
 * Tab registry predicate for the Evals tab (SPEC.md section 21.1): AI service
 * lines (EVAL_SERVICE_LINES), or any project that already has eval runs.
 */
export function isEvalsTabVisible(ctx: ProjectTabContext): boolean {
  const serviceLine = ctx.project.service_line;
  return (serviceLine !== null && EVAL_SERVICE_LINES.includes(serviceLine)) || ctx.counts.eval_runs > 0;
}
