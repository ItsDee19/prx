"use client";

import type { ReactNode } from "react";
import { Layers, Monitor, Pause, Sparkles, Square, type LucideIcon } from "lucide-react";
import { useTheme, THEME_OPTIONS } from "@/components/layout/theme-toggle";
import { useMotionPreference, useTransparencyPreference } from "@/components/motion/use-motion-preference";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { MotionPreference, TransparencyPreference } from "@/lib/constants";

const MOTION_OPTIONS: { value: MotionPreference; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "reduce", label: "Reduced", icon: Pause },
  { value: "full", label: "Full", icon: Sparkles },
];

const TRANSPARENCY_OPTIONS: { value: TransparencyPreference; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "System", icon: Layers },
  { value: "reduce", label: "Reduced", icon: Square },
];

function PreferenceRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    // Size container: label and control share a row once the card is >= 28rem wide.
    <div className="@container px-5 py-4 first:pt-5 last:pb-5">
      <div className="flex flex-col gap-3 @md:flex-row @md:items-center @md:justify-between @md:gap-6">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-5 text-fg">{title}</p>
          <p className="mt-0.5 text-sm text-fg-muted text-pretty">{description}</p>
        </div>
        {/*
         * Full-width, equal segments in a narrow card; natural width otherwise. Taller on touch.
         * Below 20rem of row width the icons step aside so every label fits (320px phones).
         */}
        <div className="w-full shrink-0 @md:w-auto [&>div]:w-full @md:[&>div]:w-auto [&_button]:flex-1 @md:[&_button]:flex-none @max-xs:[&_svg]:hidden pointer-coarse:[&_button]:h-10">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Settings > Appearance: theme, motion and transparency for this device
 * (localStorage, applied to <html> at once and before the first paint on later
 * visits), so there is nothing to save server-side. The settings registry
 * renders it inside its "Appearance" section.
 */
export function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const { motion, setMotion } = useMotionPreference();
  const { transparency, setTransparency } = useTransparencyPreference();

  return (
    <Card className="divide-y divide-border">
      <PreferenceRow title="Theme" description="System follows your operating system setting.">
        <SegmentedControl value={theme} onChange={setTheme} options={THEME_OPTIONS} ariaLabel="Theme" />
      </PreferenceRow>
      <PreferenceRow
        title="Motion"
        description="Reduced keeps feedback but stops ambient and decorative animation. Full ignores the system setting."
      >
        <SegmentedControl value={motion} onChange={setMotion} options={MOTION_OPTIONS} ariaLabel="Motion" />
      </PreferenceRow>
      <PreferenceRow
        title="Transparency"
        description="Reduced swaps the frosted glass on menus, dialogs and the top bar for solid surfaces."
      >
        <SegmentedControl
          value={transparency}
          onChange={setTransparency}
          options={TRANSPARENCY_OPTIONS}
          ariaLabel="Transparency"
        />
      </PreferenceRow>
    </Card>
  );
}
