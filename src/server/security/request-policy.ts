import { isLoopbackHostHeader } from "./host";

/**
 * What to do with a request before it reaches any page or API route (SEC-001).
 *
 * Default (local app): only requests addressed to a loopback name are answered.
 *
 * Public showcase mode (`PROOFLOOP_PUBLIC_SITE=1`, for a hosted copy of the marketing pages): the app
 * cannot run Kane or keep data there, so the site is read-only. Only GET and HEAD for the marketing
 * pages are served. The workspace goes to the setup guide, and the API and everything else is refused. The
 * Host header is not checked in this mode because the site is meant to be reached by its public name.
 */
export const PUBLIC_PAGES: ReadonlySet<string> = new Set(["/", "/workflow", "/evidence", "/faq", "/docs"]);

export type Decision = { action: "allow" } | { action: "redirect"; to: string } | { action: "deny"; status: number; code: string; message: string };

export interface RequestFacts {
  host: string | null;
  method: string;
  pathname: string;
  publicSite: boolean;
}

export function decideRequest(r: RequestFacts): Decision {
  if (!r.publicSite) {
    if (isLoopbackHostHeader(r.host)) return { action: "allow" };
    return { action: "deny", status: 403, code: "FORBIDDEN_HOST", message: "ProofLoop only answers requests addressed to a loopback address." };
  }

  const path = r.pathname.length > 1 ? r.pathname.replace(/\/+$/, "") : r.pathname;
  const readOnly = r.method === "GET" || r.method === "HEAD";
  if (readOnly && PUBLIC_PAGES.has(path)) return { action: "allow" };
  if (readOnly && (path === "/workspace" || path.startsWith("/workspace/"))) return { action: "redirect", to: "/docs" };
  return { action: "deny", status: 404, code: "NOT_AVAILABLE", message: "This is the public ProofLoop site. The app runs on your own machine." };
}
