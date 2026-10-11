"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ProgressBar } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { updateProjectProgressAction } from "@/actions/projects";
import { clampProgress, cn } from "@/lib/utils";

export interface ProgressEditorProps {
  projectId: string;
  progress: number;
}

const COMMIT_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

/**
 * Progress bar with a range slider and a number box. The value updates locally
 * while dragging/typing and is saved when the interaction ends (pointer up, key
 * release, blur or Enter). On failure the saved value is restored.
 */
export function ProgressEditor({ projectId, progress }: ProgressEditorProps) {
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
            "h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-accent outline-none",
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
      <p className="text-xs text-fg-muted" aria-live="polite">
        {pending ? "Saving…" : value >= 100 ? "Complete" : `${value}% complete`}
      </p>
    </div>
  );
}
