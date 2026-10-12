import type { Metadata } from "next";
import { Reveal } from "@/components/motion";
import { visibleSettingsSections } from "@/components/settings/registry";
import { SettingsSection } from "@/components/settings/settings-section";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const sections = visibleSettingsSections(user.role === "admin");

  return (
    // Reading-width column, centred in the (up to 1920px) content area on large monitors.
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Settings"
        description={
          user.role === "admin"
            ? "Your profile, how PRX looks, and the workspace defaults."
            : "Your profile, password, how PRX looks and the label catalogue."
        }
      />

      <nav aria-label="Settings sections" className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#settings-${section.id}`}
                className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-xs font-medium text-fg-muted outline-none transition-colors duration-(--dur-2) hover:border-border-strong hover:text-fg focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-10"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-8 xl:space-y-10">
        {sections.map((section, index) => {
          const Component = section.component;
          return (
            <Reveal key={section.id} delay={Math.min(index, 7) * 0.035}>
              <SettingsSection
                id={`settings-${section.id}`}
                title={section.title}
                description={section.description}
                className="scroll-mt-24"
              >
                <Component user={user} />
              </SettingsSection>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
