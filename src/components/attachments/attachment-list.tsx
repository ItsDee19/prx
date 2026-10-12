"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { MessageSquare, Pin } from "lucide-react";
import { TaskLink } from "@/components/tasks/task-link";
import { Stagger, StaggerItem } from "@/components/motion";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TimeAgo } from "@/components/ui/time-ago";
import { Tooltip } from "@/components/ui/tooltip";
import { LINK_TYPE_CONFIG } from "@/lib/constants";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AttachmentActions } from "./attachment-actions";
import { AttachmentIcon } from "./attachment-icon";
import {
  canDeleteAttachment,
  canPinAttachment,
  fileTypeInfo,
  formatBytes,
  hostOf,
  isImageMime,
  type AttachmentView,
} from "./attachment-utils";

export interface AttachmentListProps {
  attachments: Attachment[];
  view?: AttachmentView;
  viewerId: string;
  /** Admin or project owner: may delete every attachment (others only their own). */
  canManageAll: boolean;
  /** Task key and title per task id: task attachments link to their task. */
  taskRefs?: Record<string, { key: string; title: string }>;
  /** Request link favicons (off for confidential clients). */
  favicons?: boolean;
  /** Denser rows for the task drawer. */
  dense?: boolean;
  /** After any change (rename, pin, delete); defaults to nothing (the caller refreshes). */
  onChanged?: () => void;
  className?: string;
}

/**
 * Links and files as a grid of tiles (image thumbnails for pictures) or a list
 * of rows, each with an overflow menu (open, copy, download, edit, pin,
 * delete). Deletes hide the row at once; edits show the saved values at once.
 */
export function AttachmentList({
  attachments,
  view = "list",
  viewerId,
  canManageAll,
  taskRefs = {},
  favicons = true,
  dense = false,
  onChanged,
  className,
}: AttachmentListProps) {
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [edited, setEdited] = useState<Record<string, Attachment>>({});
  const [synced, setSynced] = useState(attachments);
  if (synced !== attachments) {
    setSynced(attachments);
    setEdited({});
  }

  const visible = attachments.filter((item) => !removed.has(item.id)).map((item) => edited[item.id] ?? item);

  const itemProps = (attachment: Attachment) => ({
    attachment,
    favicons,
    taskRef: attachment.task_id ? taskRefs[attachment.task_id] : undefined,
    actions: (
      <AttachmentActions
        attachment={attachment}
        canDelete={canDeleteAttachment(attachment, { viewerId, canManageAll })}
        canPin={canPinAttachment(attachment)}
        onUpdated={(saved) => {
          setEdited((current) => ({ ...current, [saved.id]: saved }));
          onChanged?.();
        }}
        onDeleted={(id) => {
          setRemoved((current) => new Set(current).add(id));
          onChanged?.();
        }}
        className="relative z-10"
      />
    ),
  });

  if (view === "grid") {
    return (
      <Stagger as="ul" className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6", className)}>
        {visible.map((attachment) => (
          <StaggerItem as="li" key={attachment.id} className="min-w-0">
            <AttachmentTile {...itemProps(attachment)} />
          </StaggerItem>
        ))}
      </Stagger>
    );
  }

  return (
    <Stagger as="ul" className={cn(dense ? "-mx-1.5 space-y-0.5" : "divide-y divide-border rounded-2xl border border-border bg-surface", className)}>
      {visible.map((attachment) => (
        <StaggerItem as="li" key={attachment.id} className="min-w-0">
          <AttachmentRow {...itemProps(attachment)} dense={dense} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}

interface ItemProps {
  attachment: Attachment;
  favicons: boolean;
  taskRef?: { key: string; title: string };
  actions: ReactNode;
}

/** Hover-revealed on fine pointers from sm; always visible on touch and while focused or open. */
const REVEAL =
  "shrink-0 transition-opacity duration-(--dur-2) sm:opacity-0 sm:group-hover/item:opacity-100 sm:group-focus-within/item:opacity-100 sm:has-[[data-state=open]]:opacity-100 pointer-coarse:opacity-100";

/** "PDF · 1.2 MB" for files, the host for links. */
function metaText(attachment: Attachment): string {
  if (attachment.kind === "file") {
    const { label } = fileTypeInfo(attachment.mime_type, attachment.name);
    const size = formatBytes(attachment.size_bytes);
    return size ? `${label} · ${size}` : label;
  }
  return hostOf(attachment.url) || attachment.url;
}

function TypeBadge({ attachment }: { attachment: Attachment }) {
  if (attachment.kind === "file") return null;
  const config = LINK_TYPE_CONFIG[attachment.link_type ?? "other"];
  return (
    <Badge tone={config.tone} className="shrink-0">
      {config.label}
    </Badge>
  );
}

function Context({ attachment, taskRef }: { attachment: Attachment; taskRef?: { key: string; title: string } }) {
  if (taskRef) {
    return (
      <Tooltip content={taskRef.title}>
        <span className="relative z-10 inline-flex">
          <TaskLink
            taskKey={taskRef.key}
            aria-label={`Open ${taskRef.key}: ${taskRef.title}`}
            className="rounded-md font-mono text-[11px] text-fg-muted outline-none hover:text-fg hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {taskRef.key}
          </TaskLink>
        </span>
      </Tooltip>
    );
  }
  if (attachment.comment_id) {
    return (
      <span className="inline-flex items-center gap-1 text-fg-subtle">
        <MessageSquare aria-hidden className="size-3" />
        <span>Comment</span>
      </span>
    );
  }
  return null;
}

function PinnedMark() {
  return (
    <span className="inline-flex shrink-0 items-center text-accent" title="Pinned to Key links">
      <Pin aria-hidden className="size-3.5" />
      <span className="sr-only">Pinned to Key links</span>
    </span>
  );
}

/** The whole row/tile opens the attachment (stretched link); the menu and task link sit above it. */
function OpenLink({ attachment, className }: { attachment: Attachment; className?: string }) {
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "min-w-0 truncate font-medium text-fg outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-['']",
        "focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset",
        className,
      )}
    >
      {attachment.name}
      <span className="sr-only">{attachment.kind === "file" ? " (file, opens in a new tab)" : " (opens in a new tab)"}</span>
    </a>
  );
}

function AttachmentRow({ attachment, favicons, taskRef, actions, dense }: ItemProps & { dense: boolean }) {
  return (
    <div
      className={cn(
        "group/item relative flex min-w-0 items-center gap-3 transition-[background-color] duration-(--dur-2) hover:bg-surface-2/60",
        dense ? "min-h-11 rounded-[10px] px-1.5 py-1" : "px-4 py-3 first:rounded-t-2xl last:rounded-b-2xl",
      )}
    >
      <AttachmentIcon attachment={attachment} size={dense ? "sm" : "md"} favicon={favicons} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <OpenLink attachment={attachment} />
          {attachment.pinned ? <PinnedMark /> : null}
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
          <span className="min-w-0 truncate tabular-nums">{metaText(attachment)}</span>
          <Context attachment={attachment} taskRef={taskRef} />
          {dense ? null : (
            <span className="inline-flex items-center gap-1.5 text-fg-subtle sm:hidden">
              <TimeAgo date={attachment.created_at} />
            </span>
          )}
        </div>
      </div>
      {dense ? null : (
        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          <TypeBadge attachment={attachment} />
          {attachment.uploader ? (
            <Tooltip content={`Added by ${attachment.uploader.name}`}>
              <span className="relative z-10 inline-flex">
                <UserAvatar user={attachment.uploader} size="xs" />
                <span className="sr-only">Added by {attachment.uploader.name}</span>
              </span>
            </Tooltip>
          ) : null}
          <TimeAgo date={attachment.created_at} className="w-20 text-right text-xs text-fg-subtle" />
        </div>
      )}
      <div className={REVEAL}>{actions}</div>
    </div>
  );
}

function AttachmentTile({ attachment, favicons, taskRef, actions }: ItemProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const showThumb = attachment.kind === "file" && isImageMime(attachment.mime_type) && !thumbFailed;
  return (
    <div
      className={cn(
        "group/item relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card",
        "transition-[translate,box-shadow,border-color] duration-(--dur-2) ease-out-quart hover:-translate-y-0.5 hover:border-border-strong hover:shadow-pop",
        "motion-reduce:hover:translate-y-0",
      )}
    >
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-border bg-surface-2/60">
        {showThumb ? (
          <Image
            src={attachment.url}
            alt=""
            fill
            unoptimized
            loading="lazy"
            sizes="(min-width: 1920px) 16vw, (min-width: 1024px) 25vw, 50vw"
            className="object-cover transition-transform duration-(--dur-4) ease-out-expo group-hover/item:scale-[1.03] motion-reduce:group-hover/item:scale-100"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <>
            <div
              aria-hidden
              className="absolute inset-0 bg-size-[16px_16px] bg-[linear-gradient(to_right,var(--grid-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-line)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]"
            />
            <AttachmentIcon attachment={attachment} size="lg" favicon={favicons} className="bg-surface shadow-card" />
          </>
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1">
          {attachment.kind === "link" ? <TypeBadge attachment={attachment} /> : null}
          {attachment.pinned ? (
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-surface/90 shadow-card">
              <PinnedMark />
            </span>
          ) : null}
        </div>
        <div className={cn("absolute right-1.5 top-1.5 z-10 rounded-full bg-surface/85 backdrop-blur-sm", REVEAL)}>
          {actions}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5">
        <div className="flex min-w-0 text-sm">
          <OpenLink attachment={attachment} />
        </div>
        <div className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
          <span className="min-w-0 truncate tabular-nums">{metaText(attachment)}</span>
          <Context attachment={attachment} taskRef={taskRef} />
        </div>
      </div>
    </div>
  );
}
