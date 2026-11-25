import { NextResponse } from "next/server";
import { getService } from "@/server/context";
import { assertLocalOrigin, handle, readJsonBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// INT-006
export function POST(request: Request, ctx: { params: Promise<{ projectId: string }> }) {
  return handle(async () => {
    assertLocalOrigin(request);
    const { projectId } = await ctx.params;
    const criterion = getService().createCriterion(projectId, await readJsonBody(request));
    return NextResponse.json({ criterion }, { status: 201 });
  });
}
