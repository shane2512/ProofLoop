import { describe, expect, it } from "vitest";
import { decideRequest, PUBLIC_PAGES } from "@/server/security/request-policy";

// Label: ProofLoop application test (SEC-001, request policy).
const local = (over: Partial<Parameters<typeof decideRequest>[0]> = {}) => decideRequest({ host: "127.0.0.1:3000", method: "GET", pathname: "/", publicSite: false, ...over });
const pub = (over: Partial<Parameters<typeof decideRequest>[0]> = {}) => decideRequest({ host: "proofloop.vercel.app", method: "GET", pathname: "/", publicSite: true, ...over });

describe("local mode (default)", () => {
  it("answers loopback hosts and refuses everything else, on pages and API alike", () => {
    expect(local().action).toBe("allow");
    expect(local({ host: "localhost:3100", pathname: "/api/v1/projects" }).action).toBe("allow");
    for (const host of ["proofloop.vercel.app", "evil.example", null, "127.0.0.1.evil.example"]) {
      expect(local({ host, pathname: "/api/v1/projects" })).toMatchObject({ action: "deny", status: 403, code: "FORBIDDEN_HOST" });
      expect(local({ host })).toMatchObject({ action: "deny", status: 403 });
    }
  });
  it("ignores the public flag's absence for any method", () => {
    expect(local({ method: "POST", pathname: "/api/v1/projects" }).action).toBe("allow");
  });
});

describe("public showcase mode (PROOFLOOP_PUBLIC_SITE=1)", () => {
  it.each([...PUBLIC_PAGES])("serves the marketing page %s read-only", (pathname) => {
    expect(pub({ pathname }).action).toBe("allow");
    expect(pub({ pathname, method: "HEAD" }).action).toBe("allow");
  });

  it("tolerates a trailing slash", () => {
    expect(pub({ pathname: "/docs/" }).action).toBe("allow");
  });

  it("sends the workspace to the setup guide", () => {
    for (const pathname of ["/workspace", "/workspace/", "/workspace/projects/abc"]) {
      expect(pub({ pathname })).toEqual({ action: "redirect", to: "/docs" });
    }
  });

  it("refuses the whole API for every method, with no data", () => {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      for (const pathname of ["/api/v1/health", "/api/v1/projects", "/api/v1/runs/x/report", "/api/v1/projects/p/test-files/a"]) {
        expect(pub({ method, pathname }), `${method} ${pathname}`).toMatchObject({ action: "deny", status: 404, code: "NOT_AVAILABLE" });
      }
    }
  });

  it("refuses writes to the pages themselves and unknown paths", () => {
    expect(pub({ method: "POST", pathname: "/" })).toMatchObject({ action: "deny" });
    expect(pub({ method: "POST", pathname: "/workspace" })).toMatchObject({ action: "deny" });
    for (const pathname of ["/admin", "/workspace-x", "/docs/../api/v1/projects", "/.env", "/api"]) {
      expect(pub({ pathname }).action, pathname).toBe("deny");
    }
  });

  it("does not depend on the Host header", () => {
    expect(pub({ host: null }).action).toBe("allow");
    expect(pub({ host: "anything.example" }).action).toBe("allow");
  });
});
