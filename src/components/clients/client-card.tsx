import Link from "next/link";
import { Archive, BadgeCheck, Clock, FolderKanban, Lock } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { MoneyTotals } from "@/components/ui/money";
import { RagDot } from "@/components/ui/rag-dot";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { CLIENT_REGION_CONFIG, RAG_ORDER } from "@/lib/constants";
import { formatHours } from "@/lib/duration";
import { currenciesWithValue } from "@/lib/money";
import type { ClientWithMeta } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";

/** The client's code on its colour: the visual anchor of cards and the detail header. */
export function ClientMonogram({
  client,
  size = "md",
  className,
}: {
  client: Pick<ClientWithMeta, "code" | "color">;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-mono font-semibold tracking-tight text-white shadow-card",
        size === "lg" ? "size-14 text-sm" : "size-11 text-xs",
        className,
      )}
      style={{ backgroundColor: client.color }}
    >
      {client.code.slice(0, 4)}
    </span>
  );
}

export interface ClientCardProps {
  client: ClientWithMeta;
  /** Admins also see the active contract value per currency (members get `commercial: null`). */
  isAdmin: boolean;
  className?: string;
}

/**
 * One client in the /clients grid: monogram, name, code, industry and region,
 * engagement counts, health of open engagements, hours logged and (admins)
 * active contract value per currency. The whole card opens the client.
 */
export function ClientCard({ client, isAdmin, className }: ClientCardProps) {
  const region = CLIENT_REGION_CONFIG[client.region];
  const healthEntries = RAG_ORDER.map((health) => ({ health, count: client.health_counts[health] })).filter(
    (entry) => entry.count > 0,
  );
  const commercial = isAdmin ? client.commercial : null;
  const hasContracts = commercial ? currenciesWithValue(commercial.active_contracted).length > 0 : false;

  return (
    <SpotlightCard
      as="article"
      className={cn(
        "group flex h-full flex-col p-4 transition-[border-color,box-shadow,transform] duration-(--dur-2) ease-out-quart",
        "hover:-translate-y-px hover:border-border-strong hover:shadow-pop motion-reduce:hover:translate-y-0",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-bg",
        client.archived_at && "opacity-80",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <ClientMonogram client={client} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-5 text-fg">
            <Link
              href={`/clients/${client.id}`}
              className="outline-none transition-colors duration-(--dur-2) after:absolute after:inset-0 after:z-10 after:rounded-2xl group-hover:text-accent"
            >
              {client.name}
            </Link>
          </h3>
          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-fg-muted">
            <span className="font-mono font-semibold text-fg">{client.code}</span>
            {client.industry ? (
              <>
                <span aria-hidden className="text-fg-subtle">
                  ·
                </span>
                <span className="min-w-0 truncate">{client.industry}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-surface-2 px-2 text-[11px] font-medium text-fg-muted ring-1 ring-inset ring-border">
            <Icon name={region.icon} className="size-3" aria-hidden />
            {region.shortLabel}
            <span className="sr-only"> ({region.label})</span>
            <span aria-hidden className="text-fg-subtle">
              ·
            </span>
            {client.currency}
          </span>
        </div>
      </div>

      {client.confidential || client.nda_signed || client.archived_at ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {client.confidential ? (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-surface-2 px-2 text-[11px] font-medium text-fg ring-1 ring-inset ring-border">
              <Lock className="size-3" aria-hidden />
              Confidential
            </span>
          ) : null}
          {client.nda_signed ? (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-emerald-50 px-2 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30">
              <BadgeCheck className="size-3" aria-hidden />
              NDA
            </span>
          ) : null}
          {client.archived_at ? (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-surface-2 px-2 text-[11px] font-medium text-fg-muted ring-1 ring-inset ring-border">
              <Archive className="size-3" aria-hidden />
              Archived
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto pt-4">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-xs">
          <div className="min-w-0">
            <dt className="text-fg-subtle">Engagements</dt>
            <dd className="mt-0.5 flex items-center gap-1 font-medium tabular-nums text-fg">
              <FolderKanban className="size-3.5 text-fg-subtle" aria-hidden />
              {client.active_project_count}
              <span className="font-normal text-fg-muted">active of {client.project_count}</span>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-fg-subtle">Logged</dt>
            <dd className="mt-0.5 flex items-center gap-1 font-medium tabular-nums text-fg">
              <Clock className="size-3.5 text-fg-subtle" aria-hidden />
              {formatHours(client.logged_minutes)}
            </dd>
          </div>
          <div className="col-span-2 min-w-0">
            <dt className="text-fg-subtle">Health of open engagements</dt>
            <dd className="mt-1 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1">
              {healthEntries.length === 0 ? (
                <span className="text-fg-muted">No status updates yet.</span>
              ) : (
                healthEntries.map((entry) => (
                  <span key={entry.health} className="inline-flex items-center gap-1 tabular-nums text-fg">
                    <RagDot health={entry.health} />
                    {entry.count}
                    <span className="sr-only">{pluralize(entry.count, "engagement")}</span>
                  </span>
                ))
              )}
            </dd>
          </div>
          {commercial ? (
            <div className="col-span-2 min-w-0">
              <dt className="flex items-center gap-1 text-fg-subtle">
                <Lock className="size-3" aria-hidden />
                Active contracts
              </dt>
              <dd className="mt-0.5 font-medium text-fg">
                {hasContracts ? <MoneyTotals totals={commercial.active_contracted} compact /> : <span className="text-fg-muted">None recorded</span>}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </SpotlightCard>
  );
}
