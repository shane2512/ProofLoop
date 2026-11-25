import { NextResponse } from "next/server";
import { getVerification } from "@/server/context";
import { handle } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// INT-010. Extra fields beyond api-spec.md: `kane` (bounded stream summary) and `command` (redacted argv).
export function GET(_request: Request, ctx: { params: Promise<{ runId: string }> }) {
  return handle(async () => {
    const { runId } = await ctx.params;
    return NextResponse.json(getVerification().getRunDetail(runId));
  });
}
