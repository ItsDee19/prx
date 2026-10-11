"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Route-level error boundary: shown instead of a page when it throws. */
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <AlertTriangle aria-hidden className="size-6" />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-fg">Something went wrong</h1>
      <p className="mt-1 max-w-md text-sm text-fg-muted">
        The page could not be loaded. Try again, and if it keeps happening let an admin know.
        {error.digest ? ` Reference: ${error.digest}` : ""}
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
