import { TabLinks } from "@/components/ui/tabs";
import type { ProjectTabId } from "@/lib/types";
import { projectTabHref, type VisibleProjectTab } from "./tabs/registry";
import type { ProjectTabContext } from "./tabs/types";

export interface ProjectTabsNavProps {
  projectId: string;
  tabs: VisibleProjectTab[];
  activeId: ProjectTabId;
  /** Context for the tabs' badge counts. */
  context: ProjectTabContext;
  className?: string;
}

/**
 * The project page's tab bar: the registered, visible tabs as links (`?tab=`
 * in the URL, so tabs are shareable and only the active tab's data loads).
 * Scrolls sideways on phones; the active tab stays in view.
 */
export function ProjectTabsNav({ projectId, tabs, activeId, context, className }: ProjectTabsNavProps) {
  return (
    <TabLinks
      aria-label="Project sections"
      activeId={activeId}
      className={className}
      items={tabs.map((tab) => {
        const count = tab.badge ? tab.badge(context) : null;
        return {
          id: tab.id,
          label: tab.label,
          icon: tab.icon,
          href: projectTabHref(projectId, tab.id),
          // A zero badge is noise: show counts only when there is something to count.
          count: count !== null && count > 0 ? count : null,
        };
      })}
    />
  );
}
