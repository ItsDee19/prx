/**
 * Pure helpers for the template UI (safe in server and client components).
 */
import { DEFAULT_NEW_PROJECT_PROGRESS_MODE } from "@/lib/constants";
import type { TemplateOption } from "@/lib/templates";
import type { CreateProjectFullInput, ServiceLine, TemplatePayload } from "@/lib/types";
import { pluralize } from "@/lib/utils";

export interface TemplatePayloadSummary {
  phases: number;
  milestones: number;
  gates: number;
  tasks: number;
  deliverables: number;
  metrics: number;
  risks: number;
  labels: number;
}

export function summarizeTemplatePayload(payload: TemplatePayload): TemplatePayloadSummary {
  let tasks = 0;
  let deliverables = 0;
  for (const milestone of payload.milestones) {
    tasks += milestone.tasks.length;
    deliverables += milestone.tasks.filter((task) => task.is_deliverable).length;
  }
  return {
    phases: payload.milestones.filter((milestone) => milestone.kind === "phase").length,
    milestones: payload.milestones.filter((milestone) => milestone.kind === "milestone").length,
    gates: payload.milestones.filter((milestone) => milestone.requires_gate).length,
    tasks,
    deliverables,
    metrics: payload.metrics.length,
    risks: payload.risks.length,
    labels: payload.label_names.length,
  };
}

/** "5 phases · 26 tasks · 2 metrics · 4 risks" (empty parts left out). */
export function summaryLine(summary: TemplatePayloadSummary, options: { labels?: boolean } = {}): string {
  const parts = [
    summary.phases > 0 ? pluralize(summary.phases, "phase") : null,
    summary.milestones > 0 ? pluralize(summary.milestones, "milestone") : null,
    summary.tasks > 0 ? pluralize(summary.tasks, "task") : null,
    summary.metrics > 0 ? pluralize(summary.metrics, "metric") : null,
    summary.risks > 0 ? pluralize(summary.risks, "risk") : null,
    options.labels && summary.labels > 0 ? pluralize(summary.labels, "label") : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "No phases or tasks";
}

/** The service line a project created from this option starts with. */
export function defaultServiceLine(option: TemplateOption): ServiceLine | null {
  return option.payload.service_line ?? option.service_lines[0] ?? null;
}

/** Start-step prefill for the details form: the template's defaults, or plain defaults for a blank project. */
export function templatePrefill(
  option: TemplateOption | null,
  startDate: string,
  fallback: Partial<CreateProjectFullInput> = {},
): Partial<CreateProjectFullInput> {
  if (!option) {
    return {
      start_date: startDate || null,
      progress_mode: fallback.progress_mode ?? DEFAULT_NEW_PROJECT_PROGRESS_MODE,
      engagement_type: fallback.engagement_type ?? null,
      delivery_state: fallback.delivery_state ?? "not_started",
      budget_period: fallback.budget_period ?? "total",
      service_line: fallback.service_line ?? null,
    };
  }
  return {
    start_date: startDate || null,
    progress_mode: option.payload.progress_mode,
    engagement_type: option.payload.engagement_type,
    delivery_state: option.payload.delivery_state,
    budget_period: option.payload.budget_period,
    service_line: fallback.service_line ?? defaultServiceLine(option),
  };
}

/** The first option suggested for a service line (e.g. a client page passing `service_line`). */
export function suggestedOption(options: readonly TemplateOption[], serviceLine: ServiceLine | null | undefined): TemplateOption | null {
  if (!serviceLine) return null;
  return options.find((option) => option.source === "builtin" && option.service_lines[0] === serviceLine) ?? null;
}
