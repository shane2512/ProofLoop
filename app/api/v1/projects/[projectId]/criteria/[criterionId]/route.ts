import { NextResponse } from "next/server";
import { getService } from "@/server/context";
import { assertLocalOrigin, handle, noContent, readJsonBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; criterionId: string }> };

// INT-007
export function PATCH(request: Request, ctx: Ctx) {
  return handle(async () => {
    assertLocalOrigin(request);
    const { projectId, criterionId } = await ctx.params;
    const criterion = getService().updateCriterion(projectId, criterionId, await readJsonBody(request));
    return NextResponse.json({ criterion });
  });
}

// INT-008 (soft delete)
export function DELETE(request: Request, ctx: Ctx) {
  return handle(async () => {
    assertLocalOrigin(request);
    const { projectId, criterionId } = await ctx.params;
    getService().deleteCriterion(projectId, criterionId);
    return noContent();
  });
}
