import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Archive, BadgeCheck, Clock, ExternalLink, FolderKanban, Lock, Mail, ShieldCheck, UserRound } from "lucide-react";
import { ClientActions } from "@/components/clients/client-actions";
import { ClientActivity } from "@/components/clients/client-activity";
import { ClientMonogram } from "@/components/clients/client-card";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { ProjectCard } from "@/components/projects/project-card";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { StatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { MoneyTotals } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { RagDot } from "@/components/ui/rag-dot";
import { requireUser } from "@/lib/auth";
import { CLIENT_REGION_CONFIG, RAG_ORDER, STATUS_ORDER } from "@/lib/constants";
import { getAppSettings } from "@/lib/data/app-settings";
import { clientRecord, getClient, listClientActivity } from "@/lib/data/clients";
import { listProjects } from "@/lib/data/projects";
import { listUserSummaries } from "@/lib/data/users";
import { formatHours } from "@/lib/duration";
import type { ClientCommercialSummary, ProjectStatus, ProjectWithMeta, WorkspaceDateContext } from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { safeTimeZone, workspaceToday } from "@/lib/workspace-time";

interface ClientPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ClientPageProps): Promise<Metadata> {
  const { id } = await params;
  const client = await getClient(id);
  return { title: client ? client.name : "Client not found" };
}

const PILL = "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset";

const COMMERCIAL_ROWS: { key: keyof ClientCommercialSummary; label: string; hint: string }[] = [
  { key: "contracted", label: "Contracted", hint: "All engagements" },
  { key: "active_contracted", label: "Active", hint: "Open engagements" },
  { key: "invoiced", label: "Invoiced", hint: "Phase prices invoiced or paid" },
  { key: "paid", label: "Paid", hint: "Phase prices paid" },
];

function groupByStatus(projects: ProjectWithMeta[]): { status: ProjectStatus; projects: ProjectWithMeta[] }[] {
  return STATUS_ORDER.map((status) => ({ status, projects: projects.filter((project) => project.status === status) })).filter(
    (group) => group.projects.length > 0,
  );
}

export default async function ClientPage({ params }: ClientPageProps) {
  const { id } = await params;
  const user = await requireUser();
  const isAdmin = user.role === "admin";

  const client = await getClient(id, { includeCommercial: isAdmin });
  if (!client) notFound();

  // Engagement cards never show amounts, so they load without commercial fields.
  const [projects, users, activity, settings] = await Promise.all([
    listProjects({ clientId: client.id, parentId: null, sort: "updated" }),
    listUserSummaries(),
    listClientActivity(client.id, 20),
    getAppSettings(),
  ]);
  const timeZone = safeTimeZone(settings.workspace_timezone);
  const workspace: WorkspaceDateContext = {
    today: workspaceToday(timeZone),
    timeZone,
    cadenceDays: settings.update_cadence_days,
  };
  const region = CLIENT_REGION_CONFIG[client.region];
  const groups = groupByStatus(projects);
  const healthEntries = RAG_ORDER.map((health) => ({ health, count: client.health_counts[health] })).filter(
    (entry) => entry.count > 0,
  );
  const hasContact = Boolean(client.contact_name || client.contact_email || client.contact_role || client.website);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Clients", href: "/clients" }, { label: client.name }]}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <ClientMonogram client={client} />
            <span className="min-w-0">{client.name}</span>
          </span>
        }
        description={
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`${PILL} bg-surface-2 font-mono font-semibold text-fg ring-border`}>{client.code}</span>
            {client.industry ? <span className={`${PILL} bg-surface text-fg-muted ring-border`}>{client.industry}</span> : null}
            <span className={`${PILL} bg-surface text-fg-muted ring-border`}>
              <Icon name={region.icon} className="size-3.5" aria-hidden />
              {region.label}
            </span>
            <span className={`${PILL} bg-surface text-fg-muted ring-border`}>Bills in {client.currency}</span>
            {client.nda_signed ? (
              <span className={`${PILL} bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30`}>
                <BadgeCheck className="size-3.5" aria-hidden />
                NDA signed
              </span>
            ) : null}
            {client.dpa_signed ? (
              <span className={`${PILL} bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30`}>
                <ShieldCheck className="size-3.5" aria-hidden />
                DPA signed
              </span>
            ) : null}
            {client.confidential ? (
              <span className={`${PILL} bg-surface-2 text-fg ring-border`}>
                <Lock className="size-3.5" aria-hidden />
                Confidential
              </span>
            ) : null}
            {client.archived_at ? (
              <span className={`${PILL} bg-surface-2 text-fg-muted ring-border`}>
                <Archive className="size-3.5" aria-hidden />
                Archived
              </span>
            ) : null}
          </div>
        }
        actions={<ClientActions client={clientRecord(client)} users={users} isAdmin={isAdmin} projectCount={client.project_count} />}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] 3xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="min-w-0 space-y-6">
          <Reveal>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-card">
                <dt className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <FolderKanban className="size-3.5" aria-hidden />
                  Active engagements
                </dt>
                <dd className="mt-1 text-[1.75rem] font-semibold leading-9 tracking-tight tabular-nums text-fg">
                  {client.active_project_count}
                </dd>
              </div>
              <div className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-card">
                <dt className="text-xs text-fg-muted">All engagements</dt>
                <dd className="mt-1 text-[1.75rem] font-semibold leading-9 tracking-tight tabular-nums text-fg">
                  {client.project_count}
                </dd>
              </div>
              <div className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-card">
                <dt className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <Clock className="size-3.5" aria-hidden />
                  Hours logged
                </dt>
                <dd className="mt-1 text-[1.75rem] font-semibold leading-9 tracking-tight tabular-nums text-fg">
                  {formatHours(client.logged_minutes)}
                </dd>
              </div>
              <div className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-card">
                <dt className="text-xs text-fg-muted">Health</dt>
                <dd className="mt-2 flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
                  {healthEntries.length === 0 ? (
                    <span className="text-sm text-fg-muted">No updates yet.</span>
                  ) : (
                    healthEntries.map((entry) => (
                      <span key={entry.health} className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums text-fg">
                        <RagDot health={entry.health} size="md" />
                        {entry.count}
                      </span>
                    ))
                  )}
                </dd>
              </div>
            </dl>
          </Reveal>

          <section aria-labelledby="client-engagements" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 id="client-engagements" className="text-base font-semibold text-fg">
                Engagements
              </h2>
              <span className="text-sm tabular-nums text-fg-muted">{pluralize(projects.length, "engagement")}</span>
            </div>
            {groups.length === 0 ? (
              <EmptyState
                icon={FolderKanban}
                title="No engagements yet."
                description={`Start the first engagement for ${client.name}.`}
                action={
                  <ProjectDialog
                    mode="create"
                    users={users}
                    defaults={{ client_id: client.id, currency: client.currency }}
                    trigger={<Button>New engagement</Button>}
                  />
                }
              />
            ) : (
              groups.map((group) => (
                <div key={group.status} className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={group.status} />
                    <span className="text-xs tabular-nums text-fg-muted">{group.projects.length}</span>
                  </div>
                  <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {group.projects.map((project) => (
                      <StaggerItem key={project.id} className="min-w-0">
                        <ProjectCard project={project} workspace={workspace} compact className="h-full" />
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>
              ))
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Client details">
          {isAdmin && client.commercial ? (
            <Reveal delay={0.04}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="min-w-0">
                    <CardTitle>Commercial summary</CardTitle>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted">
                      <Lock className="size-3" aria-hidden />
                      Admins only. INR and USD are reported separately.
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="divide-y divide-border">
                    {COMMERCIAL_ROWS.map((row) => (
                      <div key={row.key} className="flex items-baseline justify-between gap-3 py-2.5">
                        <dt className="min-w-0">
                          <span className="block text-sm text-fg">{row.label}</span>
                          <span className="block text-xs text-fg-subtle">{row.hint}</span>
                        </dt>
                        <dd className="text-right text-sm font-semibold text-fg">
                          <MoneyTotals totals={client.commercial?.[row.key] ?? { INR: 0, USD: 0 }} compact className="justify-end" />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            </Reveal>
          ) : null}

          <Reveal delay={0.08}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                {hasContact ? (
                  <>
                    {client.contact_name || client.contact_role ? (
                      <p className="flex min-w-0 items-start gap-2">
                        <UserRound className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          <span className="font-medium text-fg">{client.contact_name ?? "Contact"}</span>
                          {client.contact_role ? <span className="text-fg-muted">, {client.contact_role}</span> : null}
                        </span>
                      </p>
                    ) : null}
                    {client.contact_email ? (
                      <p className="flex min-w-0 items-center gap-2">
                        <Mail className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                        <a
                          href={`mailto:${client.contact_email}`}
                          className="min-w-0 truncate rounded text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {client.contact_email}
                        </a>
                      </p>
                    ) : null}
                    {client.website ? (
                      <p className="flex min-w-0 items-center gap-2">
                        <ExternalLink className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                        <a
                          href={client.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 truncate rounded text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {client.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-fg-muted">No contact details yet. Add them with Edit.</p>
                )}
                {client.systems.length > 0 ? (
                  <div className="border-t border-border pt-3">
                    <p className="mb-2 text-xs font-medium text-fg-muted">Systems they run</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {client.systems.map((system) => (
                        <li
                          key={system}
                          className="inline-flex h-6 max-w-full items-center rounded-full bg-surface-2 px-2.5 text-xs font-medium text-fg ring-1 ring-inset ring-border"
                        >
                          <span className="truncate">{system}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {client.notes ? (
                  <div className="border-t border-border pt-3">
                    <p className="mb-1 text-xs font-medium text-fg-muted">Notes</p>
                    <p className="whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">{client.notes}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </Reveal>

          <Reveal delay={0.12}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ClientActivity activity={activity} />
              </CardContent>
            </Card>
          </Reveal>
        </aside>
      </div>
    </div>
  );
}
