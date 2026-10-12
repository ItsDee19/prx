"use client";

import { useEffect } from "react";
import Link from "next/link";
import { House, RotateCcw, TriangleAlert } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { AuroraBackground } from "@/components/motion/aurora-background";
import { Reveal } from "@/components/motion/reveal";
import { Button, buttonVariants } from "@/components/ui/button";

/** Route-level error boundary: shown instead of a page (and its shell) when it throws. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
        <div aria-hidden className="relative mx-auto flex size-14 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--danger)_22%,transparent),transparent_70%)]" />
          <span className="relative flex size-12 items-center justify-center rounded-2xl border border-border bg-surface text-danger shadow-card animate-float">
            <TriangleAlert className="size-5" />
          </span>
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-[-0.02em] text-fg">Something went wrong.</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted text-pretty [overflow-wrap:anywhere]">
          This page could not be loaded. Try again, and if it keeps happening, let an admin know.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-fg-muted">
            Reference <span className="font-mono text-fg">{error.digest}</span>
          </p>
        ) : null}
        <div className="mt-7 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
            <House aria-hidden />
            Go to Home
          </Link>
          <Button onClick={reset}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
        </div>
      </Reveal>
    </div>
  );
}
