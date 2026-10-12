import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { isBlobEnabled, listAttachments, listAttachmentTaskRefs } from "@/lib/data/attachments";
import { parseAttachmentView } from "./attachment-utils";
import { FilesBrowser } from "./files-browser";

/**
 * The project page's Files tab (server; SPEC.md section 20.2). Every link and
 * file of the project, including those attached to its tasks (labelled with
 * the task key), as a grid or list (`?view=grid|list`, default grid). Uploads
 * appear only when Vercel Blob is configured.
 */
export async function FilesTab({ project, viewer, isAdmin, searchParams }: ProjectTabProps) {
  const attachments = await listAttachments({ projectId: project.id });
  const taskRefs = await listAttachmentTaskRefs(
    attachments.map((attachment) => attachment.task_id).filter((id): id is string => id !== null),
  );
  const client = project.client;

  return (
    <FilesBrowser
      projectId={project.id}
      attachments={attachments}
      taskRefs={taskRefs}
      viewerId={viewer.id}
      isAdmin={isAdmin}
      canManageAll={isAdmin || project.owner_id === viewer.id}
      blobEnabled={isBlobEnabled()}
      confidentialClient={client?.confidential ? { name: client.name, code: client.code } : null}
      view={parseAttachmentView(searchParams.view)}
    />
  );
}
