"use client";

import { useSyncExternalStore } from "react";
import type { MotionPreference, TransparencyPreference } from "@/lib/constants";
import {
  isReducedMotionNow,
  readMotionPreference,
  readTransparencyPreference,
  setMotionPreference,
  setTransparencyPreference,
  subscribePreferences,
} from "./preferences";

/**
 * Whether motion should be reduced right now, following the app setting
 * (Settings > Appearance > Motion): "Reduced" → true, "Full" → false,
 * "System" → the OS `prefers-reduced-motion`. Re-renders on any change.
 * The server render assumes full motion; the client corrects it after
 * hydration.
 */
export function useReducedMotionPreference(): boolean {
  return useSyncExternalStore(subscribePreferences, isReducedMotionNow, () => false);
}

/** The stored motion preference and its setter (applies immediately, persists per device). */
export function useMotionPreference(): { motion: MotionPreference; setMotion: (value: MotionPreference) => void } {
  const motion = useSyncExternalStore(subscribePreferences, readMotionPreference, () => "system" as const);
  return { motion, setMotion: setMotionPreference };
}

/** The stored transparency preference and its setter (applies immediately, persists per device). */
export function useTransparencyPreference(): {
  transparency: TransparencyPreference;
  setTransparency: (value: TransparencyPreference) => void;
} {
  const transparency = useSyncExternalStore(
    subscribePreferences,
    readTransparencyPreference,
    () => "system" as const,
  );
  return { transparency, setTransparency: setTransparencyPreference };
}
