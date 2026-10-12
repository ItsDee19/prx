"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import type { MotionPreference } from "@/lib/constants";
import { readMotionPreference, subscribePreferences } from "./preferences";

/** Motion's reducedMotion for each app setting: System follows the OS, Reduced always, Full never. */
const REDUCED_MOTION: Record<MotionPreference, "user" | "always" | "never"> = {
  system: "user",
  reduce: "always",
  full: "never",
};

/**
 * Mounted once in the root layout.
 *
 * - `LazyMotion strict` + `domAnimation`: use `m.*` from "motion/react-m"
 *   (the full `motion.*` components throw inside it); wrap a subtree in its
 *   own `<LazyMotion features={domMax}>` only where layout animation is needed.
 * - `MotionConfig reducedMotion` follows `data-motion` on <html> (Settings >
 *   Appearance > Motion), which the CSS reduced-motion rules also use, so
 *   Motion and CSS animations always agree.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(subscribePreferences, readMotionPreference, () => "system" as const);
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={REDUCED_MOTION[preference]}>{children}</MotionConfig>
    </LazyMotion>
  );
}
