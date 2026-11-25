import { NextResponse } from "next/server";
import { getVerification } from "@/server/context";
import { handle } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// INT-015. Every entry is re-checked against the disk now; a missing file is returned as unavailable.
export function GET(_request: Request, ctx: { params: Promise<{ runId: string }> }) {
  return handle(async () => {
    const { runId } = await ctx.params;
    return NextResponse.json({ evidence: getVerification().listEvidence(runId) });
  });
}
