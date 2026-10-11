"use client";

import { useState, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/types";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export interface AppShellProps {
  user: User;
  children: ReactNode;
}

/**
 * Signed-in frame: fixed sidebar at lg and up, a top bar + slide-in drawer below.
 * The drawer is a Radix Dialog so it traps focus, closes on Escape and is announced.
 */
export function AppShell({ user, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-fg focus:outline-none"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <div className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-border bg-surface lg:block">
        <Sidebar user={user} />
      </div>

      {/* Mobile drawer */}
      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out lg:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface shadow-xl outline-none data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left lg:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2.5 size-8"
                aria-label="Close navigation"
              >
                <X />
              </Button>
            </DialogPrimitive.Close>
            <Sidebar user={user} onNavigate={closeDrawer} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} onOpenMenu={() => setDrawerOpen(true)} />
        <main id="main-content" className="flex-1 bg-bg">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
