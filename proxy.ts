import { NextResponse, type NextRequest } from "next/server";
import { decideRequest } from "@/server/security/request-policy";

/**
 * Runs before every page and API route (SEC-001). By default it refuses any request whose Host header is
 * not a loopback name, which blocks DNS-rebinding from other web pages. With PROOFLOOP_PUBLIC_SITE=1 it
 * serves only the read-only marketing pages. See `request-policy.ts`. Next.js 16 calls this file a "proxy".
 */
export function proxy(request: NextRequest): NextResponse {
  const decision = decideRequest({
    host: request.headers.get("host"),
    method: request.method,
    pathname: request.nextUrl.pathname,
    publicSite: process.env.PROOFLOOP_PUBLIC_SITE === "1",
  });
  if (decision.action === "allow") return NextResponse.next();
  if (decision.action === "redirect") return NextResponse.redirect(new URL(decision.to, request.url), 307);
  const body = { error: { code: decision.code, message: decision.message, details: {} } };
  return NextResponse.json(body, { status: decision.status });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
