import type { ProjectTabContext } from "@/components/projects/detail/tabs/types";
import { BATCH_SERVICE_LINES } from "@/lib/constants";

/**
 * Tab registry predicate for the Batches tab (SPEC.md section 21.1): Avlys
 * Data projects (service_line "data", BATCH_SERVICE_LINES), projects whose
 * progress comes from batches, or any project that already has batches.
 */
export function isBatchesTabVisible(ctx: ProjectTabContext): boolean {
  const serviceLine = ctx.project.service_line;
  return (
    (serviceLine !== null && BATCH_SERVICE_LINES.includes(serviceLine)) ||
    ctx.project.progress_mode === "batches" ||
    ctx.counts.batches > 0
  );
}
