"use client";

import { useEffect } from "react";
import { markPageContentHydrated } from "@/hooks/use-page-ready";

/**
 * Renders nothing. Its effect runs once the page content around it has
 * hydrated, which lets URL-opened modals (task drawer, `?new=1` dialogs) wait
 * for hydration before Radix marks the page aria-hidden (see usePageReady).
 */
export function PageReadyMark() {
  useEffect(() => {
    markPageContentHydrated();
  }, []);
  return null;
}
