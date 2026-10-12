import { Fragment, type ReactNode } from "react";
import { FavoritesSection } from "@/components/views/favorites-section";
import { ViewsSection } from "@/components/views/views-section";
import { listFavorites, listSavedViews } from "@/lib/data/views";
import type { User } from "@/lib/types";

/** One sidebar section under the NAV groups, rendered on the server for the signed-in user. */
export type SidebarExtraEntry = (user: User) => ReactNode | Promise<ReactNode>;

/*
 * Slot entries, top to bottom. Integration agents add entries here
 * (SPEC.md section 20.3):
 *   W5: FavoritesSection (listFavorites(user.id)), then ViewsSection (listSavedViews(user.id)).
 */
const SIDEBAR_EXTRA: readonly SidebarExtraEntry[] = [
  async (user) => <FavoritesSection favorites={await listFavorites(user.id)} />,
  async (user) => (
    <ViewsSection views={await listSavedViews(user.id)} viewerId={user.id} isAdmin={user.role === "admin"} />
  ),
];

export interface SidebarExtraProps {
  user: User;
}

/**
 * Extra sidebar sections (async server component). The sidebar renders it
 * inside its scrolling nav area, in the desktop rail and the mobile drawer;
 * renders nothing while the slot is empty.
 */
export async function SidebarExtra({ user }: SidebarExtraProps) {
  const nodes = await Promise.all(SIDEBAR_EXTRA.map((entry) => entry(user)));
  if (nodes.length === 0) return null;
  return (
    <div className="mt-4 space-y-4">
      {nodes.map((node, index) => (
        <Fragment key={index}>{node}</Fragment>
      ))}
    </div>
  );
}
