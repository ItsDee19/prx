import type { ReactNode } from "react";
import { Gauge, Layers, SquareKanban, type LucideIcon } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { ThemeSwitchButton } from "@/components/layout/theme-toggle";
import { AuroraBackground } from "@/components/motion/aurora-background";
import { ParticlesCanvas } from "@/components/motion/particles-canvas";
import { Reveal } from "@/components/motion/reveal";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { TextShine } from "@/components/motion/text-shine";
import { APP_NAME, APP_TAGLINE, COMPANY_NAME } from "@/lib/constants";

interface ValueBullet {
  icon: LucideIcon;
  title: string;
  description: string;
}

const VALUE_BULLETS: ValueBullet[] = [
  {
    icon: Layers,
    title: "Engagements, phases and gates",
    description: "Run every client engagement from audit to scale, with go/no-go decisions on record.",
  },
  {
    icon: SquareKanban,
    title: "Tasks on boards and lists",
    description: "Break each phase into tasks and deliverables, and move them along as work lands.",
  },
  {
    icon: Gauge,
    title: "Health at a glance",
    description: "Weekly status, risks and success metrics keep every delivery honest.",
  },
];

/**
 * Two columns on lg+ (brand panel left, form right); a single centred column
 * with the brand above the form below that. Pages render only their heading
 * and form; the layout puts them on a glass card over the Aurora background.
 *
 * On very wide screens the form side gets the larger share and the brand copy
 * grows a step, so neither half turns into an empty slab. Short screens
 * (landscape phones) simply scroll: the form column grows with its content.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate grid min-h-dvh lg:grid-cols-2 3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <AuroraBackground />

      {/* Brand panel (lg+ only) */}
      <aside
        aria-label={`About ${APP_NAME}`}
        className="relative hidden overflow-hidden border-r border-border bg-sidebar/70 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16 3xl:p-24"
      >
        {/* Particle network, fading out towards the bottom of the panel. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,#000_35%,transparent_95%)]">
          <ParticlesCanvas />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-[radial-gradient(circle,var(--glow-2),transparent_70%)] 3xl:size-[40rem]"
        />

        <Reveal className="relative">
          <Brand size="md" />
        </Reveal>

        <div className="relative max-w-md 3xl:max-w-xl">
          <Reveal delay={0.05}>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium text-accent-soft-fg shadow-card 3xl:text-sm">
              <span aria-hidden className="size-1.5 rounded-full bg-grad-brand" />
              {COMPANY_NAME}
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <TextShine
              as="h2"
              className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.025em] xl:text-4xl xl:leading-[1.15] 3xl:text-5xl"
            >
              {APP_TAGLINE}
            </TextShine>
          </Reveal>
          <Stagger as="ul" className="mt-10 space-y-6 3xl:mt-12 3xl:space-y-8">
            {VALUE_BULLETS.map(({ icon: Icon, title, description }) => (
              <StaggerItem key={title} as="li" className="flex items-start gap-4">
                <span className="glass flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-accent shadow-card">
                  <Icon aria-hidden className="size-[18px]" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-semibold text-fg 3xl:text-base">{title}</p>
                  <p className="mt-1 text-sm leading-5 text-fg-muted 3xl:text-base 3xl:leading-6">{description}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        <p className="relative text-xs text-fg-muted">Internal tool for the {COMPANY_NAME} team.</p>
      </aside>

      {/* Form column */}
      <main
        className={
          "relative flex min-w-0 flex-col items-center justify-center px-4 sm:px-6 " +
          // 48px gutters, more where a notch or the home indicator needs the room.
          "pb-[max(3rem,calc(env(safe-area-inset-bottom)+1.5rem))] pt-[max(3.5rem,calc(env(safe-area-inset-top)+1.5rem))]"
        }
      >
        <ThemeSwitchButton className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))]" />
        <div className="w-full max-w-sm sm:max-w-[26rem] 3xl:max-w-md">
          <Reveal className="mb-8 flex justify-center lg:hidden">
            <Brand size="md" />
          </Reveal>
          {/* The reveal sits on the glass card itself: an animating ancestor would hide its backdrop blur. */}
          <Reveal
            delay={0.04}
            className="glass-panel rounded-[20px] border border-glass-border px-5 py-7 shadow-pop sm:px-8 sm:py-8"
          >
            <div className="space-y-7">{children}</div>
          </Reveal>
          <p className="mt-6 text-center text-xs text-fg-muted lg:hidden">Internal tool for the {COMPANY_NAME} team.</p>
        </div>
      </main>
    </div>
  );
}
