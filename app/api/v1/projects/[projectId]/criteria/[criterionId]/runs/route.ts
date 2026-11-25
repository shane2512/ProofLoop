import { NextResponse } from "next/server";
import { AppError } from "@/server/errors";
import { getVerification } from "@/server/context";
import { assertLocalOrigin, handle, readJsonBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// INT-009. The body must be exactly `{}`: the caller cannot supply a command, path or credential.
export function POST(request: Request, ctx: { params: Promise<{ projectId: string; criterionId: string }> }) {
  return handle(async () => {
    assertLocalOrigin(request);
    const body = await readJsonBody(request);
    if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length > 0) {
      throw new AppError("VALIDATION_ERROR", "Request body must be an empty JSON object.", 400);
    }
    const { projectId, criterionId } = await ctx.params;
    const started = getVerification().startRun(projectId, criterionId);
    return NextResponse.json(started, { status: 202 });
  });
}
