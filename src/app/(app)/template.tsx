import type { ReactNode } from "react";

/**
 * Page enter for every signed-in page: opacity 0 to 1 and y 6px to 0 over
 * 220ms (ease-out-expo), enter only. The animation is applied to this
 * wrapper's direct DOM children (`:where(.page-enter) > *` in globals.css),
 * not to the wrapper: this template wraps the (app) loading boundary and Next
 * keys it by the first segment only, so it does not remount for
 * /projects -> /projects/[id] or while a page streams in. Each time React
 * inserts a new route root (the page replacing its loading fallback, a child
 * route replacing its parent's page, one [id] replacing another) the enter
 * plays on that new root; `?tab=` re-renders keep their DOM and do not replay.
 * It runs from the first paint of server-rendered HTML and leaves no transform
 * behind (fill mode `backwards`). Reduced motion: an opacity-only 120ms fade.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
