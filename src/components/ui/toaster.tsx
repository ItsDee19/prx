"use client";

import { useSyncExternalStore } from "react";
import { Toaster as SonnerToaster } from "sonner";

type ResolvedTheme = "light" | "dark";

/* Follow the `.dark` class on <html> (set by the theme script / toggle). */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getSnapshot(): ResolvedTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerSnapshot(): ResolvedTheme {
  return "light";
}

/*
 * Distance from the screen edges, kept clear of notches and the home indicator
 * (env() is 0 where there is none). Sonner uses `offset` above 600px and
 * `mobileOffset` at 600px and below, where toasts span the width (see the
 * sonner override in globals.css). Sonner's phone styles keep the desktop
 * right offset, so the phone side offsets use the same values.
 */
const SIDE_OFFSET = {
  right: "max(16px, env(safe-area-inset-right))",
  left: "max(16px, env(safe-area-inset-left))",
};

const OFFSET = {
  ...SIDE_OFFSET,
  top: "max(16px, env(safe-area-inset-top))",
  bottom: "max(16px, env(safe-area-inset-bottom))",
};

const MOBILE_OFFSET = {
  ...SIDE_OFFSET,
  top: "calc(env(safe-area-inset-top) + 12px)",
  bottom: "calc(env(safe-area-inset-bottom) + 12px)",
};

export function Toaster() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <SonnerToaster
      position="top-right"
      theme={theme}
      richColors
      closeButton
      offset={OFFSET}
      mobileOffset={MOBILE_OFFSET}
      toastOptions={{
        classNames: {
          toast: "font-sans text-sm rounded-2xl! border shadow-pop!",
          title: "font-medium",
          description: "text-fg-muted",
        },
      }}
    />
  );
}
