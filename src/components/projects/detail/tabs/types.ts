import type { ComponentType } from "react";
import type {
  ProjectTabCounts,
  ProjectTabId,
  ProjectWithMeta,
  User,
  UserSummary,
} from "@/lib/types";

/**
 * Contract for the project detail page tabs (SPEC.md section 21.1). Tab
 * components and overview cards are server components (or client components
 * that only take these serialisable props): never pass functions through them.
 */

export interface ProjectTabContext {
  /** Loaded with includeCommercial = isAdmin. */
  project: ProjectWithMeta;
  viewer: User;
  isAdmin: boolean;
  counts: ProjectTabCounts;
}

export interface ProjectTabProps extends ProjectTabContext {
  users: UserSummary[];
  /** Workspace today. */
  today: string;
  /** The page's awaited searchParams. */
  searchParams: Record<string, string | string[] | undefined>;
}

export interface ProjectTabEntry {
  id: ProjectTabId;
  /** Server or client component; async server components load their own data. */
  component: ComponentType<ProjectTabProps>;
  /** Default: always visible. */
  visible?: (ctx: ProjectTabContext) => boolean;
  /** Badge next to the label (null = none). */
  badge?: (ctx: ProjectTabContext) => number | null;
}
