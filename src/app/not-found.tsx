import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Brand />
      <div className="mt-8 w-full max-w-md rounded-lg border border-border bg-surface px-6 py-10 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-surface-2 text-fg-muted">
          <SearchX className="size-5" aria-hidden />
        </div>
        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-fg-subtle">Error 404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-fg-muted">
          The page you are looking for does not exist or may have been moved. Check the address or
          head back to your dashboard.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/dashboard" className={buttonVariants({ variant: "primary" })}>
            <ArrowLeft aria-hidden />
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
