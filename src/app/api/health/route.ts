import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness check for load balancers and uptime monitors: verifies the database answers. */
export async function GET() {
  try {
    await pingDatabase();
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Health check: database unavailable", error);
    return NextResponse.json({ status: "error", message: "Database unavailable" }, { status: 503 });
  }
}
