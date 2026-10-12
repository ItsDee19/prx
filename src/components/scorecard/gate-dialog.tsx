"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  CircleCheck,
  CircleDashed,
  ExternalLink,
  FlaskConical,
  Gavel,
  History,
  Hourglass,
  OctagonAlert,
  PackageCheck,
  PauseCircle,
  RotateCw,
  ShieldAlert,
  Star,
  Target,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "@/components/motion";
import { GateFields } from "@/components/milestones/gate-fields";
import { GateDecisionBadge, MilestoneStatusBadge } from "@/components/milestones/milestone-status-badge";
import { phaseDateRangeLong } from "@/components/milestones/milestone-utils";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { updateProjectStatusAction } from "@/actions/projects";
import { decideGateAction, getGateReviewAction } from "@/actions/scorecard";
import { GATE_DECISION_CONFIG, MAX_GATE_EXTENSIONS, TASK_STATUS_CONFIG } from "@/lib/constants";
import type { GateReview } from "@/lib/data/scorecard";
import { EVIDENCE_URL_MAX, GATE_SIGNOFF_NAME_MAX, GATE_TEXT_MAX } from "@/lib/schemas/scorecard";
import { GATE_DECISIONS, type GateDecision, type Milestone } from "@/lib/types";
import { cn, formatDate, formatMetricValue, isHttpUrl } from "@/lib/utils";
import { MetricStatusBadge } from "./scorecard-panel";

export interface GateDialogProps {
  milestoneId: string;
  /** Element that opens the dialog (rendered with asChild). */
  trigger: ReactNode;
  /** Called after a decision was recorded (the dialog also refreshes the page). */
  onDecided?: (result: { milestone: Milestone; next_phase: Milestone | null }) => void;
}

type Step = "review" | "confirm" | "stopped";

interface FormValues {
  decision: GateDecision | null;
  notes: string;
  conditions: string;
  fix_list: string;
  new_due_date: string;
  client_signoff_name: string;
  client_signoff_date: string;
  evidence_url: string;
}

const EMPTY_FORM: FormValues = {
  decision: null,
  notes: "",
  conditions: "",
  fix_list: "",
  new_due_date: "",
  client_signoff_name: "",
  client_signoff_date: "",
  evidence_url: "",
};

const DECISION_ICON: Record<GateDecision, LucideIcon> = { go: CircleCheck, extend: Hourglass, stop: Ban };

const DECISION_STYLE: Record<GateDecision, { selected: string; icon: string }> = {
  go: { selected: "border-success ring-2 ring-success/25 bg-success/[0.06]", icon: "text-success" },
  extend: { selected: "border-warning ring-2 ring-warning/30 bg-warning/[0.07]", icon: "text-warning" },
  stop: { selected: "border-danger ring-2 ring-danger/25 bg-danger/[0.06]", icon: "text-danger" },
};

/**
 * The go / no-go gate of a phase (SPEC.md §20.2): loads getGateReviewAction
 * when opened and shows the evidence (deliverables, scorecard met / not met,
 * the champion eval run, open and high risks, decision history), then the
 * decision as radio cards — Go (optionally with conditions), Extend once (fix
 * list + new date) or Stop — with the client sign-off and an http(s) evidence
 * link, and a confirm step. After a Stop it offers to put the project on hold.
 */
export function GateDialog({ milestoneId, trigger, onDecided }: GateDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<GateReview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("review");
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [holding, setHolding] = useState(false);
  // Bumped after a failed validation so the review step focuses the first invalid field.
  const [focusRequest, setFocusRequest] = useState(0);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getGateReviewAction(milestoneId);
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      const m = result.data.milestone;
      setReview(result.data);
      setForm({
        ...EMPTY_FORM,
        client_signoff_name: m.client_signoff_name ?? "",
        client_signoff_date: m.client_signoff_date ?? "",
        evidence_url: m.evidence_url ?? "",
      });
    } catch {
      setLoadError("Could not load the gate review. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (pending || holding) return;
    setOpen(next);
    if (next) {
      setReview(null);
      setStep("review");
      setErrors({});
      setForm(EMPTY_FORM);
      void load();
    }
  }

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: "" }));
  }

  function validate(data: GateReview): Record<string, string> {
    const next: Record<string, string> = {};
    if (!form.decision) next.decision = "Choose Go, Extend once or Stop";
    if (form.decision === "extend") {
      if (!data.can_extend) next.decision = `This phase was already extended ${MAX_GATE_EXTENSIONS === 1 ? "once" : `${MAX_GATE_EXTENSIONS} times`}.`;
      if (!form.fix_list.trim()) next.fix_list = "List what must be fixed before the next review";
      if (!form.new_due_date) next.new_due_date = "Pick the new due date";
      else if (form.new_due_date < data.today) next.new_due_date = "The new due date cannot be in the past";
      else if (data.milestone.start_date && form.new_due_date < data.milestone.start_date) {
        next.new_due_date = "The new due date must be on or after the phase's start date";
      }
    }
    const url = form.evidence_url.trim();
    if (url && !isHttpUrl(url)) next.evidence_url = "Use a full http:// or https:// link";
    return Object.fromEntries(Object.entries(next).filter(([, value]) => value));
  }

  function toConfirm(data: GateReview) {
    const found = validate(data);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFocusRequest((value) => value + 1);
      return;
    }
    setStep("confirm");
  }

  async function submit(data: GateReview) {
    if (!form.decision) return;
    setPending(true);
    try {
      const result = await decideGateAction(data.milestone.id, {
        decision: form.decision,
        notes: form.notes,
        conditions: form.decision === "go" ? form.conditions : undefined,
        fix_list: form.decision === "extend" ? form.fix_list : undefined,
        new_due_date: form.decision === "extend" ? form.new_due_date : null,
        client_signoff_name: form.client_signoff_name,
        client_signoff_date: form.client_signoff_date,
        evidence_url: form.evidence_url,
      });
      if (!result.ok) {
        if (result.fieldErrors) {
          setErrors(result.fieldErrors);
          setStep("review");
          setFocusRequest((value) => value + 1);
        }
        toast.error(result.error);
        return;
      }
      const label = GATE_DECISION_CONFIG[form.decision].label;
      toast.success(
        result.data.next_phase
          ? `${label} recorded. ${result.data.next_phase.name} has started.`
          : `${label} recorded for ${data.milestone.name}.`,
      );
      onDecided?.(result.data);
      router.refresh();
      const canHold = data.project.status === "ongoing" || data.project.status === "to_start";
      if (form.decision === "stop" && canHold) setStep("stopped");
      else setOpen(false);
    } catch {
      toast.error("Could not record the gate decision. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function putOnHold(projectId: string) {
    setHolding(true);
    try {
      const result = await updateProjectStatusAction(projectId, "on_hold");
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Project put on hold.");
      router.refresh();
      setOpen(false);
    } catch {
      toast.error("Could not update the project status. Please try again.");
    } finally {
      setHolding(false);
    }
  }

  const title = review ? `Gate review: ${review.milestone.name}` : "Gate review";
  const description = review
    ? `${review.project.name}${review.project.client_code ? ` · ${review.project.client_code}` : ""}`
    : "Check the evidence, then record Go, Extend once or Stop.";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="lg" title={title} description={description}>
        {loadError ? (
          <div role="alert" className="space-y-4 py-6 text-center">
            <p className="text-sm text-fg">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void load()} loading={loading}>
              <RotateCw aria-hidden />
              Try again
            </Button>
          </div>
        ) : !review ? (
          <GateSkeleton />
        ) : review.milestone.status !== "gate_review" && step === "review" ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-fg">
              <Gavel className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
              This phase is no longer waiting for a decision.
            </p>
            <GateFields milestone={review.milestone} history={review.history} />
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </div>
        ) : step === "review" ? (
          <ReviewStep
            review={review}
            form={form}
            errors={errors}
            focusRequest={focusRequest}
            onChange={update}
            onContinue={() => toConfirm(review)}
          />
        ) : step === "confirm" && form.decision ? (
          <ConfirmStep
            review={review}
            form={form}
            decision={form.decision}
            pending={pending}
            onBack={() => setStep("review")}
            onSubmit={() => void submit(review)}
          />
        ) : (
          <Reveal className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface-2/60 p-4">
              <PauseCircle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{review.milestone.name} is stopped.</p>
                <p className="mt-1 text-sm text-fg-muted">
                  Put {review.project.name} on hold so it stops showing as active work? You can resume it later.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={holding} onClick={() => setOpen(false)}>
                Not now
              </Button>
              <Button loading={holding} onClick={() => void putOnHold(review.project.id)}>
                Put on hold
              </Button>
            </DialogFooter>
          </Reveal>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Pieces -------------------------------- */

function GateSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading the gate review">
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-20 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, children, aside }: { icon: LucideIcon; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        <Icon className="size-3.5" aria-hidden />
        {children}
      </h4>
      {aside ? <span className="text-xs tabular-nums text-fg-muted">{aside}</span> : null}
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  caption,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  caption: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  const toneClass = {
    good: "text-success",
    warn: "text-warning",
    bad: "text-danger",
    neutral: "text-fg-muted",
  }[tone];
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-surface px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        <Icon className={cn("size-3.5", toneClass)} aria-hidden />
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-semibold leading-7 tabular-nums tracking-tight text-fg" title={value}>
        {value}
      </p>
      <p className="truncate text-xs text-fg-muted">{caption}</p>
    </div>
  );
}

function RiskScore({ score }: { score: number | null }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-danger/10 px-2 text-xs font-semibold tabular-nums text-fg ring-1 ring-inset ring-danger/35">
      <OctagonAlert className="size-3 text-danger" aria-hidden />
      {score ?? "—"}
      <span className="font-medium text-fg-muted">High</span>
    </span>
  );
}

interface ReviewStepProps {
  review: GateReview;
  form: FormValues;
  errors: Record<string, string>;
  /** Changes after a failed validation: focus the first invalid field. */
  focusRequest: number;
  onChange: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void;
  onContinue: () => void;
}

/** Field order for focusing the first error (keys match the error map). */
const ERROR_ORDER = ["decision", "fix_list", "new_due_date", "evidence_url"] as const;

function ReviewStep({ review, form, errors, focusRequest, onChange, onContinue }: ReviewStepProps) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const errorsRef = useRef(errors);
  errorsRef.current = errors;

  useEffect(() => {
    if (focusRequest === 0) return;
    const key = ERROR_ORDER.find((name) => errorsRef.current[name]);
    if (!key) return;
    const target =
      key === "decision"
        ? formRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:not(:disabled)')
        : document.getElementById(`${uid}-${key}`);
    target?.focus();
    target?.scrollIntoView({ block: "center" });
  }, [focusRequest, uid]);
  const { milestone, deliverables, metrics, champion, open_high_risks: highRisks } = review;
  const counted = deliverables.filter((task) => task.status !== "cancelled");
  const delivered = counted.filter((task) => task.status === "done").length;
  const met = metrics.filter((metric) => metric.is_met === true).length;
  const unmeasured = metrics.filter((metric) => metric.is_met === null).length;
  const championMetrics = champion ? Object.entries(champion.metrics) : [];
  const fid = (key: string) => `${uid}-${key}`;
  const describedBy = (key: string, hint = false) =>
    errors[key] ? `${fid(key)}-error` : hint ? `${fid(key)}-hint` : undefined;

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onContinue();
      }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-muted">
        <MilestoneStatusBadge status={milestone.status} />
        <span className="tabular-nums">{phaseDateRangeLong(milestone)}</span>
        {milestone.extend_count > 0 ? (
          <span className="tabular-nums">
            Extended {milestone.extend_count} of {MAX_GATE_EXTENSIONS}
          </span>
        ) : null}
      </div>

      <Reveal className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile
          icon={PackageCheck}
          label="Deliverables"
          value={counted.length > 0 ? `${delivered}/${counted.length}` : "—"}
          caption={counted.length === 0 ? "None flagged" : delivered === counted.length ? "All done" : `${counted.length - delivered} open`}
          tone={counted.length === 0 ? "neutral" : delivered === counted.length ? "good" : "warn"}
        />
        <SummaryTile
          icon={Target}
          label="Scorecard"
          value={metrics.length > 0 ? `${met}/${metrics.length}` : "—"}
          caption={metrics.length === 0 ? "No metrics" : unmeasured > 0 ? `${unmeasured} not measured` : met === metrics.length ? "All met" : "Some not met"}
          tone={metrics.length === 0 ? "neutral" : met === metrics.length ? "good" : "warn"}
        />
        <SummaryTile
          icon={Star}
          label="Champion run"
          value={champion ? champion.label : "—"}
          caption={champion ? formatDate(champion.created_at) : "No champion yet"}
          tone={champion ? "good" : "neutral"}
        />
        <SummaryTile
          icon={ShieldAlert}
          label="High risks"
          value={String(highRisks.length)}
          caption={`${review.open_risk_count} open in total`}
          tone={highRisks.length > 0 ? "bad" : "good"}
        />
      </Reveal>

      <div className="grid gap-5 md:grid-cols-2">
        <section aria-labelledby={`${uid}-deliverables`}>
          <SectionTitle icon={PackageCheck} aside={counted.length > 0 ? `${delivered} of ${counted.length} done` : undefined}>
            <span id={`${uid}-deliverables`}>Deliverables</span>
          </SectionTitle>
          {deliverables.length === 0 ? (
            <p className="text-sm text-fg-muted">No deliverables flagged on this phase.</p>
          ) : (
            <>
              <ProgressBar
                value={counted.length > 0 ? Math.round((delivered / counted.length) * 100) : 0}
                size="sm"
                className="mb-2"
                label="Deliverables done"
              />
              <ul className="space-y-1.5">
                {deliverables.map((task) => {
                  const done = task.status === "done";
                  const cancelled = task.status === "cancelled";
                  return (
                    <li key={task.id} className="flex min-w-0 items-start gap-2 text-sm">
                      {done ? (
                        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      ) : (
                        <CircleDashed className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="mr-1.5 font-mono text-[11px] text-fg-subtle">{task.key}</span>
                        <span className={cn("[overflow-wrap:anywhere]", cancelled ? "text-fg-muted line-through" : "text-fg")}>
                          {task.title}
                        </span>
                        <span className="sr-only">, {TASK_STATUS_CONFIG[task.status].label}</span>
                        {task.approved_by_name ? (
                          <span className="block text-xs text-success">Approved by {task.approved_by_name}</span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <section aria-labelledby={`${uid}-metrics`}>
          <SectionTitle icon={Target} aside={metrics.length > 0 ? `${met} of ${metrics.length} met` : undefined}>
            <span id={`${uid}-metrics`}>Scorecard</span>
          </SectionTitle>
          {metrics.length === 0 ? (
            <p className="text-sm text-fg-muted">No success metrics on this project.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {metrics.map((metric) => (
                <li key={metric.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
                  <span className="min-w-0 text-sm text-fg [overflow-wrap:anywhere]">{metric.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-fg-muted">
                      {formatMetricValue(metric.current, metric.unit)}
                      <span className="text-fg-subtle"> / {metric.direction === "higher" ? "≥" : "≤"} {formatMetricValue(metric.target, metric.unit)}</span>
                    </span>
                    <MetricStatusBadge isMet={metric.is_met} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby={`${uid}-champion`}>
          <SectionTitle icon={FlaskConical}>
            <span id={`${uid}-champion`}>Champion eval run</span>
          </SectionTitle>
          {champion ? (
            <div className="rounded-xl border border-border px-3 py-2.5">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <Star className="size-3.5 text-accent-2" aria-hidden />
                <span className="font-medium text-fg [overflow-wrap:anywhere]">{champion.label}</span>
                {champion.external_url && isHttpUrl(champion.external_url) ? (
                  <a
                    href={champion.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded text-xs text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Open
                    <ExternalLink className="size-3" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-fg-muted [overflow-wrap:anywhere]">
                {[champion.model_name, champion.prompt_version && `prompt ${champion.prompt_version}`, champion.dataset_version && `data ${champion.dataset_version}`]
                  .filter(Boolean)
                  .join(" · ") || "No model details"}
                {" · "}
                {formatDate(champion.created_at)}
              </p>
              {championMetrics.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Champion metrics">
                  {championMetrics.slice(0, 8).map(([name, value]) => {
                    const scorecard = metrics.find((metric) => metric.name.toLowerCase() === name.toLowerCase());
                    return (
                      <li
                        key={name}
                        className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2 text-xs text-fg-muted ring-1 ring-inset ring-border"
                      >
                        <span className="max-w-[12rem] truncate">{name}</span>
                        <span className="font-semibold tabular-nums text-fg">
                          {formatMetricValue(value, scorecard?.unit ?? "")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-fg-muted">No champion run yet. Promote the best eval run on the Evals tab.</p>
          )}
        </section>

        <section aria-labelledby={`${uid}-risks`}>
          <SectionTitle icon={ShieldAlert} aside={`${review.open_risk_count} open`}>
            <span id={`${uid}-risks`}>Open high risks</span>
          </SectionTitle>
          {highRisks.length === 0 ? (
            <p className="flex items-center gap-1.5 text-sm text-fg-muted">
              <CircleCheck className="size-4 text-success" aria-hidden />
              No open risks scored 15 or more.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {highRisks.map((risk) => (
                <li key={risk.id} className="flex min-w-0 items-start gap-2 rounded-xl border border-danger/25 px-3 py-2">
                  <RiskScore score={risk.score} />
                  <span className="min-w-0 flex-1 text-sm text-fg [overflow-wrap:anywhere]">{risk.title}</span>
                  {risk.owner ? <UserAvatar user={risk.owner} size="xs" /> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <fieldset className="space-y-3" aria-describedby={errors.decision ? `${fid("decision")}-error` : undefined}>
        <legend className="mb-2 text-sm font-semibold text-fg">Decision</legend>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {GATE_DECISIONS.map((decision) => {
            const config = GATE_DECISION_CONFIG[decision];
            const Icon = DECISION_ICON[decision];
            const selected = form.decision === decision;
            const disabled = decision === "extend" && !review.can_extend;
            const detail =
              decision === "go"
                ? review.next_phase
                  ? `Starts ${review.next_phase.name}.`
                  : "Completes the phase."
                : decision === "extend"
                  ? disabled
                    ? "Already used for this phase."
                    : "Sets a new due date."
                  : "No later phase starts.";
            return (
              <label
                key={decision}
                className={cn(
                  "relative flex cursor-pointer flex-col gap-1 rounded-2xl border bg-surface p-3.5 transition-control",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  selected ? DECISION_STYLE[decision].selected : "border-border hover:border-border-strong hover:bg-surface-2/60",
                  disabled && "cursor-not-allowed opacity-55 hover:border-border hover:bg-surface",
                )}
              >
                <input
                  type="radio"
                  name={`${uid}-decision`}
                  value={decision}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onChange("decision", decision)}
                  className="sr-only"
                />
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <Icon className={cn("size-4", DECISION_STYLE[decision].icon)} aria-hidden />
                    {config.label}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 items-center justify-center rounded-full border transition-control",
                      selected ? "border-transparent bg-fg" : "border-input-border",
                    )}
                  >
                    {selected ? <span className="size-1.5 rounded-full bg-surface" /> : null}
                  </span>
                </span>
                <span className="text-xs leading-4 text-fg-muted">{config.description}</span>
                <span className="text-xs font-medium text-fg">{detail}</span>
              </label>
            );
          })}
        </div>
        {errors.decision ? (
          <p id={`${fid("decision")}-error`} role="alert" className="text-xs font-medium text-danger">
            {errors.decision}
          </p>
        ) : null}
      </fieldset>

      {form.decision === "go" ? (
        <Reveal key="go">
          <FormField
            label="Conditions"
            htmlFor={fid("conditions")}
            hint="Optional. Recorded as Go with conditions, e.g. what must hold during the next phase."
          >
            <Textarea
              id={fid("conditions")}
              rows={2}
              maxLength={GATE_TEXT_MAX}
              value={form.conditions}
              aria-describedby={describedBy("conditions", true)}
              onChange={(event) => onChange("conditions", event.target.value)}
              placeholder="What must hold during the next phase."
            />
          </FormField>
        </Reveal>
      ) : null}

      {form.decision === "extend" ? (
        <Reveal key="extend" className="grid gap-4 sm:grid-cols-2">
          <FormField label="Fix list" htmlFor={fid("fix_list")} error={errors.fix_list} required className="sm:col-span-2">
            <Textarea
              id={fid("fix_list")}
              rows={3}
              maxLength={GATE_TEXT_MAX}
              value={form.fix_list}
              invalid={Boolean(errors.fix_list)}
              aria-describedby={describedBy("fix_list")}
              onChange={(event) => onChange("fix_list", event.target.value)}
              placeholder={"Raise containment above 65% on the golden set.\nClose the PII redaction gap."}
            />
          </FormField>
          <FormField
            label="New due date"
            htmlFor={fid("new_due_date")}
            error={errors.new_due_date}
            required
            hint={milestone.due_date ? `Currently due ${formatDate(milestone.due_date)}.` : undefined}
          >
            <Input
              id={fid("new_due_date")}
              type="date"
              min={milestone.start_date && milestone.start_date > review.today ? milestone.start_date : review.today}
              value={form.new_due_date}
              invalid={Boolean(errors.new_due_date)}
              aria-describedby={describedBy("new_due_date", Boolean(milestone.due_date))}
              onChange={(event) => onChange("new_due_date", event.target.value)}
            />
          </FormField>
        </Reveal>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Client sign-off name" htmlFor={fid("signoff_name")} hint="Who signed off on the client side (UAT).">
          <Input
            id={fid("signoff_name")}
            maxLength={GATE_SIGNOFF_NAME_MAX}
            value={form.client_signoff_name}
            autoComplete="off"
            aria-describedby={describedBy("signoff_name", true)}
            onChange={(event) => onChange("client_signoff_name", event.target.value)}
            placeholder="Name and role of the client approver"
          />
        </FormField>
        <FormField label="Sign-off date" htmlFor={fid("signoff_date")}>
          <Input
            id={fid("signoff_date")}
            type="date"
            value={form.client_signoff_date}
            onChange={(event) => onChange("client_signoff_date", event.target.value)}
          />
        </FormField>
        <FormField
          label="Evidence link"
          htmlFor={fid("evidence_url")}
          error={errors.evidence_url}
          hint="Sign-off email, UAT report or demo recording (http or https)."
          className="sm:col-span-2"
        >
          <Input
            id={fid("evidence_url")}
            type="url"
            inputMode="url"
            maxLength={EVIDENCE_URL_MAX}
            value={form.evidence_url}
            invalid={Boolean(errors.evidence_url)}
            aria-describedby={describedBy("evidence_url", true)}
            onChange={(event) => onChange("evidence_url", event.target.value)}
            placeholder="https://"
          />
        </FormField>
        <FormField label="Notes" htmlFor={fid("notes")} className="sm:col-span-2">
          <Textarea
            id={fid("notes")}
            rows={2}
            maxLength={GATE_TEXT_MAX}
            value={form.notes}
            onChange={(event) => onChange("notes", event.target.value)}
            placeholder="Why this decision, in a sentence or two."
          />
        </FormField>
      </div>

      <details className="group rounded-2xl border border-border bg-surface-2/40 px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-sm font-medium text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <History className="size-4 text-fg-muted" aria-hidden />
          Gate record and decision history
          <span className="ml-auto text-xs tabular-nums text-fg-muted">{review.history.length}</span>
        </summary>
        <GateFields milestone={milestone} history={review.history} className="mt-4" />
      </details>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button type="submit" disabled={!form.decision}>
          Review decision
        </Button>
      </DialogFooter>
    </form>
  );
}

interface ConfirmStepProps {
  review: GateReview;
  form: FormValues;
  decision: GateDecision;
  pending: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

/** Scrolls the dialog body back to the top when a step mounts (steps differ in length). */
function useScrollToTop() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start" });
  }, []);
  return ref;
}

function ConfirmStep({ review, form, decision, pending, onBack, onSubmit }: ConfirmStepProps) {
  const topRef = useScrollToTop();
  const { milestone } = review;
  const counted = review.deliverables.filter((task) => task.status !== "cancelled");
  const openDeliverables = counted.filter((task) => task.status !== "done").length;
  const unmet = review.metrics.filter((metric) => metric.is_met !== true).length;
  const conditions = form.conditions.trim();

  const effect =
    decision === "go"
      ? review.next_phase
        ? `${milestone.name} is marked done and ${review.next_phase.name} becomes the active phase.`
        : `${milestone.name} is marked done.`
      : decision === "extend"
        ? `${milestone.name} goes back to active, due ${formatDate(form.new_due_date)}. This uses its one extension.`
        : `${milestone.name} is stopped. No later phase starts.`;

  const warnings: string[] = [];
  if (decision === "go") {
    if (openDeliverables > 0) warnings.push(`${openDeliverables} ${openDeliverables === 1 ? "deliverable is" : "deliverables are"} not done.`);
    if (unmet > 0) warnings.push(`${unmet} ${unmet === 1 ? "metric is" : "metrics are"} not met or not measured.`);
    if (review.open_high_risks.length > 0) {
      warnings.push(`${review.open_high_risks.length} high ${review.open_high_risks.length === 1 ? "risk is" : "risks are"} still open.`);
    }
  }
  if (decision !== "stop" && !form.client_signoff_name.trim()) warnings.push("No client sign-off recorded.");
  if (!form.evidence_url.trim()) warnings.push("No evidence link.");

  return (
    <Reveal className="space-y-5">
      <div ref={topRef} className="rounded-2xl border border-border bg-surface-2/50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <GateDecisionBadge decision={decision} className="h-6 px-2.5 text-sm" />
          {decision === "go" && conditions ? <Badge tone="blue">With conditions</Badge> : null}
          <span className="text-sm font-medium text-fg">on {milestone.name}</span>
        </div>
        <p className="mt-2 text-sm text-fg">{effect}</p>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          {decision === "go" && conditions ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-fg-muted">Conditions</dt>
              <dd className="whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">{conditions}</dd>
            </div>
          ) : null}
          {decision === "extend" ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-fg-muted">Fix list</dt>
              <dd className="whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">{form.fix_list.trim()}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-fg-muted">Client sign-off</dt>
            <dd className="text-fg">
              {form.client_signoff_name.trim() || "—"}
              {form.client_signoff_date ? <span className="text-fg-muted">, {formatDate(form.client_signoff_date)}</span> : null}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-fg-muted">Evidence</dt>
            <dd className="truncate text-fg">{form.evidence_url.trim() || "—"}</dd>
          </div>
        </dl>
      </div>

      {warnings.length > 0 ? (
        <div className="rounded-2xl bg-warning/10 px-4 py-3 ring-1 ring-inset ring-warning/30">
          <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
            <TriangleAlert className="size-4 text-warning" aria-hidden />
            Before you confirm
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-sm text-fg-muted">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-fg-muted">
        The decision, a snapshot of the scorecard and the sign-off are saved to the decision history, and the project&apos;s
        owner, members and watchers are notified.
      </p>

      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={onBack}>
          <ArrowLeft aria-hidden />
          Back
        </Button>
        <Button variant={decision === "stop" ? "danger" : "primary"} loading={pending} onClick={onSubmit}>
          Record {GATE_DECISION_CONFIG[decision].label}
        </Button>
      </DialogFooter>
    </Reveal>
  );
}
