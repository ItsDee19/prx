"use client";

import { useEffect, useState } from "react";
import { getTemplateConversionStateAction } from "@/actions/templates";
import type { TemplateConversionState } from "@/lib/data/templates";

export type ConversionState = TemplateConversionState & { today: string };

/**
 * Loads `getTemplateConversionStateAction(projectId)` while `enabled`
 * (reloaded each time it turns on). `state` is null until loaded; `error`
 * holds the action's message on failure.
 */
export function useConversionState(projectId: string, enabled: boolean): { state: ConversionState | null; error: string | null } {
  const [result, setResult] = useState<{ key: string; state: ConversionState | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getTemplateConversionStateAction(projectId).then((response) => {
      if (cancelled) return;
      setResult(
        response.ok
          ? { key: projectId, state: response.data, error: null }
          : { key: projectId, state: null, error: response.error },
      );
    });
    return () => {
      cancelled = true;
      setResult(null);
    };
  }, [projectId, enabled]);

  if (!enabled || !result || result.key !== projectId) return { state: null, error: null };
  return { state: result.state, error: result.error };
}
