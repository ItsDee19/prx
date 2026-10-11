"use client";

import { useEffect, useState } from "react";
import { cn, formatDate, formatDateTime, relativeTime } from "@/lib/utils";

export interface TimeAgoProps {
  /** ISO timestamp or "YYYY-MM-DD". */
  date: string;
  className?: string;
}

/**
 * Renders the deterministic absolute date on the server, then switches to a
 * relative label ("5m ago") after mount so server and client markup match.
 */
export function TimeAgo({ date, className }: TimeAgoProps) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLabel(relativeTime(date));
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, [date]);

  return (
    <time dateTime={date} title={formatDateTime(date)} className={cn("whitespace-nowrap", className)}>
      {label ?? formatDate(date)}
    </time>
  );
}
