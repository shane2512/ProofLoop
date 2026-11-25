import { NextResponse } from "next/server";
import { AppError } from "@/server/errors";
import { getVerification } from "@/server/context";
import { handle } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FR-020. `a` and `b` are two finished runs of the same criterion. The order is the caller's.
export function GET(request: Request) {
  return handle(async () => {
    const q = new URL(request.url).searchParams;
    const a = q.get("a");
    const b = q.get("b");
    if (!a) throw new AppError("VALIDATION_ERROR", "a is required.", 400, { field: "a" });
    if (!b) throw new AppError("VALIDATION_ERROR", "b is required.", 400, { field: "b" });
    return NextResponse.json(getVerification().compareRuns(a, b));
  });
}
