import { NextResponse } from "next/server";
import { getService } from "@/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// INT-016. Reports storage status only; no paths, environment, or Kane details.
export function GET() {
  try {
    if (getService().storageReady()) return NextResponse.json({ status: "ok", storage: "ready" });
  } catch {
    // Fall through to the sanitized degraded response.
  }
  return NextResponse.json({ status: "degraded", storage: "unavailable" }, { status: 503 });
}
