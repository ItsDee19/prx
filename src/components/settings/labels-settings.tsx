import { Card } from "@/components/ui/card";
import { listLabelsWithUsage } from "@/lib/data/labels";
import type { User } from "@/lib/types";
import { LabelsManager } from "./labels-manager";

/** Settings > Labels (registry entry): the catalogue with usage counts. */
export async function LabelsSettings({ user }: { user: User }) {
  const labels = await listLabelsWithUsage();
  return (
    <Card className="overflow-hidden">
      <LabelsManager labels={labels} isAdmin={user.role === "admin"} />
    </Card>
  );
}
