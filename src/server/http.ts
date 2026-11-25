import "server-only";
import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "./errors";

export const MAX_BODY_BYTES = 64 * 1024;

/** Local origin protection for mutations (SEC-008). Browsers always send Origin on cross-origin POST. */
export function assertLocalOrigin(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError("FORBIDDEN_ORIGIN", "Cross-site requests are not allowed.", 403);
  }
  const origin = request.headers.get("origin");
  if (origin !== null) {
    const host = request.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (originHost === null || host === null || originHost !== host) {
      throw new AppError("FORBIDDEN_ORIGIN", "Request origin is not allowed.", 403);
    }
  }
}

/** Reads a bounded JSON body. Content type and size are validated before parsing (SEC-008). */
export async function readJsonBody(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json(\s*;.*)?$/i.test(type)) {
    throw new AppError("VALIDATION_ERROR", "Content-Type must be application/json.", 400);
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Request body is too large.", 413);
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Request body is too large.", 413);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body is not valid JSON.", 400);
  }
}

/** Wraps a handler: structured errors for AppError, a generic 500 otherwise (SEC-009). */
export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) {
      // Log the error name only. Messages can contain local paths.
      console.error(`[proofloop] request failed: ${err instanceof Error ? err.name : "unknown"}`);
    }
    return NextResponse.json(body, { status });
  }
}

export const noContent = () => new Response(null, { status: 204 });
