import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness check for load balancers and uptime monitors: verifies the database opens. */
export function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error", message: "Database unavailable" }, { status: 503 });
  }
}
