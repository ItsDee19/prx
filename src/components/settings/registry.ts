import type { ComponentType } from "react";
import { TemplatesSettingsSection } from "@/components/templates/templates-settings-section";
import type { User } from "@/lib/types";
import { PasswordSettings, ProfileSettings } from "./account-settings";
import { AppearanceCard } from "./appearance-card";
import { LabelsSettings } from "./labels-settings";
import { WorkspaceSettings } from "./workspace-settings";

/**
 * Settings sections registry (SPEC.md section 20.4). The settings page renders
 * the entries sorted by `order` (admin-only ones filtered out for members),
 * each inside a SettingsSection with its title and description. Adding a
 * section is one entry here (templates at 50, added by the W4 integration).
 */
export interface SettingsSectionEntry {
  id: string;
  title: string;
  description: string;
  order: number;
  adminOnly?: boolean;
  /** Server or client component; async server components load their own data. */
  component: ComponentType<{ user: User }>;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionEntry[] = [
  {
    id: "profile",
    title: "Profile",
    description: "How you appear to the rest of the team.",
    order: 0,
    component: ProfileSettings,
  },
  {
    id: "password",
    title: "Password",
    description: "Choose a strong password you do not use anywhere else. Other devices stay signed in.",
    order: 10,
    component: PasswordSettings,
  },
  {
    id: "appearance",
    title: "Appearance",
    description: "Theme, motion and transparency on this device.",
    order: 20,
    component: AppearanceCard,
  },
  {
    id: "workspace",
    title: "Workspace",
    description: "Time zone, USD to INR rate and delivery defaults for everyone. Admins only.",
    order: 30,
    adminOnly: true,
    component: WorkspaceSettings,
  },
  {
    id: "labels",
    title: "Labels",
    description: "Tech stack, domain and general tags for projects and tasks.",
    order: 40,
    component: LabelsSettings,
  },
  {
    id: "templates",
    title: "Templates",
    description: "Custom engagement templates saved from projects.",
    order: 50,
    adminOnly: true,
    component: TemplatesSettingsSection,
  },
];

/** The sections a user sees, in order. */
export function visibleSettingsSections(isAdmin: boolean): SettingsSectionEntry[] {
  return SETTINGS_SECTIONS.filter((entry) => !entry.adminOnly || isAdmin).sort((a, b) => a.order - b.order);
}
