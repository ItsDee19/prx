"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { AuroraBackground } from "@/components/motion/aurora-background";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/types";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export interface AppShellProps {
  user: User;
  children: ReactNode;
  /** TopbarActions slot (server-rendered controls on the right of the topbar). */
  topbarActions?: ReactNode;
  /** SidebarExtra slot (sections under the NAV groups, in the rail and the drawer). */
  sidebarExtra?: ReactNode;
  /** GlobalOverlays slot (app-wide drawer/dialog hosts, palette, hotkeys). */
  overlays?: ReactNode;
}

/** Same value as Tailwind's `lg` breakpoint, where the fixed sidebar replaces the drawer. */
const DESKTOP_QUERY = "(min-width: 64rem)";

/**
 * Signed-in frame: the Aurora background layer, a fixed sidebar at lg and up
 * (a glass slide-in drawer below), the glass topbar and the content column.
 * The drawer is a Radix Dialog so it traps focus, closes on Escape and is announced.
 *
 * Content container: centred, up to 1920px wide (`max-w-[120rem]`), with
 * gutters growing from 16px on phones to 40px at 2xl. Safe-area insets are added
 * on top of the gutters (landscape notches, the home indicator).
 */
export function AppShell({ user, children, topbarActions, sidebarExtra, overlays }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  // Close the drawer whenever the route changes, so links rendered in the
  // sidebar extra slot (favourites, saved views) close it like the NAV links do.
  // State is adjusted during render (React's "reset state on prop change"
  // pattern), so no extra effect pass or flash of the open drawer.
  const pathname = usePathname();
  const [drawerPathname, setDrawerPathname] = useState(pathname);
  if (pathname !== drawerPathname) {
    setDrawerPathname(pathname);
    setDrawerOpen(false);
  }

  // Links that keep the pathname (a saved view on the current page only changes
  // the query string) do not trigger the reset above: close on any plain click
  // on a link inside the drawer as well. Modified clicks open a new tab instead.
  const closeOnLinkClick = (event: MouseEvent<HTMLDivElement>) => {
    // Not `defaultPrevented`: next/link prevents the default to navigate client-side.
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest("a[href]")) setDrawerOpen(false);
  };

  // The drawer is hidden from lg up; if the viewport grows past lg while it is open
  // (tablet rotation, window resize) close it, or its focus trap and scroll lock
  // would keep the now-visible desktop layout inert. Runs only after mount, so it
  // has no effect on the server render.
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setDrawerOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    // `isolate`: the aurora layer (z -10) paints above the body background and below everything else.
    <div className="relative isolate flex min-h-dvh">
      <AuroraBackground />

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-[max(1rem,env(safe-area-inset-left))] focus:top-[max(1rem,env(safe-area-inset-top))] focus:z-[60] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-fg focus:shadow-pop focus:outline-none"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <div className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-border bg-sidebar lg:block">
        <Sidebar user={user} extra={sidebarExtra} />
      </div>

      {/* Mobile drawer */}
      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[3px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out lg:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onClick={closeOnLinkClick}
            className={
              "glass-panel fixed inset-y-0 left-0 z-50 flex flex-col overflow-y-auto overscroll-contain rounded-r-[20px] border-r border-glass-border shadow-pop outline-none " +
              // 18rem, never more than 85% of a narrow phone; plus the left inset in landscape.
              "w-[calc(min(18rem,85vw)+env(safe-area-inset-left))] " +
              "pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] " +
              "data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left lg:hidden"
            }
          >
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <Sidebar
              user={user}
              idPrefix="drawer"
              onNavigate={closeDrawer}
              extra={sidebarExtra}
              // Short landscape phones: let the whole drawer scroll rather than squeezing the nav.
              className="h-auto min-h-full shrink-0"
              headerAction={
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" size="icon" aria-label="Close navigation">
                    <X />
                  </Button>
                </DialogPrimitive.Close>
              }
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} onOpenMenu={() => setDrawerOpen(true)} actions={topbarActions} />
        <main id="main-content" className="flex-1 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
          <div className="mx-auto w-full max-w-[120rem] px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8 2xl:px-10">
            {children}
          </div>
        </main>
      </div>

      {overlays}
    </div>
  );
}
