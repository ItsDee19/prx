"use client";

import { usePathname, useRouter } from "next/navigation";
import { useHotkeys, type HotkeyBinding } from "@/hooks/use-hotkeys";
import { NAV_CONFIG } from "@/lib/constants";
import { dispatchAppCommand } from "@/lib/utils";
import { projectIdFromPathname } from "./palette-utils";
import { hasPaletteAction } from "./registry";

export interface GlobalHotkeysProps {
  /** Enables "g x" shortcuts of admin-only pages. */
  isAdmin?: boolean;
}

/**
 * App-wide shortcuts (SPEC.md section 20.2), mounted once in GlobalOverlays;
 * renders nothing. Ctrl/Cmd+K and "/" open the palette, "c" creates a task
 * (in the current project on `/projects/[id]`), Shift+C a project, "?" shows
 * the shortcuts, "t" toggles the timer (only while a `toggle-timer` palette
 * action is registered), and every enabled NAV item's "g x" sequence
 * navigates. Single keys never fire inside text fields or open dialogs.
 */
export function GlobalHotkeys({ isAdmin = false }: GlobalHotkeysProps) {
  const router = useRouter();
  const pathname = usePathname();
  const projectId = projectIdFromPathname(pathname);

  const bindings: HotkeyBinding[] = [
    {
      keys: "mod+k",
      allowInInputs: true,
      allowInDialogs: true,
      handler: () => dispatchAppCommand({ type: "open-palette" }),
    },
    { keys: "/", handler: () => dispatchAppCommand({ type: "open-palette" }) },
    {
      keys: "c",
      handler: () => dispatchAppCommand(projectId ? { type: "new-task", projectId } : { type: "new-task" }),
    },
    { keys: "shift+c", handler: () => dispatchAppCommand({ type: "new-project" }) },
    { keys: "?", handler: () => dispatchAppCommand({ type: "open-shortcuts" }) },
  ];
  if (hasPaletteAction("toggle-timer")) {
    bindings.push({ keys: "t", handler: () => dispatchAppCommand({ type: "toggle-timer" }) });
  }
  for (const item of NAV_CONFIG) {
    if (!item.enabled || !item.shortcut || (item.adminOnly && !isAdmin)) continue;
    const href = item.href;
    bindings.push({ keys: item.shortcut, handler: () => router.push(href) });
  }

  useHotkeys(bindings);
  return null;
}
