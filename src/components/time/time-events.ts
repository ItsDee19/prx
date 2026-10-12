import type { RunningTimer } from "@/lib/types";

/*
 * Same-tab sync for the timer. Surfaces that start or stop a timer outside the
 * topbar (the task drawer's time section) announce the new state so TimerPill
 * updates at once instead of waiting for the layout to re-render. Client only.
 */

const TIMER_EVENT = "prx:timer-changed";

export function announceTimer(timer: RunningTimer | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RunningTimer | null>(TIMER_EVENT, { detail: timer }));
}

export function subscribeTimer(handler: (timer: RunningTimer | null) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => handler((event as CustomEvent<RunningTimer | null>).detail ?? null);
  window.addEventListener(TIMER_EVENT, listener);
  return () => window.removeEventListener(TIMER_EVENT, listener);
}

/** localStorage key for the project the last timer ran on (a per-viewer convenience). */
export const LAST_TIMER_PROJECT_KEY = "prx-timer-last-project";

export function readLastTimerProject(): string | null {
  try {
    return window.localStorage.getItem(LAST_TIMER_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function rememberTimerProject(projectId: string): void {
  try {
    window.localStorage.setItem(LAST_TIMER_PROJECT_KEY, projectId);
  } catch {
    // Storage can be unavailable (private mode); the default is only a convenience.
  }
}

/** /projects/<id> pages prefill their project. */
export function projectIdFromPath(pathname: string): string | undefined {
  return /^\/projects\/([^/?#]+)/.exec(pathname)?.[1];
}
