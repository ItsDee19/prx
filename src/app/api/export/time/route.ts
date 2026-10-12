import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { TIME_ENTRY_LIST_MAX_LIMIT, listTimeEntries, listUserCostRates } from "@/lib/data/time";
import { timeExportQuerySchema } from "@/lib/schemas/time";
import { minutesToHours } from "@/lib/duration";
import { toCsv } from "@/lib/utils";

export const dynamic = "force-dynamic";

function json(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * CSV of time entries (SPEC.md section 19.2): `?from&to&user&project&client`.
 * The session is checked here (the middleware only checks the cookie).
 * Members always get their own entries only; admins any user (or everyone
 * without `user`). Cost columns (cost rate, cost) are added for admins only.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json(401, "Sign in to export time.");

  const url = new URL(request.url);
  const parsed = timeExportQuerySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    user: url.searchParams.get("user") ?? undefined,
    project: url.searchParams.get("project") ?? undefined,
    client: url.searchParams.get("client") ?? undefined,
  });
  if (!parsed.success) return json(400, parsed.error.issues[0]?.message ?? "Invalid export filters.");
  const query = parsed.data;
  if (query.from && query.to && query.from > query.to) return json(400, "from must be on or before to.");

  const isAdmin = user.role === "admin";
  const userId = isAdmin ? (query.user ?? undefined) : user.id;

  try {
    const [entries, rates, today] = await Promise.all([
      listTimeEntries({
        userId,
        projectId: query.project ?? undefined,
        clientId: query.client ?? undefined,
        from: query.from ?? undefined,
        to: query.to ?? undefined,
        limit: TIME_ENTRY_LIST_MAX_LIMIT,
      }),
      isAdmin ? listUserCostRates() : Promise.resolve([]),
      getWorkspaceToday(),
    ]);
    const rateByUser = new Map(rates.map((rate) => [rate.user_id, rate.cost_rate]));

    const headers = [
      "Date",
      "Person",
      "Email",
      "Client",
      "Project",
      "Task key",
      "Task",
      "Phase",
      "Hours",
      "Minutes",
      "Billable",
      "Source",
      "Note",
      ...(isAdmin ? ["Cost rate (INR/h)", "Cost (INR)"] : []),
    ];
    const rows = entries.map((entry) => {
      const base = [
        entry.entry_date,
        entry.user.name,
        entry.user.email,
        entry.project.client_code,
        entry.project.name,
        entry.task?.key ?? null,
        entry.task?.title ?? null,
        entry.milestone_name,
        minutesToHours(entry.minutes, 2),
        entry.minutes,
        entry.billable ? "yes" : "no",
        entry.source,
        entry.note,
      ];
      if (!isAdmin) return base;
      const rate = rateByUser.get(entry.user_id) ?? null;
      return [...base, rate, rate === null ? null : Math.round((entry.minutes / 60) * rate)];
    });

    const dates = entries.map((entry) => entry.entry_date).sort();
    const from = query.from ?? dates[0] ?? today;
    const to = query.to ?? dates[dates.length - 1] ?? today;
    return new NextResponse(toCsv(headers, rows), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="time-${from}-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/export/time", error);
    return json(500, "Could not export time. Please try again.");
  }
}
