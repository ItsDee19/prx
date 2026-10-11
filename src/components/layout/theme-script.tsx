/**
 * Theme bootstrapping. This module has no "use client" directive so it can be
 * imported from the root layout (server) and from client components alike.
 * Only `readStoredTheme`, `resolveTheme` and `applyTheme` touch the DOM, and
 * they are only ever called in the browser.
 */

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "prx-theme";
export const THEMES: readonly Theme[] = ["light", "dark", "system"];

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

/** Theme persisted in localStorage; defaults to "system" when unset or unavailable. */
export function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/** Resolves "system" against the OS preference. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Toggles the `.dark` class on <html> to match the given theme. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", resolveTheme(theme) === "dark");
}

/*
 * Mirrors the logic above as a tiny inline script so the correct class is on
 * <html> before the first paint (no flash of the wrong theme). Kept dependency
 * free and wrapped in try/catch because localStorage can throw in private mode.
 */
const INIT_SCRIPT = `(function(){try{var t=window.localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export function ThemeScript() {
  return <script id="prx-theme-init" dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }} />;
}
