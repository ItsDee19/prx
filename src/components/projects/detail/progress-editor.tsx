"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { updateProjectProgressAction } from "@/actions/projects";
import { PROGRESS_MODE_CONFIG } from "@/lib/constants";
import type { ProgressMode } from "@/lib/types";
import { clampProgress, cn } from "@/lib/utils";

export interface ProgressEditorProps {
  projectId: string;
  progress: number;
  /** The project's progress_mode (default "manual"). Only manual progress is editable. */
  mode?: ProgressMode;
  /** One-line basis for derived progress, e.g. "5 of 9 tasks done." */
  detail?: string | null;
}

const COMMIT_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

/**
 * Progress of a project. Manual projects get the slider editor below; derived
 * modes (tasks, phases, accepted units) show a read-only bar with the mode and
 * its basis, because their value is recomputed from the work itself.
 */
export function ProgressEditor({ projectId, progress, mode = "manual", detail = null }: ProgressEditorProps) {
  if (mode === "manual") return <ManualProgressEditor projectId={projectId} progress={progress} />;
  const config = PROGRESS_MODE_CONFIG[mode];
  return (
    <div className="space-y-2">
      <ProgressBar value={progress} size="md" showLabel label="Progress" />
      <p className="flex items-start gap-1.5 text-xs text-fg-muted">
        <Icon name={config.icon} className="mt-px size-3.5 text-fg-subtle" />
        <span className="min-w-0">
          <span className="font-medium text-fg">{config.label}.</span> {detail ?? config.description}
        </span>
      </p>
    </div>
  );
}

/**
 * Progress bar with a range slider and a number box. The value updates locally
 * while dragging/typing and is saved when the interaction ends (pointer up, key
 * release, blur or Enter). On failure the saved value is restored.
 */
function ManualProgressEditor({ projectId, progress }: { projectId: string; progress: number }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(progress);
  const [saved, setSaved] = useState(progress);
  const [pending, setPending] = useState(false);
  // Sync with fresh server data after router.refresh() unless an edit is in flight.
  const [seenProgress, setSeenProgress] = useState(progress);
  if (progress !== seenProgress) {
    setSeenProgress(progress);
    if (!pending) {
      setSaved(progress);
      setValue(progress);
    }
  }
  const inFlight = useRef(false);

  async function commit() {
    const target = clampProgress(value);
    if (target !== value) setValue(target);
    if (target === saved || inFlight.current) return;

    const previous = saved;
    inFlight.current = true;
    setPending(true);
    setSaved(target); // optimistic: the bar already shows the new value
    try {
      const result = await updateProjectProgressAction(projectId, target);
      if (!result.ok) {
        toast.error(result.error);
        setSaved(previous);
        setValue(previous);
        return;
      }
      router.refresh();
    } catch {
      toast.error("Could not update the progress. Please try again.");
      setSaved(previous);
      setValue(previous);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function handleRangeKeyUp(event: KeyboardEvent<HTMLInputElement>) {
    if (COMMIT_KEYS.has(event.key)) commit();
  }

  function handleNumberKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  }

  return (
    <div className="space-y-2">
      <ProgressBar value={value} size="md" />
      <div className="flex items-center gap-3">
        <input
          id={`${id}-range`}
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          aria-label="Progress"
          aria-valuetext={`${value}%`}
          disabled={pending}
          onChange={(event) => setValue(clampProgress(Number(event.target.value)))}
          onPointerUp={() => commit()}
          onKeyUp={handleRangeKeyUp}
          onBlur={() => commit()}
          className={cn(
            "h-8 min-w-0 flex-1 cursor-pointer appearance-none rounded-full accent-accent outline-none",
            // The 6px track is painted across the middle of a 32px-tall control (the height of the
            // number box beside it), so the whole height is the touch/click target.
            "bg-[linear-gradient(var(--color-border),var(--color-border))] bg-[length:100%_0.375rem] bg-center bg-no-repeat",
            "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        <div className="relative shrink-0">
          <Input
            id={`${id}-number`}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={value}
            aria-label="Progress percentage"
            disabled={pending}
            onChange={(event) => {
              const raw = event.target.value;
              setValue(raw === "" ? 0 : clampProgress(Number(raw)));
            }}
            onKeyDown={handleNumberKeyDown}
            onBlur={() => commit()}
            className="h-8 w-[4.5rem] pr-6 text-right tabular-nums"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-fg-subtle"
          >
            %
          </span>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted">
        <span aria-live="polite">{pending ? "Saving…" : value >= 100 ? "Complete" : `${value}% complete`}</span>
        <span aria-hidden className="text-fg-subtle">
          ·
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name={PROGRESS_MODE_CONFIG.manual.icon} className="size-3 text-fg-subtle" />
          {PROGRESS_MODE_CONFIG.manual.label}
        </span>
      </p>
    </div>
  );
}
