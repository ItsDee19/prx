import { RAG_CONFIG } from "@/lib/constants";
import type { ClientSummary, RagHealth, StatusUpdate } from "@/lib/types";
import { formatDate, formatMetricValue, mentionsToPlainText } from "@/lib/utils";

/**
 * "Copy for client" (SPEC.md section 20.2): a clean plain-text summary that
 * reads well pasted into an email and renders as Markdown where supported.
 * Pure and server-safe. It never includes internal fields: the budget RAG,
 * internal notes, the author, task counts or any amount. @mentions become
 * plain "@Name".
 */
export function formatClientUpdate(
  update: StatusUpdate,
  project: { name: string; client: ClientSummary | null },
): string {
  const lines: string[] = [];
  const clientName = project.client && !project.client.confidential ? project.client.name : null;
  const title = clientName ? `${clientName} · ${project.name}` : project.name;

  lines.push(`**${title}: status update, week of ${formatDate(update.week_of)}**`);
  lines.push("");
  lines.push(`Overall: ${ragLabel(update.health)}`);

  const dimensions: string[] = [];
  if (update.schedule_rag) dimensions.push(`Schedule ${ragLabel(update.schedule_rag)}`);
  if (update.scope_rag) dimensions.push(`Scope ${ragLabel(update.scope_rag)}`);
  if (update.quality_rag) dimensions.push(`Quality ${ragLabel(update.quality_rag)}`);
  if (dimensions.length > 0) lines.push(dimensions.join(" · "));

  lines.push("");
  lines.push(clean(update.headline));

  const progress = progressLine(update);
  if (progress) {
    lines.push("");
    lines.push(progress);
  }
  if (update.changes.milestones_done.length > 0) {
    lines.push(`Milestones completed: ${update.changes.milestones_done.join(", ")}`);
  }

  pushSection(lines, "Done this week", update.done);
  pushSection(lines, "Next", update.next);
  pushSection(lines, "Blockers", update.blockers);
  pushSection(lines, "What we need from you", update.client_asks);

  if (update.metrics_snapshot.length > 0) {
    lines.push("");
    lines.push("**Success metrics**");
    for (const metric of update.metrics_snapshot) {
      const current = metric.current === null ? "not measured yet" : formatMetricValue(metric.current, metric.unit);
      const target = `${metric.direction === "higher" ? "≥" : "≤"} ${formatMetricValue(metric.target, metric.unit)}`;
      const met = metric.is_met === null ? "" : metric.is_met ? " (met)" : " (not met yet)";
      lines.push(`- ${metric.name}: ${current}, target ${target}${met}`);
    }
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function ragLabel(health: RagHealth): string {
  return RAG_CONFIG[health].label;
}

function clean(text: string): string {
  return mentionsToPlainText(text).trim();
}

function progressLine(update: StatusUpdate): string | null {
  const { progress_from: from, progress_to: to, due_date_from: dueFrom, due_date_to: dueTo } = update.changes;
  const parts: string[] = [];
  if (from !== null && from !== to) parts.push(`Progress: ${from}% → ${to}%`);
  else parts.push(`Progress: ${to}%`);
  if (dueFrom && dueTo && dueFrom !== dueTo) parts.push(`target date moved from ${formatDate(dueFrom)} to ${formatDate(dueTo)}`);
  else if (dueTo) parts.push(`target date ${formatDate(dueTo)}`);
  return parts.join(", ");
}

/** A heading plus the section as bullets (one per non-empty line, existing bullets kept). */
function pushSection(lines: string[], heading: string, body: string): void {
  const items = clean(body)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, ""));
  if (items.length === 0) return;
  lines.push("");
  lines.push(`**${heading}**`);
  for (const item of items) lines.push(`- ${item}`);
}
