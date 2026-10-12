import { createElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TextShineProps {
  children: ReactNode;
  as?: "span" | "h1" | "h2" | "p" | "div";
  className?: string;
}

/**
 * The AvlysAI text-shine motif: a blue highlight sweeps across the text once
 * (1.2s) when it first appears, then the text rests in the normal foreground
 * colour. Reserved for the PRX wordmark and the auth headline. Static with
 * reduced motion; plain text in forced-colors mode. Server-safe.
 */
export function TextShine({ children, as = "span", className }: TextShineProps) {
  return createElement(as, { className: cn("text-shine", className) }, children);
}
