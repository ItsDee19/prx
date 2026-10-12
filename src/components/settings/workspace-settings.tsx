import { Card } from "@/components/ui/card";
import { DEFAULT_USD_INR_RATE } from "@/lib/constants";
import { getAppSettings } from "@/lib/data/app-settings";
import type { User } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { safeTimeZone, workspaceToday } from "@/lib/workspace-time";
import { WorkspaceSettingsForm } from "./workspace-settings-form";

/** "GMT+5:30" for a zone, or "" when the runtime cannot name the offset. */
function offsetLabel(timeZone: string, now: Date): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((item) => item.type === "timeZoneName");
    return part?.value ?? "";
  } catch {
    return "";
  }
}

function zoneList(current: string): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const all = new Set<string>(zones);
  all.add(current);
  all.add("UTC");
  return [...all].sort((a, b) => a.localeCompare(b));
}

/**
 * Settings > Workspace (registry entry, admin only): loads the settings with
 * the admin-only USD to INR rate. The page filters this section out for
 * members, and it renders nothing for them as a second guard.
 */
export async function WorkspaceSettings({ user }: { user: User }) {
  if (user.role !== "admin") return null;
  const settings = await getAppSettings({ includeCommercial: true });
  const zone = safeTimeZone(settings.workspace_timezone);
  const now = new Date();
  const timeZones = zoneList(zone).map((value) => {
    const offset = offsetLabel(value, now);
    return { value, label: `${value.replace(/_/g, " ")}${offset ? ` · ${offset}` : ""}` };
  });

  return (
    <Card>
      <WorkspaceSettingsForm
        initial={{
          workspace_timezone: zone,
          usd_inr_rate: settings.usd_inr_rate ?? DEFAULT_USD_INR_RATE,
          default_tuning_days: settings.default_tuning_days,
          update_cadence_days: settings.update_cadence_days,
        }}
        timeZones={timeZones}
        todayLabel={formatDate(workspaceToday(zone, now), { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
      />
    </Card>
  );
}
