/**
 * Theme bootstrapping. This module has no "use client" directive so it can be
 * imported from the root layout (server) and from client components alike.
 * Only `readStoredTheme`, `resolveTheme` and `applyTheme` touch the DOM, and
 * they are only ever called in the browser.
 */
import { STORAGE_KEYS } from "@/lib/constants";

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = STORAGE_KEYS.theme;
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
 * Mirrors the logic above as a tiny inline script so the correct state is on
 * <html> before the first paint (no flash of the wrong theme, no motion that
 * the reader turned off): the `.dark` class, `data-motion`
 * ("system" | "reduce" | "full") and `data-transparency` ("system" | "reduce").
 * Dependency free and wrapped in try/catch because localStorage can throw in
 * private mode; the attributes always get a value.
 */
const INIT_SCRIPT = `(function(){var r=document.documentElement,v=null,m="system",t="system";try{var s=window.localStorage;v=s.getItem("${STORAGE_KEYS.theme}");var mm=s.getItem("${STORAGE_KEYS.motion}");if(mm==="reduce"||mm==="full")m=mm;var tt=s.getItem("${STORAGE_KEYS.transparency}");if(tt==="reduce")t=tt;}catch(e){}try{r.classList.toggle("dark",v==="dark"||(v!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches));}catch(e){}r.setAttribute("data-motion",m);r.setAttribute("data-transparency",t);})();`;

export function ThemeScript() {
  return <script id="prx-theme-init" dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }} />;
}
