import fs from "node:fs";
import { Readable } from "node:stream";
import { getVerification } from "@/server/context";
import { handle } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Local, explicit download of one verified evidence file. Nothing is uploaded anywhere (SEC-007).
export function GET(_request: Request, ctx: { params: Promise<{ runId: string; evidenceId: string }> }) {
  return handle(async () => {
    const { runId, evidenceId } = await ctx.params;
    const file = getVerification().resolveEvidenceDownload(runId, evidenceId);
    const size = fs.statSync(file.absolutePath).size;
    const body = Readable.toWeb(fs.createReadStream(file.absolutePath)) as unknown as ReadableStream;
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(size),
        "content-disposition": `attachment; filename="${file.fileName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
