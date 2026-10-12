"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { formatBytes } from "./attachment-utils";
import type { UploadItem } from "./use-attachment-upload";

export interface UploadProgressListProps {
  items: UploadItem[];
  onDismiss: (id: string) => void;
  className?: string;
}

const STATUS_TEXT: Record<UploadItem["status"], string> = {
  queued: "Waiting",
  uploading: "Uploading",
  saving: "Saving",
  done: "Uploaded",
  error: "Failed",
};

/** Per-file upload rows: name, size, a progress bar while uploading, the error when it failed. */
export function UploadProgressList({ items, onDismiss, className }: UploadProgressListProps) {
  if (items.length === 0) return null;
  return (
    <ul role="list" aria-label="Uploads" aria-live="polite" className={cn("space-y-2", className)}>
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "reveal-fade flex min-w-0 items-center gap-3 rounded-xl border bg-surface px-3 py-2.5",
            item.status === "error" ? "border-danger/40" : "border-border",
          )}
        >
          <span aria-hidden className="flex size-5 shrink-0 items-center justify-center">
            {item.status === "done" ? (
              <CircleCheck className="size-4 text-success" />
            ) : item.status === "error" ? (
              <CircleAlert className="size-4 text-danger" />
            ) : (
              <Spinner size="sm" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-sm font-medium text-fg">{item.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-fg-subtle">{formatBytes(item.size)}</span>
            </div>
            {item.status === "error" ? (
              <p className="mt-0.5 text-xs text-danger [overflow-wrap:anywhere]">{item.error}</p>
            ) : item.status === "uploading" || item.status === "saving" ? (
              <ProgressBar
                value={item.progress}
                size="sm"
                showLabel
                label={`Uploading ${item.name}`}
                className="mt-1.5"
              />
            ) : (
              <p className="mt-0.5 text-xs text-fg-muted">{STATUS_TEXT[item.status]}</p>
            )}
          </div>
          {item.status === "error" || item.status === "done" ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={`Dismiss ${item.name}`}
              onClick={() => onDismiss(item.id)}
            >
              <X />
            </Button>
          ) : (
            <span className="sr-only">{STATUS_TEXT[item.status]}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
