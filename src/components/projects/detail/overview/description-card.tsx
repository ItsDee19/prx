import { Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectTabProps } from "../tabs/types";

/** Overview card: the project description, pre-wrapped and capped to a readable line length. */
export function DescriptionCard({ project }: ProjectTabProps) {
  const description = project.description.trim();
  return (
    <Card>
      <CardHeader>
        <CardTitle id="project-description-heading">Description</CardTitle>
      </CardHeader>
      <CardContent>
        {description ? (
          <p className="max-w-[80ch] whitespace-pre-wrap text-sm leading-6 text-fg [overflow-wrap:anywhere]">
            {description}
          </p>
        ) : (
          <p className="text-sm text-fg-muted">
            No description yet.{" "}
            <span className="inline-flex items-center gap-1 text-fg-subtle">
              Use <Pencil className="size-3" aria-hidden /> Edit to add one.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
