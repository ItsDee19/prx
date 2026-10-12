"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleDashed, ClipboardCopy, Lock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteStatusUpdateAction, updateStatusUpdateAction } from "@/actions/status-updates";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/input";
import { RagDot } from "@/components/ui/rag-dot";
import { TimeAgo } from "@/components/ui/time-ago";
import { RAG_CONFIG, RAG_DIMENSIONS } from "@/lib/constants";
import type { ClientSummary, RagHealth, StatusUpdate } from "@/lib/types";
import { cn, formatDate, formatMetricValue, mentionsToPlainText } from "@/lib/utils";
import { ChangeChips } from "./change-chips";
import { copyText } from "./copy-text";
import { formatClientUpdate } from "./format-client-update";
import { UpdateForm, valuesFromUpdate, type UpdateFormInput } from "./update-form";

export interface UpdateCardProps {
  update: StatusUpdate;
  project: { id: string; name: string; client: ClientSummary | null };
  /** Author or admin. */
  canEdit: boolean;
  /** The newest update (drives project health). */
  isLatest?: boolean;
  className?: string;
}

const RIBBON: Record<RagHealth, string> = {
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-danger",
};

const SECTIONS = [
  { key: "done", label: "Done" },
  { key: "next", label: "Next" },
  { key: "blockers", label: "Blockers" },
  { key: "client_asks", label: "Client asks" },
] as const;

/**
 * One update in the feed: health ribbon on the left edge, headline, optional
 * dimension RAGs, change chips, sections, scorecard snapshot, author and time.
 * Menu: Copy for client (everyone), Edit and Delete (author or admin).
 */
export function UpdateCard({ update, project, canEdit, isLatest = false, className }: UpdateCardProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const edited = update.updated_at !== update.created_at;
  const dimensions = RAG_DIMENSIONS.filter((dimension) => update[dimension.key] !== null);
  const sections = SECTIONS.filter((section) => update[section.key].trim().length > 0);

  async function copyForClient() {
    const text = formatClientUpdate(update, project);
    if (await copyText(text)) toast.success("Copied a client-ready summary. Budget and internal notes are left out.");
    else setManualCopy(text);
  }

  function save(input: UpdateFormInput) {
    startSaving(async () => {
      const result = await updateStatusUpdateAction(update.id, input);
      if (!result.ok) {
        setServerErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setServerErrors({});
      setEditOpen(false);
      toast.success("Update saved.");
      router.refresh();
    });
  }

  function remove() {
    startDeleting(async () => {
      const result = await deleteStatusUpdateAction(update.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setConfirmOpen(false);
      toast.success("Update deleted.");
      router.refresh();
    });
  }

  return (
    <article
      aria-labelledby={`update-${update.id}-headline`}
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-card",
        className,
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", RIBBON[update.health])} />
      <div className="space-y-4 py-4 pl-5 pr-3 sm:py-5 sm:pl-6 sm:pr-4">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <RagDot health={update.health} showLabel size="md" />
              <span className="text-xs text-fg-muted">Week of {formatDate(update.week_of)}</span>
              {isLatest ? (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-soft-fg">
                  Latest
                </span>
              ) : null}
            </div>
            <h3
              id={`update-${update.id}-headline`}
              className="text-base font-semibold leading-6 tracking-[-0.011em] text-fg [overflow-wrap:anywhere]"
            >
              {update.headline}
            </h3>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Update actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={copyForClient}>
                <ClipboardCopy aria-hidden />
                Copy for client
              </DropdownMenuItem>
              {canEdit ? (
                <>
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                    <Pencil aria-hidden />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
                    <Trash2 aria-hidden />
                    Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {dimensions.length > 0 ? (
          <dl className="flex flex-wrap gap-x-4 gap-y-1.5">
            {dimensions.map((dimension) => {
              const health = update[dimension.key];
              return health ? (
                <div key={dimension.key} className="flex items-center gap-1.5 text-xs">
                  <dt className="text-fg-muted">{dimension.label}</dt>
                  <dd>
                    <RagDot health={health} showLabel />
                  </dd>
                </div>
              ) : null;
            })}
          </dl>
        ) : null}

        <ChangeChips changes={update.changes} />

        {sections.length > 0 ? (
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
            {sections.map((section) => (
              <section key={section.key} className="min-w-0">
                <h4
                  className={cn(
                    "text-xs font-semibold uppercase tracking-[0.04em]",
                    section.key === "blockers" ? "text-danger" : "text-fg-muted",
                  )}
                >
                  {section.label}
                </h4>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-fg [overflow-wrap:anywhere]">
                  {mentionsToPlainText(update[section.key])}
                </p>
              </section>
            ))}
          </div>
        ) : null}

        {update.internal_notes.trim() ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-2/50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
              <Lock aria-hidden className="size-3.5" />
              Internal notes
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-fg [overflow-wrap:anywhere]">
              {mentionsToPlainText(update.internal_notes)}
            </p>
          </div>
        ) : null}

        {update.metrics_snapshot.length > 0 ? (
          <div className="min-w-0">
            <h4 className="text-xs font-semibold uppercase tracking-[0.04em] text-fg-muted">Scorecard at posting</h4>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {update.metrics_snapshot.map((metric) => (
                <li
                  key={metric.name}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface-2/50 px-2 py-1 text-xs"
                >
                  {metric.is_met ? (
                    <CircleCheck aria-hidden className="size-3.5 shrink-0 text-success" />
                  ) : (
                    <CircleDashed aria-hidden className="size-3.5 shrink-0 text-fg-subtle" />
                  )}
                  <span className="truncate font-medium text-fg">{metric.name}</span>
                  <span className="tabular-nums text-fg-muted">
                    {formatMetricValue(metric.current, metric.unit)}
                    <span className="text-fg-subtle"> / {formatMetricValue(metric.target, metric.unit)}</span>
                  </span>
                  <span className="sr-only">
                    {metric.is_met === null ? "not measured" : metric.is_met ? "met" : "not met"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
          {update.author ? (
            <>
              <UserAvatar user={update.author} size="xs" />
              <span className="font-medium text-fg">{update.author.name}</span>
            </>
          ) : (
            <span>Former member</span>
          )}
          <span aria-hidden>·</span>
          <TimeAgo date={update.created_at} />
          {edited ? (
            <span>
              (edited <TimeAgo date={update.updated_at} />)
            </span>
          ) : null}
        </footer>
      </div>

      {canEdit ? (
        <Dialog open={editOpen} onOpenChange={(next) => (saving ? undefined : setEditOpen(next))}>
          <DialogContent
            size="lg"
            title="Edit status update"
            description={`Week of ${formatDate(update.week_of)}. What changed since the previous update stays as posted.`}
          >
            {editOpen ? (
              <UpdateForm
                projectId={project.id}
                initial={valuesFromUpdate(update)}
                submitLabel="Save update"
                pending={saving}
                serverErrors={serverErrors}
                onSubmit={save}
                onCancel={() => setEditOpen(false)}
                inDialog
              />
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={(next) => (deleting ? undefined : setConfirmOpen(next))}>
        <DialogContent
          size="sm"
          title="Delete this update?"
          description={`The ${RAG_CONFIG[update.health].label.toLowerCase()} update for the week of ${formatDate(update.week_of)} will be removed.${isLatest ? " Project health falls back to the previous update." : ""}`}
        >
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="danger" loading={deleting} onClick={remove}>
              Delete update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualCopy !== null} onOpenChange={(next) => (next ? undefined : setManualCopy(null))}>
        <DialogContent
          size="lg"
          title="Copy for client"
          description="Your browser blocked automatic copying. Select the text and copy it."
        >
          <Textarea
            readOnly
            aria-label="Client-ready summary"
            value={manualCopy ?? ""}
            rows={14}
            onFocus={(event) => event.currentTarget.select()}
            autoFocus
            className="font-mono"
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
