import { NextResponse } from "next/server";
import { AppError } from "@/server/errors";
import { getVerification } from "@/server/context";
import { handle } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// INT-011
export function GET(request: Request, ctx: { params: Promise<{ projectId: string }> }) {
  return handle(async () => {
    const { projectId } = await ctx.params;
    const q = new URL(request.url).searchParams;
    const limitRaw = q.get("limit");
    let limit: number | null = null;
    if (limitRaw !== null) {
      limit = Number(limitRaw);
      if (!/^\d+$/.test(limitRaw)) throw new AppError("VALIDATION_ERROR", "limit must be an integer between 1 and 100.", 400, { field: "limit" });
    }
    const result = getVerification().listRuns(projectId, { criterionId: q.get("criterionId"), limit, cursor: q.get("cursor") });
    return NextResponse.json(result);
  });
}
