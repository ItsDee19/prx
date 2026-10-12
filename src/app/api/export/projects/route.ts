import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { exportProjectsCsv } from "@/lib/data/reports";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/projects (SPEC.md section 19.2): every project as CSV,
 * optionally `?client=<id>`. The session is checked here (the middleware
 * only checks that a cookie exists); contract value and hourly rate columns
 * are added for admins only.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to export." }, { status: 401 });

  const url = new URL(request.url);
  const clientId = url.searchParams.get("client")?.trim().slice(0, 64) || undefined;
  try {
    const [csv, today] = await Promise.all([
      exportProjectsCsv(user.role === "admin", { clientId }),
      getWorkspaceToday(),
    ]);
    return new NextResponse(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="projects-${today}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Projects export failed", error);
    return NextResponse.json({ error: "The export failed. Try again." }, { status: 500 });
  }
}
