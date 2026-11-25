import { NextResponse, type NextRequest } from "next/server";
import { isLoopbackHostHeader } from "@/server/security/host";

/**
 * Runs before every page and API route. Refuses any request whose Host header is not a loopback name
 * (SEC-001), which blocks DNS-rebinding attacks from other web pages. Next.js 16 calls this file a "proxy".
 */
export function proxy(request: NextRequest): NextResponse {
  if (isLoopbackHostHeader(request.headers.get("host"))) return NextResponse.next();
  const body = { error: { code: "FORBIDDEN_HOST", message: "ProofLoop only answers requests addressed to a loopback address.", details: {} } };
  return NextResponse.json(body, { status: 403 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
