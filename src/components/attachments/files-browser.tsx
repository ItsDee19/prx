"use client";

import { useRef, useState, type DragEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Info, LayoutGrid, Link2, List, Lock, Paperclip, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { Attachment, AttachmentKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AddLinkDialog } from "./add-link-dialog";
import { AttachmentList } from "./attachment-list";
import { MAX_UPLOAD_LABEL, UPLOAD_ACCEPT, type AttachmentView } from "./attachment-utils";
import { UploadProgressList } from "./upload-progress-list";
import { useAttachmentUpload } from "./use-attachment-upload";

export interface FilesBrowserProps {
  projectId: string;
  attachments: Attachment[];
  taskRefs: Record<string, { key: string; title: string }>;
  viewerId: string;
  isAdmin: boolean;
  /** Admin or project owner (may delete anything). */
  canManageAll: boolean;
  blobEnabled: boolean;
  /** Set when the project's client is confidential. */
  confidentialClient: { name: string; code: string } | null;
  view: AttachmentView;
}

type KindFilter = "all" | AttachmentKind;

/** Show the search box once a project has this many attachments. */
const SEARCH_THRESHOLD = 8;

/**
 * The Files tab body: filter (all / links / files), grid or list (`?view=`),
 * add link, and, when Vercel Blob is configured, upload with a drop zone and
 * per-file progress. Without Blob it offers links only and says why.
 */
export function FilesBrowser({
  projectId,
  attachments,
  taskRefs,
  viewerId,
  isAdmin,
  canManageAll,
  blobEnabled,
  confidentialClient,
  view,
}: FilesBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [currentView, setCurrentView] = useState<AttachmentView>(view);

  const { items, start, dismiss } = useAttachmentUpload({
    projectId,
    onBatchDone: (uploaded) => {
      if (uploaded.length > 0) router.refresh();
    },
  });

  function changeView(next: AttachmentView) {
    setCurrentView(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function openPicker() {
    fileInput.current?.click();
  }

  const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

  const dropHandlers = blobEnabled
    ? {
        onDragEnter: (event: DragEvent<HTMLElement>) => {
          if (!isFileDrag(event)) return;
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        },
        onDragOver: (event: DragEvent<HTMLElement>) => {
          if (!isFileDrag(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: (event: DragEvent<HTMLElement>) => {
          if (!isFileDrag(event)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
          if (!isFileDrag(event)) return;
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          void start(event.dataTransfer.files);
        },
      }
    : {};

  const linkCount = attachments.filter((item) => item.kind === "link").length;
  const fileCount = attachments.length - linkCount;
  const needle = query.trim().toLowerCase();
  const filtered = attachments.filter(
    (item) =>
      (kind === "all" || item.kind === kind) &&
      (!needle || item.name.toLowerCase().includes(needle) || item.url.toLowerCase().includes(needle)),
  );

  const addLink = (
    <AddLinkDialog
      projectId={projectId}
      onAdded={() => router.refresh()}
      trigger={
        <Button variant={blobEnabled ? "outline" : "primary"}>
          <Link2 aria-hidden />
          Add link
        </Button>
      }
    />
  );
  const uploadButton = blobEnabled ? (
    <Button onClick={openPicker}>
      <Upload aria-hidden />
      Upload files
    </Button>
  ) : null;

  return (
    <section aria-label="Files and links" className="relative min-w-0" {...dropHandlers}>
      {blobEnabled ? (
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const files = event.target.files;
            if (files && files.length > 0) void start(files);
            event.target.value = "";
          }}
        />
      ) : null}

      {attachments.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SegmentedControl<KindFilter>
            value={kind}
            onChange={setKind}
            ariaLabel="Show"
            size="sm"
            options={[
              { value: "all", label: `All ${attachments.length}` },
              { value: "link", label: `Links ${linkCount}` },
              { value: "file", label: `Files ${fileCount}` },
            ]}
          />
          {attachments.length >= SEARCH_THRESHOLD ? (
            <div className="relative min-w-0 sm:w-56">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by name or URL"
                aria-label="Filter files and links"
                className="pl-9"
              />
            </div>
          ) : null}
          <div className="flex items-center gap-2 sm:ml-auto">
            <SegmentedControl<AttachmentView>
              value={currentView}
              onChange={changeView}
              ariaLabel="Layout"
              size="sm"
              iconOnly
              options={[
                { value: "grid", label: "Grid", icon: LayoutGrid },
                { value: "list", label: "List", icon: List },
              ]}
            />
            <div className="flex flex-1 gap-2 sm:flex-none [&>*]:flex-1 sm:[&>*]:flex-none">
              {addLink}
              {uploadButton}
            </div>
          </div>
        </div>
      ) : null}

      {!blobEnabled ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-fg-muted">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
          <span>
            {isAdmin
              ? "File uploads are off because BLOB_READ_WRITE_TOKEN is not set, so this tab takes links until a Vercel Blob store is connected."
              : "File uploads are not set up for this workspace, so you can add links to files stored elsewhere."}
          </span>
        </p>
      ) : null}

      {confidentialClient ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/8 px-3 py-2 text-sm text-fg">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            {confidentialClient.name} ({confidentialClient.code}) is confidential. Keep their data in approved storage and
            link to it rather than uploading copies.
          </span>
        </p>
      ) : null}

      <UploadProgressList items={items} onDismiss={dismiss} className="mt-4" />

      {attachments.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title="No files or links yet."
          description={
            blobEnabled
              ? `Drop files here (up to ${MAX_UPLOAD_LABEL} each) or add the repo, staging and design links.`
              : "Add the repo, staging, design and document links for this engagement."
          }
          action={
            <>
              {uploadButton}
              {addLink}
            </>
          }
          className="mt-4"
        />
      ) : filtered.length === 0 ? (
        <p className="mt-6 text-center text-sm text-fg-muted">Nothing matches. Try another filter.</p>
      ) : (
        <AttachmentList
          key={currentView}
          attachments={filtered}
          view={currentView}
          viewerId={viewerId}
          canManageAll={canManageAll}
          taskRefs={taskRefs}
          favicons={!confidentialClient}
          onChanged={() => router.refresh()}
          className="mt-4"
        />
      )}

      {blobEnabled && attachments.length > 0 ? (
        <button
          type="button"
          onClick={openPicker}
          className={cn(
            "mt-4 flex w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted",
            "transition-control hover:border-accent/50 hover:bg-accent-soft/40 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Upload aria-hidden className="size-4 text-accent" />
          <span>
            Drop files anywhere on this tab or <span className="font-medium text-accent">browse</span>.
          </span>
          <span className="text-xs text-fg-subtle">Up to {MAX_UPLOAD_LABEL} per file.</span>
        </button>
      ) : null}

      {dragging ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-2 z-20 flex items-center justify-center rounded-3xl border-2 border-dashed border-accent bg-accent-soft/70 backdrop-blur-[2px] reveal-fade"
        >
          <div className="flex flex-col items-center gap-2 text-accent-soft-fg">
            <Upload className="size-6" />
            <span className="text-sm font-semibold">Drop to upload</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
