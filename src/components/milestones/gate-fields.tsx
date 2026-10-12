import type { ReactNode } from "react";
import { ExternalLink, Gavel, History, UserRound } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { TimeAgo } from "@/components/ui/time-ago";
import { GATE_DECISION_CONFIG, MAX_GATE_EXTENSIONS } from "@/lib/constants";
import type { Activity, MilestoneWithMeta } from "@/lib/types";
import { cn, formatDate, isHttpUrl } from "@/lib/utils";
import { GateDecisionBadge } from "./milestone-status-badge";
import { parseGateDecidedMeta } from "./milestone-utils";

export interface GateFieldsProps {
  milestone: MilestoneWithMeta;
  /** gate_requested / gate_decided entries of the phase, newest first (listGateHistory). */
  history: Activity[];
  className?: string;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-x-3 py-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <dt className="pt-px text-xs font-medium text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-sm text-fg [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function EvidenceLink({ url }: { url: string }) {
  if (!isHttpUrl(url)) return <span className="text-fg-muted">{url}</span>;
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // isHttpUrl already parsed it; keep the raw URL as the label otherwise.
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded text-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="truncate">{host}</span>
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function HistoryEntry({ entry }: { entry: Activity }) {
  const decided = entry.type === "gate_decided" ? parseGateDecidedMeta(entry.meta) : null;
  const actor = entry.actor?.name ?? "Someone";
  return (
    <li className="relative flex gap-3">
      <span className="relative z-10 shrink-0 rounded-full ring-4 ring-surface">
        {entry.actor ? (
          <UserAvatar user={entry.actor} size="sm" />
        ) : (
          <span
            role="img"
            aria-label="Unknown user"
            className="flex size-6 items-center justify-center rounded-full bg-surface-2 text-fg-subtle"
          >
            <UserRound className="size-3.5" aria-hidden />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-5 text-fg">
          <span className="font-medium">{actor}</span>
          {decided ? (
            <>
              <span className="text-fg-muted">decided</span>
              <GateDecisionBadge decision={decided.decision} />
            </>
          ) : (
            <span className="text-fg-muted">requested a gate review</span>
          )}
        </p>
        <TimeAgo date={entry.created_at} className="mt-0.5 block text-xs text-fg-subtle" />
        {decided ? (
          <dl className="mt-2 space-y-1 text-xs text-fg-muted">
            {decided.decision === "extend" && decided.new_due_date ? (
              <div className="flex flex-wrap gap-x-1.5">
                <dt>New due date:</dt>
                <dd className="tabular-nums text-fg">{formatDate(decided.new_due_date)}</dd>
              </div>
            ) : null}
            {decided.fix_list ? (
              <div>
                <dt>Fix list:</dt>
                <dd className="mt-0.5 max-w-[70ch] whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">
                  {decided.fix_list}
                </dd>
              </div>
            ) : null}
            {decided.signoff.name || decided.signoff.date ? (
              <div className="flex flex-wrap gap-x-1.5">
                <dt>Client sign-off:</dt>
                <dd className="text-fg">
                  {[decided.signoff.name, decided.signoff.date ? formatDate(decided.signoff.date) : null]
                    .filter(Boolean)
                    .join(", ")}
                </dd>
              </div>
            ) : null}
            {decided.evidence_url ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                <dt>Evidence:</dt>
                <dd className="min-w-0">
                  <EvidenceLink url={decided.evidence_url} />
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The gate box of a phase: where the gate stands, the latest decision with its
 * sign-off and evidence, the notes, and the "Decision history" timeline.
 */
export function GateFields({ milestone, history, className }: GateFieldsProps) {
  const decision = milestone.gate_decision;
  const waiting = milestone.status === "gate_review";

  return (
    <div className={cn("space-y-4", className)}>
      {waiting ? (
        <p className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-sm text-fg ring-1 ring-inset ring-warning/30">
          <Gavel className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            Waiting for a decision: {GATE_DECISION_CONFIG.go.label}, {GATE_DECISION_CONFIG.extend.label} or{" "}
            {GATE_DECISION_CONFIG.stop.label}.
          </span>
        </p>
      ) : null}

      <dl className="divide-y divide-border">
        <Field label="Last decision">
          {decision ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <GateDecisionBadge decision={decision} />
              <span className="text-xs text-fg-muted">
                {milestone.gate_decider ? `by ${milestone.gate_decider.name}` : null}
                {milestone.gate_decided_at ? ` on ${formatDate(milestone.gate_decided_at)}` : null}
              </span>
            </span>
          ) : (
            <span className="text-fg-muted">{milestone.requires_gate ? "Not reviewed yet." : "No gate on this phase."}</span>
          )}
        </Field>
        {milestone.extend_count > 0 ? (
          <Field label="Extensions">
            <span className="tabular-nums">
              {milestone.extend_count} of {MAX_GATE_EXTENSIONS} used
            </span>
          </Field>
        ) : null}
        <Field label="Client sign-off">
          {milestone.client_signoff_name || milestone.client_signoff_date ? (
            <span>
              {milestone.client_signoff_name ?? "Signed"}
              {milestone.client_signoff_date ? (
                <span className="text-fg-muted">, {formatDate(milestone.client_signoff_date)}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-fg-subtle">&mdash;</span>
          )}
        </Field>
        <Field label="Evidence">
          {milestone.evidence_url ? (
            <EvidenceLink url={milestone.evidence_url} />
          ) : (
            <span className="text-fg-subtle">&mdash;</span>
          )}
        </Field>
        {milestone.gate_notes.trim() ? (
          <Field label="Notes">
            <p className="max-w-[70ch] whitespace-pre-wrap leading-6">{milestone.gate_notes}</p>
          </Field>
        ) : null}
      </dl>

      <section aria-label="Decision history">
        <h5 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
          <History className="size-3.5" aria-hidden />
          Decision history
        </h5>
        {history.length === 0 ? (
          <p className="text-sm text-fg-muted">No gate reviews yet.</p>
        ) : (
          <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-border">
            {history.map((entry) => (
              <HistoryEntry key={entry.id} entry={entry} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
