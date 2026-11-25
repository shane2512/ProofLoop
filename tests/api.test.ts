import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as health from "../app/api/v1/health/route";
import * as projects from "../app/api/v1/projects/route";
import * as project from "../app/api/v1/projects/[projectId]/route";
import * as criteria from "../app/api/v1/projects/[projectId]/criteria/route";
import * as criterion from "../app/api/v1/projects/[projectId]/criteria/[criterionId]/route";

// Label: ProofLoop application test (route handlers called directly; not Kane verification).
const BASE = "http://127.0.0.1:3000";
let tmp: string;

function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Request {
  const init: RequestInit = { method, headers: { host: "127.0.0.1:3000", ...headers } };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] ??= "application/json";
  }
  return new Request(`${BASE}${url}`, init);
}
const pctx = (projectId: string) => ({ params: Promise.resolve({ projectId }) });
const cctx = (projectId: string, criterionId: string) => ({ params: Promise.resolve({ projectId, criterionId }) });

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

async function json(res: Response): Promise<Json> {
  return (await res.json()) as Json;
}

describe("api v1", () => {
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-api-"));
    process.env.PROOFLOOP_DATA_DIR = path.join(tmp, "data");
    process.env.PROOFLOOP_TESTS_DIR = path.join(tmp, "data", "tests");
  });
  afterAll(() => {
    const holder = globalThis as unknown as Record<symbol, { db: { close(): void } } | undefined>;
    holder[Symbol.for("proofloop.service")]?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  beforeEach(() => {
    // Each test starts from a fresh database file.
    const holder = globalThis as unknown as Record<symbol, { db: { close(): void } } | undefined>;
    holder[Symbol.for("proofloop.service")]?.db.close();
    delete (holder as Record<symbol, unknown>)[Symbol.for("proofloop.service")];
    fs.rmSync(path.join(tmp, "data"), { recursive: true, force: true });
  });

  async function makeProject() {
    const res = await projects.POST(req("POST", "/api/v1/projects", { name: "Demo", targetUrl: "https://a.test" }));
    expect(res.status).toBe(201);
    return (await json(res)).project as { id: string };
  }
  const crit = (n: number) => ({ title: `C${n}`, expectedBehavior: "E", testFile: `p/c${n}_test.md` });

  it("health reports ready storage without leaking paths", async () => {
    const res = await health.GET();
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).toBe('{"status":"ok","storage":"ready"}');
  });

  it("creates, lists, gets, patches, and archives a project", async () => {
    const p = await makeProject();
    expect((await json(await projects.GET(req("GET", "/api/v1/projects")))).projects).toHaveLength(1);
    const got = await json(await project.GET(req("GET", `/x`), pctx(p.id)));
    expect(got.criteria).toEqual([]);
    const patched = await project.PATCH(req("PATCH", "/x", { name: "New" }), pctx(p.id));
    expect((await json(patched)).project.name).toBe("New");
    expect((await project.DELETE(req("DELETE", "/x"), pctx(p.id))).status).toBe(204);
    expect((await project.GET(req("GET", "/x"), pctx(p.id))).status).toBe(404);
    expect((await json(await projects.GET(req("GET", "/api/v1/projects?includeArchived=true")))).projects).toHaveLength(1);
  });

  it("returns stable 400 errors for invalid input", async () => {
    const bad = await projects.POST(req("POST", "/x", { name: "x", targetUrl: "ftp://a.test" }));
    expect(bad.status).toBe(400);
    expect((await json(bad)).error.code).toBe("VALIDATION_ERROR");
    expect((await projects.POST(req("POST", "/x", { name: "", targetUrl: "https://a.test" }))).status).toBe(400);
    expect((await projects.POST(req("POST", "/x", "{not json"))).status).toBe(400);
    expect((await projects.POST(req("POST", "/x", { name: "x", targetUrl: "https://a.test", cmd: "dir" }))).status).toBe(400);
    expect((await projects.GET(req("GET", "/api/v1/projects?includeArchived=maybe"))).status).toBe(400);
    const wrongType = await projects.POST(req("POST", "/x", "name=x", { "content-type": "text/plain" }));
    expect(wrongType.status).toBe(400);
  });

  it("returns 404 for unknown and malformed ids", async () => {
    expect((await project.GET(req("GET", "/x"), pctx("7b4f1f53-7d5a-4f5d-86d8-789f4c2b7e10"))).status).toBe(404);
    expect((await project.GET(req("GET", "/x"), pctx("not-a-uuid"))).status).toBe(404);
  });

  it("returns 413 for oversized bodies", async () => {
    const res = await projects.POST(req("POST", "/x", { name: "x", targetUrl: "https://a.test", notes: "n".repeat(70_000) }));
    expect(res.status).toBe(413);
  });

  it("rejects cross-origin mutations with 403", async () => {
    const res = await projects.POST(
      req("POST", "/x", { name: "x", targetUrl: "https://a.test" }, { origin: "http://evil.example" }),
    );
    expect(res.status).toBe(403);
    const site = await projects.POST(
      req("POST", "/x", { name: "x", targetUrl: "https://a.test" }, { "sec-fetch-site": "cross-site" }),
    );
    expect(site.status).toBe(403);
    const same = await projects.POST(
      req("POST", "/x", { name: "x", targetUrl: "https://a.test" }, { origin: "http://127.0.0.1:3000" }),
    );
    expect(same.status).toBe(201);
  });

  it("creates criteria, enforces the limit with 409, and rejects bad paths with 400", async () => {
    const p = await makeProject();
    for (let n = 1; n <= 5; n++) {
      const res = await criteria.POST(req("POST", "/x", crit(n)), pctx(p.id));
      expect(res.status).toBe(201);
    }
    const over = await criteria.POST(req("POST", "/x", crit(6)), pctx(p.id));
    expect(over.status).toBe(409);
    expect((await json(over)).error.code).toBe("CRITERION_LIMIT");
    const trav = await criteria.POST(req("POST", "/x", { ...crit(7), testFile: "../x_test.md" }), pctx(p.id));
    expect(trav.status).toBe(400);
    const absolute = await criteria.POST(req("POST", "/x", { ...crit(7), testFile: "C:/x_test.md" }), pctx(p.id));
    expect(absolute.status).toBe(400);
  });

  it("returns 404 when creating a criterion for a missing project", async () => {
    const res = await criteria.POST(req("POST", "/x", crit(1)), pctx("7b4f1f53-7d5a-4f5d-86d8-789f4c2b7e10"));
    expect(res.status).toBe(404);
  });

  it("patches and soft-deletes a criterion; duplicate test file returns 409", async () => {
    const p = await makeProject();
    const c1 = (await json(await criteria.POST(req("POST", "/x", crit(1)), pctx(p.id)))).criterion as { id: string };
    await criteria.POST(req("POST", "/x", crit(2)), pctx(p.id));
    const patched = await criterion.PATCH(req("PATCH", "/x", { title: "Renamed" }), cctx(p.id, c1.id));
    expect((await json(patched)).criterion.title).toBe("Renamed");
    const dup = await criterion.PATCH(req("PATCH", "/x", { testFile: "p/c2_test.md" }), cctx(p.id, c1.id));
    expect(dup.status).toBe(409);
    expect((await criterion.DELETE(req("DELETE", "/x"), cctx(p.id, c1.id))).status).toBe(204);
    expect((await criterion.DELETE(req("DELETE", "/x"), cctx(p.id, c1.id))).status).toBe(404);
    expect((await json(await project.GET(req("GET", "/x"), pctx(p.id)))).criteria).toHaveLength(1);
  });

  it("never returns stack traces or local paths in errors", async () => {
    const res = await criteria.POST(req("POST", "/x", { ...crit(1), testFile: "../x_test.md" }), pctx((await makeProject()).id));
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/\bat \w+.*\(/);
    expect(text).not.toContain(tmp);
  });
});
