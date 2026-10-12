/**
 * Motion and transparency preferences (Settings > Appearance).
 *
 * The theme script (src/components/layout/theme-script.tsx) copies the stored
 * values onto <html> as `data-motion` ("system" | "reduce" | "full") and
 * `data-transparency` ("system" | "reduce") before the first paint. CSS keys
 * off those attributes (globals.css), MotionProvider maps them onto Motion's
 * `reducedMotion`, and the hooks in use-motion-preference.ts read them.
 *
 * No "use client" directive: this module is plain functions, called only in
 * the browser (every DOM access is inside a function body).
 */
import {
  MOTION_PREFERENCES,
  STORAGE_KEYS,
  TRANSPARENCY_PREFERENCES,
  type MotionPreference,
  type TransparencyPreference,
} from "@/lib/constants";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const REDUCED_TRANSPARENCY_QUERY = "(prefers-reduced-transparency: reduce)";

export function isMotionPreference(value: unknown): value is MotionPreference {
  return typeof value === "string" && (MOTION_PREFERENCES as readonly string[]).includes(value);
}

export function isTransparencyPreference(value: unknown): value is TransparencyPreference {
  return typeof value === "string" && (TRANSPARENCY_PREFERENCES as readonly string[]).includes(value);
}

/** Current motion preference, as applied on <html> (falls back to "system"). */
export function readMotionPreference(): MotionPreference {
  const value = document.documentElement.getAttribute("data-motion");
  return isMotionPreference(value) ? value : "system";
}

/** Current transparency preference, as applied on <html> (falls back to "system"). */
export function readTransparencyPreference(): TransparencyPreference {
  const value = document.documentElement.getAttribute("data-transparency");
  return isTransparencyPreference(value) ? value : "system";
}

/** True when motion should be reduced right now: "reduce", or "system" with the OS asking for it. */
export function isReducedMotionNow(): boolean {
  if (typeof document === "undefined") return false;
  const preference = readMotionPreference();
  if (preference === "reduce") return true;
  if (preference === "full") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/* ------------------------------------------------------------------ */
/* Change notification (this tab, other tabs, OS setting)              */
/* ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function persist(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the choice still applies to this page view.
  }
}

function readStored<T extends string>(key: string, guard: (value: unknown) => value is T, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return guard(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function setMotionPreference(preference: MotionPreference): void {
  persist(STORAGE_KEYS.motion, preference);
  document.documentElement.setAttribute("data-motion", preference);
  notify();
}

export function setTransparencyPreference(preference: TransparencyPreference): void {
  persist(STORAGE_KEYS.transparency, preference);
  document.documentElement.setAttribute("data-transparency", preference);
  notify();
}

/**
 * Subscribes to every change that can alter the effective preferences: the
 * setters above, another tab writing localStorage, and the OS reduced-motion
 * or reduced-transparency setting. Returns the unsubscribe function.
 */
export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener);
  const motionMedia = window.matchMedia(REDUCED_MOTION_QUERY);
  const transparencyMedia = window.matchMedia(REDUCED_TRANSPARENCY_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEYS.motion) {
      document.documentElement.setAttribute(
        "data-motion",
        readStored(STORAGE_KEYS.motion, isMotionPreference, "system"),
      );
      listener();
    }
    if (event.key === null || event.key === STORAGE_KEYS.transparency) {
      document.documentElement.setAttribute(
        "data-transparency",
        readStored(STORAGE_KEYS.transparency, isTransparencyPreference, "system"),
      );
      listener();
    }
  };
  motionMedia.addEventListener("change", listener);
  transparencyMedia.addEventListener("change", listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    motionMedia.removeEventListener("change", listener);
    transparencyMedia.removeEventListener("change", listener);
    window.removeEventListener("storage", onStorage);
  };
}
