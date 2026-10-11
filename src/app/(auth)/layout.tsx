import type { ReactNode } from "react";
import { Activity, FolderTree, SquareKanban, type LucideIcon } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { ThemeSwitchButton } from "@/components/layout/theme-toggle";
import { APP_NAME, APP_TAGLINE, COMPANY_NAME } from "@/lib/constants";

interface ValueBullet {
  icon: LucideIcon;
  title: string;
  description: string;
}

const VALUE_BULLETS: ValueBullet[] = [
  {
    icon: FolderTree,
    title: "Sub-projects at any depth",
    description: "Break work down as far as you need and keep the whole tree in view.",
  },
  {
    icon: SquareKanban,
    title: "Board and list views",
    description: "Drag projects across statuses or sort and filter them in a table.",
  },
  {
    icon: Activity,
    title: "Comments and activity",
    description: "Every change is logged, so the team is always on the same page.",
  },
];

/**
 * Two columns on lg+ (brand panel left, form right); a single centred column
 * with the brand above the form below that. Pages render only their heading
 * and form inside the `max-w-sm` column.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel (lg+ only) */}
      <aside
        aria-label={`About ${APP_NAME}`}
        className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16"
      >
        {/* Soft accent wash that reads well on both the light and dark surface. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_0%_0%,var(--accent-soft)_0%,transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-32 size-96 rounded-full bg-accent/10 blur-3xl"
        />

        <div className="relative">
          <Brand size="md" />
        </div>

        <div className="relative max-w-md">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">{COMPANY_NAME}</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-fg xl:text-4xl">
            {APP_TAGLINE}
          </h2>
          <ul className="mt-10 space-y-6">
            {VALUE_BULLETS.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-accent shadow-sm">
                  <Icon aria-hidden className="size-4" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-medium text-fg">{title}</p>
                  <p className="mt-1 text-sm leading-5 text-fg-muted">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-fg-subtle">
          Internal tool for the {COMPANY_NAME} team.
        </p>
      </aside>

      {/* Form column */}
      <main className="relative flex flex-col items-center justify-center px-4 py-12 sm:px-6">
        <ThemeSwitchButton className="absolute right-4 top-4" />
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <Brand size="md" />
          </div>
          <div className="space-y-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
