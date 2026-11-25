import { NextResponse } from "next/server";
import { getService } from "@/server/context";
import { assertLocalOrigin, handle, noContent, readJsonBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

// INT-003
export function GET(_request: Request, ctx: Ctx) {
  return handle(async () => {
    const { projectId } = await ctx.params;
    return NextResponse.json(getService().getProject(projectId));
  });
}

// INT-004
export function PATCH(request: Request, ctx: Ctx) {
  return handle(async () => {
    assertLocalOrigin(request);
    const { projectId } = await ctx.params;
    const project = getService().updateProject(projectId, await readJsonBody(request));
    return NextResponse.json({ project });
  });
}

// INT-005 (soft archive)
export function DELETE(request: Request, ctx: Ctx) {
  return handle(async () => {
    assertLocalOrigin(request);
    const { projectId } = await ctx.params;
    getService().archiveProject(projectId);
    return noContent();
  });
}
