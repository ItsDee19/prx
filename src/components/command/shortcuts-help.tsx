"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { NAV_CONFIG, SHORTCUTS, type ShortcutGroup } from "@/lib/constants";
import { subscribeAppCommands } from "@/lib/utils";
import { hasPaletteAction } from "./registry";

export interface ShortcutsHelpProps {
  /** Includes admin-only navigation shortcuts. */
  isAdmin?: boolean;
}

interface ShortcutRow {
  id: string;
  keys: string;
  label: string;
}

const GROUP_ORDER: (ShortcutGroup | "Navigation")[] = ["General", "Navigation", "Lists and boards", "Inbox"];

/** Shortcuts that are live right now: disabled pages and features have none. */
function shortcutSections(isAdmin: boolean): { group: string; rows: ShortcutRow[] }[] {
  const inboxEnabled = NAV_CONFIG.some((item) => item.id === "inbox" && item.enabled);
  const timerEnabled = hasPaletteAction("toggle-timer");
  const general = SHORTCUTS.filter((shortcut) => {
    if (shortcut.id === "timer") return timerEnabled;
    if (shortcut.group === "Inbox") return inboxEnabled;
    return true;
  });
  const navigation: ShortcutRow[] = NAV_CONFIG.filter(
    (item) => item.enabled && item.shortcut && (!item.adminOnly || isAdmin),
  ).map((item) => ({ id: `nav-${item.id}`, keys: item.shortcut ?? "", label: `Go to ${item.label}` }));

  return GROUP_ORDER.map((group) => ({
    group,
    rows:
      group === "Navigation"
        ? navigation
        : general.filter((shortcut) => shortcut.group === group).map(({ id, keys, label }) => ({ id, keys, label })),
  })).filter((section) => section.rows.length > 0);
}

/**
 * Keyboard shortcuts overlay. Opens on the `open-shortcuts` AppCommand
 * (GlobalHotkeys sends it for "?", the palette has an entry for it).
 */
export function ShortcutsHelp({ isAdmin = false }: ShortcutsHelpProps) {
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      subscribeAppCommands((command) => {
        if (command.type === "open-shortcuts") setOpen(true);
      }),
    [],
  );

  const sections = shortcutSections(isAdmin);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="Keyboard shortcuts"
        description="Single keys work anywhere outside text fields. Press ? to open this list."
        size="lg"
      >
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {sections.map((section) => (
            <section key={section.group} aria-labelledby={`shortcuts-${section.group}`} className="min-w-0">
              <h3 id={`shortcuts-${section.group}`} className="text-xs font-medium text-fg-muted">
                {section.group}
              </h3>
              <dl className="mt-2 divide-y divide-border">
                {section.rows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-4 py-2">
                    <dt className="min-w-0 text-sm text-fg [overflow-wrap:anywhere]">{row.label}</dt>
                    <dd className="shrink-0">
                      <Kbd keys={row.keys} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
