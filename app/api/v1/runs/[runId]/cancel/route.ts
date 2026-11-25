import { NextResponse } from "next/server";
import { AppError } from "@/server/errors";
import { getVerification } from "@/server/context";
import { assertLocalOrigin, handle, readJsonBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// INT-012. The final CANCELED status is written only after the process is observed to close.
export function POST(request: Request, ctx: { params: Promise<{ runId: string }> }) {
  return handle(async () => {
    assertLocalOrigin(request);
    const body = await readJsonBody(request);
    if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length > 0) {
      throw new AppError("VALIDATION_ERROR", "Request body must be an empty JSON object.", 400);
    }
    const { runId } = await ctx.params;
    return NextResponse.json(getVerification().cancelRun(runId), { status: 202 });
  });
}
