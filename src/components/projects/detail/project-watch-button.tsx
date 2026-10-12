import { WatchButton } from "@/components/notifications/watch-button";
import { requireUser } from "@/lib/auth";
import { isWatching } from "@/lib/data/notifications";

export interface ProjectWatchButtonProps {
  projectId: string;
}

/**
 * Watch / Unwatch for the project header (server). Reads the signed-in viewer
 * (memoised per request) and their effective watch state (explicit ∪ implicit
 * − muted, SPEC.md section 17.5), then hands only serialisable props to the
 * client `WatchButton`.
 */
export async function ProjectWatchButton({ projectId }: ProjectWatchButtonProps) {
  const viewer = await requireUser();
  const entity = { type: "project", id: projectId } as const;
  const initialWatching = await isWatching(viewer.id, entity);
  return <WatchButton key={projectId} entity={entity} initialWatching={initialWatching} />;
}
