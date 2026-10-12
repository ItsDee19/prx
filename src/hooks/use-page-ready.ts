"use client";

import { useSyncExternalStore } from "react";

/*
 * "Has the first page load finished hydrating?" as a tiny external store.
 *
 * Modal overlays that open straight from the URL (`?task=PRX-12`, `?new=1`)
 * must not open while React is still hydrating streamed Suspense boundaries:
 * Radix marks everything outside an open modal `aria-hidden`, and boundaries
 * that hydrate after that see attributes the server never rendered (a
 * hydration mismatch). The flag flips once
 *   1. the document has loaded,
 *   2. no streamed boundary is still waiting to be revealed (React leaves a
 *      `<template id="B:n">` placeholder until it swaps the content in; the
 *      reveal waits for an animation frame, so a background tab can hold it), and
 *   3. the page content has hydrated (`PageReadyMark`, rendered by PageHeader,
 *      so every app page and the project header), or a short grace period
 *      passed for pages without one,
 * and the browser is idle. It stays true for the rest of the session, so
 * client-side navigations open overlays immediately.
 */

let ready = false;
let scheduled = false;
let contentHydrated = false;
const listeners = new Set<() => void>();
const POLL_MS = 100;
/** How long to wait for a PageReadyMark once every boundary is revealed. */
const MARK_GRACE_MS = 1000;

function markReady(): void {
  if (ready) return;
  ready = true;
  for (const listener of listeners) listener();
}

function whenIdle(): void {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(markReady, { timeout: 500 });
  } else {
    window.setTimeout(markReady, 50);
  }
}

function hasPendingBoundaries(): boolean {
  return document.querySelector('template[id^="B:"]') !== null;
}

function waitForContent(): void {
  let revealedAt: number | null = null;
  const check = () => {
    if (ready) return;
    if (hasPendingBoundaries()) {
      revealedAt = null;
    } else {
      revealedAt ??= Date.now();
      if (contentHydrated || Date.now() - revealedAt >= MARK_GRACE_MS) {
        whenIdle();
        return;
      }
    }
    window.setTimeout(check, POLL_MS);
  };
  check();
}

function scheduleReady(): void {
  if (scheduled || ready) return;
  scheduled = true;
  if (document.readyState === "complete") waitForContent();
  else window.addEventListener("load", waitForContent, { once: true });
}

/** Called by PageReadyMark once the page content around it has hydrated. */
export function markPageContentHydrated(): void {
  contentHydrated = true;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  scheduleReady();
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => ready;
const getServerSnapshot = () => false;

/** False on the server and until the first page load has hydrated; true afterwards. */
export function usePageReady(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
