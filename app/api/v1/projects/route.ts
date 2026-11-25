import { NextResponse } from "next/server";
import { AppError } from "@/server/errors";
import { getService } from "@/server/context";
import { assertLocalOrigin, handle, readJsonBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// INT-001
export function GET(request: Request) {
  return handle(() => {
    const raw = new URL(request.url).searchParams.get("includeArchived");
    if (raw !== null && raw !== "true" && raw !== "false") {
      throw new AppError("VALIDATION_ERROR", "includeArchived must be true or false.", 400, { field: "includeArchived" });
    }
    return NextResponse.json({ projects: getService().listProjects(raw === "true") });
  });
}

// INT-002
export function POST(request: Request) {
  return handle(async () => {
    assertLocalOrigin(request);
    const project = getService().createProject(await readJsonBody(request));
    return NextResponse.json({ project }, { status: 201 });
  });
}
