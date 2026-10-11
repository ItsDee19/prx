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

export function Toaster() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <SonnerToaster
      position="top-right"
      theme={theme}
      richColors
      closeButton
      offset={16}
      toastOptions={{
        classNames: {
          toast: "font-sans text-sm rounded-lg border shadow-lg",
          title: "font-medium",
          description: "text-fg-muted",
        },
      }}
    />
  );
}
