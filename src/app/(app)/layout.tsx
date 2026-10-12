import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { GlobalOverlays } from "@/components/layout/global-overlays";
import { SidebarExtra } from "@/components/layout/sidebar-extra";
import { TopbarActions } from "@/components/layout/topbar-actions";
import { requireUser } from "@/lib/auth";

/** Every signed-in page lives under this layout; requireUser redirects guests to /login. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell
      user={user}
      topbarActions={<TopbarActions user={user} />}
      sidebarExtra={<SidebarExtra user={user} />}
      overlays={<GlobalOverlays user={user} />}
    >
      {children}
    </AppShell>
  );
}
