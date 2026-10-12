import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { AuroraBackground } from "@/components/motion/aurora-background";
import { Reveal } from "@/components/motion/reveal";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
      <AuroraBackground />
      <Reveal>
        <Brand href="/dashboard" />
      </Reveal>
      <Reveal
        delay={0.05}
        className="glass-panel mt-8 w-full max-w-md rounded-[20px] border border-glass-border px-5 py-10 text-center shadow-pop sm:px-8"
      >
        <div aria-hidden className="relative mx-auto flex h-20 w-36 items-center justify-center">
          <span
            className={
              "absolute inset-0 bg-size-[16px_16px] " +
              "bg-[linear-gradient(to_right,var(--grid-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-line)_1px,transparent_1px)] " +
              "[mask-image:radial-gradient(ellipse_at_center,#000_20%,transparent_70%)]"
            }
          />
          <span className="absolute size-20 rounded-full bg-[radial-gradient(circle,var(--glow-1),transparent_70%)]" />
          <span className="relative flex size-12 items-center justify-center rounded-2xl border border-border bg-surface text-accent shadow-card animate-float">
            <Compass className="size-5" />
          </span>
        </div>
        <p className="mt-4 font-mono text-xs font-medium text-fg-muted">Error 404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-fg">Page not found.</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted text-pretty">
          This page does not exist or has moved. Check the address, or head back to Home.
        </p>
        <div className="mt-7 flex justify-center">
          <Link href="/dashboard" className={buttonVariants({ variant: "primary" })}>
            <ArrowLeft aria-hidden />
            Back to Home
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
