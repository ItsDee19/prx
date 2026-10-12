/** Small, deterministic label helpers shared by the report sections. */
import { formatDate } from "@/lib/utils";

/** "Oct 13" */
export function shortWeekLabel(weekStart: string): string {
  return formatDate(weekStart, { month: "short", day: "numeric" });
}

/** "Week of Oct 13, 2026" */
export function fullWeekLabel(weekStart: string): string {
  return `Week of ${formatDate(weekStart)}`;
}

/** "Oct 1, 2026 to Dec 23, 2026" */
export function rangeLabel(from: string, to: string): string {
  return `${formatDate(from)} to ${formatDate(to)}`;
}
