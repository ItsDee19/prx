"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { createStatusUpdateAction } from "@/actions/status-updates";
import { Reveal } from "@/components/motion";
import { Button } from "@/components/ui/button";
import type { StatusUpdateDraft } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { ChangeChips } from "./change-chips";
import { EMPTY_UPDATE_VALUES, UpdateForm, type UpdateFormInput, type UpdateFormValues } from "./update-form";

export interface UpdateComposerProps {
  projectId: string;
  draft: StatusUpdateDraft;
  /** `?compose=1`: open with the headline focused. */
  autoOpen: boolean;
  /** isUpdateDue() for the project (workspace timezone and cadence). */
  updateDue: boolean;
  cadenceDays: number;
}

function initialValues(draft: StatusUpdateDraft): UpdateFormValues {
  return {
    ...EMPTY_UPDATE_VALUES,
    // Start from last week's overall health; the budget RAG starts from the hours-burn suggestion.
    health: draft.last_update?.health ?? null,
    budget_rag: draft.suggested_budget_rag,
  };
}

/**
 * Weekly update composer at the top of the Updates tab. Collapsed it is a
 * prompt (with "Update due" when the cadence has passed); open it shows the
 * auto-computed changes since the last update above the form. Posting sets
 * the project's health and notifies its watchers.
 */
export function UpdateComposer({ projectId, draft, autoOpen, updateDue, cadenceDays }: UpdateComposerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(autoOpen);
  const [formKey, setFormKey] = useState(0);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const openButton = useRef<HTMLButtonElement>(null);
  const postedThisWeek = draft.last_update?.week_of === draft.week_of;

  // A `?compose=1` deep link opens the composer once; drop the flag so a refresh or Back does not reopen it.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (!autoOpen || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    setOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has("compose")) return;
    params.delete("compose");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [autoOpen, pathname, router, searchParams]);

  function close() {
    setOpen(false);
    setServerErrors({});
    requestAnimationFrame(() => openButton.current?.focus());
  }

  function submit(input: UpdateFormInput) {
    startTransition(async () => {
      const result = await createStatusUpdateAction({ project_id: projectId, ...input });
      if (!result.ok) {
        setServerErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setServerErrors({});
      setFormKey((key) => key + 1);
      setOpen(false);
      toast.success("Update posted. Watchers have been notified.");
      router.refresh();
    });
  }

  const lastLabel = draft.last_update
    ? `Last update: week of ${formatDate(draft.last_update.week_of)}.`
    : "No updates yet.";

  if (!open) {
    return (
      <div
        className={cn(
          "flex flex-col gap-3 rounded-2xl border bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:p-5",
          updateDue ? "border-warning/40" : "border-border",
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              updateDue ? "bg-warning/12 text-warning" : "bg-accent-soft text-accent",
            )}
          >
            {updateDue ? <Clock className="size-5" /> : <NotebookPen className="size-5" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">
              {updateDue
                ? "Update due"
                : postedThisWeek
                  ? "This week's update is posted"
                  : "Post this week's update"}
            </p>
            <p className="mt-0.5 text-sm text-fg-muted [overflow-wrap:anywhere]">
              {lastLabel}{" "}
              {updateDue
                ? `Active projects get an update every ${cadenceDays} ${cadenceDays === 1 ? "day" : "days"}.`
                : "PRX adds what changed since then."}
            </p>
          </div>
        </div>
        <Button
          ref={openButton}
          variant={updateDue || !postedThisWeek ? "primary" : "outline"}
          onClick={() => setOpen(true)}
        >
          {postedThisWeek ? "Post another update" : "Write update"}
        </Button>
      </div>
    );
  }

  return (
    <Reveal y={6} className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-6">
      <section aria-labelledby="update-composer-heading">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="update-composer-heading" className="text-base font-semibold text-fg">
            Status update · week of {formatDate(draft.week_of)}
          </h2>
          {postedThisWeek ? (
            <p className="text-xs text-fg-muted">This week already has an update. Posting again keeps both.</p>
          ) : null}
        </div>
        <UpdateForm
          key={formKey}
          projectId={projectId}
          initial={initialValues(draft)}
          suggestedBudgetRag={draft.suggested_budget_rag}
          carryOverNext={draft.last_update?.next.trim() ? draft.last_update.next : null}
          submitLabel="Post update"
          pending={pending}
          serverErrors={serverErrors}
          onSubmit={submit}
          onCancel={close}
          autoFocusHeadline={autoOpen}
          header={
            <div className="rounded-xl border border-border bg-surface-2/50 p-3">
              <p className="text-xs font-medium text-fg-muted">
                {draft.changes.since
                  ? `Since the last update (${formatDate(draft.changes.since)}), added automatically`
                  : "Since the project started, added automatically"}
              </p>
              <ChangeChips
                changes={draft.changes}
                emptyLabel="No completed tasks, phase moves or new risks yet."
                className="mt-2"
              />
              <p className="mt-2 text-xs tabular-nums text-fg-subtle">
                Progress {draft.changes.progress_to}%
                {draft.changes.due_date_to ? ` · due ${formatDate(draft.changes.due_date_to)}` : ""}
              </p>
            </div>
          }
        />
      </section>
    </Reveal>
  );
}
