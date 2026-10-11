import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";

/** Every signed-in page lives under this layout; requireUser redirects guests to /login. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
