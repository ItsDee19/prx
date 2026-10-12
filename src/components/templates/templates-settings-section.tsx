import { Card } from "@/components/ui/card";
import { listCustomTemplatesWithMeta } from "@/lib/data/templates";
import type { User } from "@/lib/types";
import { TemplatesManager } from "./templates-manager";

/**
 * Settings > Templates (registry entry, order 50): custom templates with
 * usage and source project; admins rename, re-tag and delete them. Templates
 * carry no commercial data, so the list is safe for every role.
 */
export async function TemplatesSettingsSection({ user }: { user: User }) {
  const templates = await listCustomTemplatesWithMeta();
  return (
    <Card className="overflow-hidden">
      <TemplatesManager templates={templates} isAdmin={user.role === "admin"} />
    </Card>
  );
}
