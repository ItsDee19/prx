import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listKeyLinks } from "@/lib/data/attachments";
import { KeyLinksBar } from "./key-links-bar";

/**
 * Overview card (server; SPEC.md section 21.2, main column order 5): the
 * project's pinned links as pill buttons in LINK_TYPE_ORDER, plus an add-link
 * popover that pins the new link.
 */
export async function KeyLinksCard({ project }: ProjectTabProps) {
  const links = await listKeyLinks(project.id);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle id="project-key-links-heading">Key links</CardTitle>
      </CardHeader>
      <CardContent>
        <KeyLinksBar
          projectId={project.id}
          links={links}
          favicons={!project.client?.confidential}
          filesHref={`/projects/${project.id}?tab=files`}
        />
      </CardContent>
    </Card>
  );
}
