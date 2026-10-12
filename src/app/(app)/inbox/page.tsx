import type { Metadata } from "next";
import { InboxList } from "@/components/notifications/inbox-list";
import { PageHeader } from "@/components/ui/page-header";
import { TabLinks } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/data/app-settings";
import {
  countUnread,
  generateTimeBasedNotifications,
  listNotifications,
  pruneReadNotifications,
} from "@/lib/data/notifications";
import type { InboxTab } from "@/lib/types";
import { safeTimeZone, workspaceToday } from "@/lib/workspace-time";

export const metadata: Metadata = { title: "Inbox" };

/** Notifications loaded per page (the list loads older ones on demand). */
const PAGE_SIZE = 40;

const TABS: { id: InboxTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mentions", label: "Mentions" },
];

function parseTab(value: string | string[] | undefined): InboxTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "unread" || raw === "mentions" ? raw : "all";
}

interface InboxPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Inbox: `?tab=all|unread|mentions` (default all), grouped by workspace day.
 * Each load lazily generates time-based notifications (due soon, update due,
 * tuning ending, budget thresholds) and prunes old read ones, so no cron is
 * needed.
 */
export default async function InboxPage({ searchParams }: InboxPageProps) {
  const [user, params, settings] = await Promise.all([requireUser(), searchParams, getAppSettings()]);
  const tab = parseTab(params.tab);
  const timeZone = safeTimeZone(settings.workspace_timezone);
  const today = workspaceToday(timeZone);

  try {
    await Promise.all([
      generateTimeBasedNotifications(user.id, today, timeZone, { cadenceDays: settings.update_cadence_days }),
      pruneReadNotifications(user.id, today),
    ]);
  } catch (error) {
    // Lazy generation is best effort; the inbox still shows what exists.
    console.error("Inbox: time-based notifications failed", error);
  }

  const [notifications, unread] = await Promise.all([
    listNotifications(user.id, { tab, limit: PAGE_SIZE }),
    countUnread(user.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Inbox" description="Mentions, assignments and changes on the work you watch." />
      <TabLinks
        aria-label="Inbox filter"
        activeId={tab}
        className="mb-5"
        items={TABS.map((item) => ({
          id: item.id,
          label: item.label,
          href: item.id === "all" ? "/inbox" : `/inbox?tab=${item.id}`,
          icon: item.id === "mentions" ? "AtSign" : item.id === "unread" ? "CircleDot" : "Inbox",
          count: item.id === "unread" && unread > 0 ? unread : null,
        }))}
      />
      <InboxList
        initialItems={notifications}
        tab={tab}
        unreadCount={unread}
        today={today}
        timeZone={timeZone}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
