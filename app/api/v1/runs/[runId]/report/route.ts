import { AppError } from "@/server/errors";
import { getVerification } from "@/server/context";
import { handle } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// INT-013. `format=markdown` (default) or `json`. `includeOutput=true` adds raw stdout and stderr to the
// JSON export only, and is never implied (FR-019).
export function GET(request: Request, ctx: { params: Promise<{ runId: string }> }) {
  return handle(async () => {
    const { runId } = await ctx.params;
    const q = new URL(request.url).searchParams;
    const format = q.get("format") ?? "markdown";
    if (format !== "markdown" && format !== "json") {
      throw new AppError("VALIDATION_ERROR", "format must be markdown or json.", 400, { field: "format" });
    }
    const flag = q.get("includeOutput");
    if (flag !== null && flag !== "true" && flag !== "false") {
      throw new AppError("VALIDATION_ERROR", "includeOutput must be true or false.", 400, { field: "includeOutput" });
    }
    if (flag === "true" && format !== "json") {
      throw new AppError("VALIDATION_ERROR", "includeOutput only applies to the json format.", 400, { field: "includeOutput" });
    }
    const report = getVerification().buildReport(runId, format, flag === "true");
    return new Response(report.body, {
      status: 200,
      headers: {
        "content-type": report.contentType,
        "content-disposition": `attachment; filename="${report.fileName}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
