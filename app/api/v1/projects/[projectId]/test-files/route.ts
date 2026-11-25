import { NextResponse } from "next/server";
import { getService } from "@/server/context";
import { handle } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lists the project's managed test files so a criterion can be mapped to one explicitly.
export function GET(_request: Request, ctx: { params: Promise<{ projectId: string }> }) {
  return handle(async () => {
    const { projectId } = await ctx.params;
    return NextResponse.json({ files: getService().listTestFiles(projectId) });
  });
}
