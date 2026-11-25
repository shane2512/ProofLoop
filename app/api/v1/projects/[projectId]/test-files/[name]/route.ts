import { NextResponse } from "next/server";
import { getService } from "@/server/context";
import { assertLocalOrigin, handle, readJsonBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; name: string }> };

export function GET(_request: Request, ctx: Ctx) {
  return handle(async () => {
    const { projectId, name } = await ctx.params;
    return NextResponse.json({ file: getService().readTestFile(projectId, name) });
  });
}

// Creates or replaces <name>_test.md. Editing a file a criterion already passed makes that pass stale.
export function PUT(request: Request, ctx: Ctx) {
  return handle(async () => {
    assertLocalOrigin(request);
    const { projectId, name } = await ctx.params;
    const file = getService().writeTestFile(projectId, name, await readJsonBody(request));
    return NextResponse.json({ file });
  });
}
