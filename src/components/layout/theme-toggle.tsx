"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  isTheme,
  readStoredTheme,
  resolveTheme,
  type Theme,
} from "./theme-script";

export const THEME_OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/* ------------------------------------------------------------------ */
/* A tiny external store so every subscriber re-renders on change     */
/* (toggle in the user menu, selector on /settings, other tabs, OS).  */
/* ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    applyTheme(readStoredTheme());
    listener();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) {
      applyTheme(readStoredTheme());
      listener();
    }
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getResolvedSnapshot(): "light" | "dark" {
  return resolveTheme(readStoredTheme());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readStoredTheme, () => "system" as Theme);
  const resolvedTheme = useSyncExternalStore(subscribe, getResolvedSnapshot, () => "light" as const);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice still applies for this page view.
    }
    applyTheme(next);
    notify();
  }, []);

  return { theme, resolvedTheme, setTheme };
}

export interface ThemeToggleProps {
  className?: string;
  /** Compact icon-only variant for tight spaces. */
  iconOnly?: boolean;
  size?: "sm" | "md";
}

/** Light / Dark / System selector. Persists to localStorage and applies immediately. */
export function ThemeToggle({ className, iconOnly = false, size = "md" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  return (
    <SegmentedControl
      value={theme}
      onChange={setTheme}
      options={THEME_OPTIONS}
      ariaLabel="Theme"
      iconOnly={iconOnly}
      size={size}
      className={className}
    />
  );
}

/** Theme choice as radio items for use inside a DropdownMenuContent. */
export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuRadioGroup
      value={theme}
      onValueChange={(value) => {
        if (isTheme(value)) setTheme(value);
      }}
    >
      {THEME_OPTIONS.map((option) => (
        <DropdownMenuRadioItem key={option.value} value={option.value}>
          <option.icon aria-hidden />
          {option.label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

/**
 * One-click light/dark switch for the app chrome. Shows the icon of the theme
 * you would switch TO, and renders a neutral placeholder until mounted so the
 * server and client markup match.
 */
export function ThemeSwitchButton({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const next = resolvedTheme === "dark" ? "light" : "dark";
  const Icon = !mounted ? Sun : resolvedTheme === "dark" ? Sun : Moon;
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => setTheme(next)}
      aria-label={mounted ? `Switch to ${next} mode` : "Switch theme"}
    >
      <Icon aria-hidden />
    </Button>
  );
}
