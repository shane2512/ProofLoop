import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as startRoute from "../app/api/v1/projects/[projectId]/criteria/[criterionId]/runs/route";
import * as listRoute from "../app/api/v1/projects/[projectId]/runs/route";
import * as detailRoute from "../app/api/v1/runs/[runId]/route";
import * as cancelRoute from "../app/api/v1/runs/[runId]/cancel/route";
import type { KaneLaunch } from "@/server/kane/command";
import { ProofLoopService } from "@/server/services";
import { openDatabase, type Db } from "@/server/storage/db";
import { VerificationService } from "@/server/verification";

// Label: ProofLoop application test (route handlers with the FAKE Kane process). Not Kane verification.
const FAKE = fileURLToPath(new URL("./helpers/fake-kane.mjs", import.meta.url));
const KEY = Symbol.for("proofloop.service");

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

function req(method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  const init: RequestInit = { method, headers: { host: "127.0.0.1:3000", ...headers } };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] ??= "application/json";
  }
  return new Request("http://127.0.0.1:3000/x", init);
}
const json = async (r: Response) => (await r.json()) as Json;

describe("run routes (INT-009 to INT-012)", () => {
  let tmp: string;
  let db: Db;
  let svc: ProofLoopService;
  let verification: VerificationService;
  let launch: KaneLaunch | null;
  let projectId: string;
  let criterionId: string;
  let testFile: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-vapi-"));
    const dataDir = path.join(tmp, "data");
    const testsDir = path.join(dataDir, "tests");
    for (const d of [testsDir, path.join(dataDir, "evidence"), path.join(dataDir, "kane-work")]) fs.mkdirSync(d, { recursive: true });
    db = openDatabase(path.join(dataDir, "proofloop.sqlite"));
    svc = new ProofLoopService(db, testsDir);
    launch = { executable: process.execPath, prefixArgs: [FAKE] };
    verification = new VerificationService({
      db,
      projects: svc.projects,
      criteria: svc.criteria,
      runs: svc.runs,
      evidence: svc.evidence,
      dirs: { dataDir, testsDir, evidenceDir: path.join(dataDir, "evidence"), workDir: path.join(dataDir, "kane-work") },
      kaneCliPath: null,
      timeoutMs: 30_000,
      maxBytesPerStream: 1024 * 1024,
      resolveLaunch: () => launch,
    });
    svc.verification = verification;
    (globalThis as unknown as Record<symbol, unknown>)[KEY] = svc;

    projectId = svc.createProject({ name: "Demo", targetUrl: "https://a.test" }).id;
    const rel = `${projectId}/a_test.md`;
    testFile = path.join(testsDir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(testFile, "FAKE_MODE=pass FAKE_PACK=1\n");
    criterionId = svc.createCriterion(projectId, { title: "T", expectedBehavior: "E", testFile: rel }).id;
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<symbol, unknown>)[KEY];
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const start = () => startRoute.POST(req("POST", {}), { params: Promise.resolve({ projectId, criterionId }) });

  it("starts a run asynchronously with 202, then exposes it through GET", async () => {
    const res = await start();
    expect(res.status).toBe(202);
    const body = await json(res);
    expect(body).toEqual({ runId: expect.any(String), status: "QUEUED" });

    await verification.waitForRun(body.runId);
    const detail = await detailRoute.GET(req("GET"), { params: Promise.resolve({ runId: body.runId }) });
    expect(detail.status).toBe(200);
    const d = await json(detail);
    expect(d.run).toMatchObject({ id: body.runId, status: "PASSED", exitCode: 0, evidenceAvailable: true });
    expect(d.events.length).toBeGreaterThan(0);
    expect(d.evidence[0]).toMatchObject({ available: true, kind: "EVIDENCE_PACK" });
    // api-spec.md: no absolute paths in evidence entries.
    expect(JSON.stringify(d)).not.toContain(tmp);
  });

  it("rejects a body that is not exactly {} (no command, path or credential can be supplied)", async () => {
    for (const body of [{ command: "dir" }, { testFile: "x" }, [], "null"]) {
      const res = await startRoute.POST(req("POST", body), { params: Promise.resolve({ projectId, criterionId }) });
      expect(res.status).toBe(400);
    }
    expect(svc.runs.listForCriterion(criterionId)).toHaveLength(0);
  });

  it("rejects cross-origin starts with 403 and creates nothing", async () => {
    const res = await startRoute.POST(req("POST", {}, { origin: "http://evil.example" }), { params: Promise.resolve({ projectId, criterionId }) });
    expect(res.status).toBe(403);
    expect(svc.runs.listForCriterion(criterionId)).toHaveLength(0);
  });

  it("returns 409 RUNNER_BUSY for a second start while one is active", async () => {
    fs.writeFileSync(testFile, "FAKE_MODE=hang\n");
    const first = await json(await start());
    const second = await start();
    expect(second.status).toBe(409);
    expect((await json(second)).error.code).toBe("RUNNER_BUSY");

    const cancel = await cancelRoute.POST(req("POST", {}), { params: Promise.resolve({ runId: first.runId }) });
    expect(cancel.status).toBe(202);
    expect(await json(cancel)).toEqual({ runId: first.runId, status: "CANCEL_REQUESTED" });
    await verification.waitForRun(first.runId);
    expect((await json(await detailRoute.GET(req("GET"), { params: Promise.resolve({ runId: first.runId }) }))).run.status).toBe("CANCELED");

    const again = await cancelRoute.POST(req("POST", {}), { params: Promise.resolve({ runId: first.runId }) });
    expect(again.status).toBe(409);
    expect((await json(again)).error.code).toBe("RUN_NOT_ACTIVE");
  }, 30_000);

  it("returns 404 for unknown runs and projects, 422 for a missing test file, 424 for a missing Kane", async () => {
    const unknown = "7b4f1f53-7d5a-4f5d-86d8-789f4c2b7e10";
    expect((await detailRoute.GET(req("GET"), { params: Promise.resolve({ runId: unknown }) })).status).toBe(404);
    expect((await cancelRoute.POST(req("POST", {}), { params: Promise.resolve({ runId: unknown }) })).status).toBe(404);
    expect((await startRoute.POST(req("POST", {}), { params: Promise.resolve({ projectId: unknown, criterionId }) })).status).toBe(404);

    fs.rmSync(testFile);
    const missing = await start();
    expect(missing.status).toBe(422);
    expect((await json(missing)).error.code).toBe("TEST_MAPPING_INVALID");

    fs.writeFileSync(testFile, "FAKE_MODE=pass\n");
    launch = null;
    const noKane = await start();
    expect(noKane.status).toBe(424);
    const err = (await json(noKane)).error;
    expect(err.code).toBe("PREREQUISITE_FAILED");
    expect(svc.runs.mustGet(err.details.runId).status).toBe("NOT_STARTED");
  });

  it("lists runs with filtering, a limit and validation errors", async () => {
    const a = await json(await start());
    await verification.waitForRun(a.runId);
    const b = await json(await start());
    await verification.waitForRun(b.runId);

    const ctx = { params: Promise.resolve({ projectId }) };
    const list = await json(await listRoute.GET(new Request(`http://127.0.0.1:3000/x?criterionId=${criterionId}&limit=1`), ctx));
    expect(list.runs).toHaveLength(1);
    expect(list.runs[0].id).toBe(b.runId);
    expect(list.nextCursor).toBeTruthy();
    const next = await json(await listRoute.GET(new Request(`http://127.0.0.1:3000/x?limit=1&cursor=${list.nextCursor}`), ctx));
    expect(next.runs[0].id).toBe(a.runId);

    for (const q of ["limit=0", "limit=101", "limit=abc", "cursor=!!!"]) {
      expect((await listRoute.GET(new Request(`http://127.0.0.1:3000/x?${q}`), ctx)).status).toBe(400);
    }
    expect((await listRoute.GET(new Request("http://127.0.0.1:3000/x"), { params: Promise.resolve({ projectId: "7b4f1f53-7d5a-4f5d-86d8-789f4c2b7e10" }) })).status).toBe(404);
  });
});
