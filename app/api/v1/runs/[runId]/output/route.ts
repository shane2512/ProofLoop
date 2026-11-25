import { AppError } from "@/server/errors";
import { getVerification } from "@/server/context";
import { handle } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// INT-014. Plain text, already redacted when it was saved.
export function GET(request: Request, ctx: { params: Promise<{ runId: string }> }) {
  return handle(async () => {
    const { runId } = await ctx.params;
    const stream = new URL(request.url).searchParams.get("stream");
    if (stream !== "stdout" && stream !== "stderr") {
      throw new AppError("VALIDATION_ERROR", "stream must be stdout or stderr.", 400, { field: "stream" });
    }
    const text = getVerification().readRawOutput(runId, stream);
    return new Response(text, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  });
}
