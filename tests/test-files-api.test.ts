import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as listRoute from "../app/api/v1/projects/[projectId]/test-files/route";
import * as fileRoute from "../app/api/v1/projects/[projectId]/test-files/[name]/route";
import * as outputRoute from "../app/api/v1/runs/[runId]/output/route";
import type { KaneLaunch } from "@/server/kane/command";
import { ProofLoopService } from "@/server/services";
import { openDatabase, type Db } from "@/server/storage/db";
import { MAX_TEST_CONTENT_BYTES } from "@/server/test-files";
import { VerificationService } from "@/server/verification";

// Label: ProofLoop application test (route handlers with the FAKE Kane process). Not Kane verification.
const FAKE = fileURLToPath(new URL("./helpers/fake-kane.mjs", import.meta.url));
const KEY = Symbol.for("proofloop.service");

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

function req(method: string, body?: unknown, headers: Record<string, string> = {}, url = "http://127.0.0.1:3000/x"): Request {
  const init: RequestInit = { method, headers: { host: "127.0.0.1:3000", ...headers } };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] ??= "application/json";
  }
  return new Request(url, init);
}
const snapshot = () => ({ projectName: "Demo", targetUrl: "https://a.test", title: "T", expectedBehavior: "E", notes: null, testFile: "x/a_test.md", stepLabel: null });
const json = async (r: Response) => (await r.json()) as Json;

describe("test-file and raw-output routes (Phase 5 additions)", () => {
  let tmp: string;
  let dataDir: string;
  let testsDir: string;
  let db: Db;
  let svc: ProofLoopService;
  let verification: VerificationService;
  let projectId: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-tf-"));
    dataDir = path.join(tmp, "data");
    testsDir = path.join(dataDir, "tests");
    for (const d of [testsDir, path.join(dataDir, "evidence"), path.join(dataDir, "kane-work")]) fs.mkdirSync(d, { recursive: true });
    db = openDatabase(path.join(dataDir, "proofloop.sqlite"));
    svc = new ProofLoopService(db, testsDir);
    const launch: KaneLaunch = { executable: process.execPath, prefixArgs: [FAKE] };
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
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<symbol, unknown>)[KEY];
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const listCtx = () => ({ params: Promise.resolve({ projectId }) });
  const fileCtx = (name: string, pid = projectId) => ({ params: Promise.resolve({ projectId: pid, name }) });
  const put = (name: string, body: unknown, headers: Record<string, string> = {}) =>
    fileRoute.PUT(req("PUT", body, headers), fileCtx(name));

  describe("test files", () => {
    it("lists nothing for a new project", async () => {
      const res = await listRoute.GET(req("GET"), listCtx());
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({ files: [] });
    });

    it("creates, reads back and lists a file, returning a managed-relative path only", async () => {
      const res = await put("login", { content: "Open the page.\n" });
      expect(res.status).toBe(200);
      const saved = (await json(res)).file;
      expect(saved).toMatchObject({ name: "login", testFile: `${projectId}/login_test.md`, sizeBytes: 15 });
      expect(JSON.stringify(saved)).not.toContain(tmp);

      const read = await fileRoute.GET(req("GET"), fileCtx("login"));
      expect(read.status).toBe(200);
      expect((await json(read)).file).toMatchObject({ name: "login", content: "Open the page.\n" });

      const list = (await json(await listRoute.GET(req("GET"), listCtx()))).files;
      expect(list.map((f: Json) => f.name)).toEqual(["login"]);
      expect(list[0].testFile).toBe(`${projectId}/login_test.md`);
    });

    it("lists files sorted and ignores files that do not match the naming rule", async () => {
      await put("b", { content: "x" });
      await put("a", { content: "x" });
      const dir = path.join(testsDir, projectId);
      fs.writeFileSync(path.join(dir, "notes.md"), "ignored");
      fs.writeFileSync(path.join(dir, "bad name_test.md"), "ignored");
      fs.mkdirSync(path.join(dir, "folder_test.md"));
      const list = (await json(await listRoute.GET(req("GET"), listCtx()))).files;
      expect(list.map((f: Json) => f.name)).toEqual(["a", "b"]);
    });

    it("overwrites an existing file", async () => {
      await put("a", { content: "one" });
      await put("a", { content: "two" });
      expect((await json(await fileRoute.GET(req("GET"), fileCtx("a")))).file.content).toBe("two");
    });

    it.each(["../x", "..", "a/b", "a\\b", ".hidden", "-lead", "", "a b", "a.md", "x".repeat(65), "con\0"])(
      "rejects the unsafe name %j without touching the disk",
      async (name) => {
        const res = await put(name, { content: "x" });
        expect([400, 404]).toContain(res.status);
        if (res.status === 400) expect((await json(res)).error.code).toBe("VALIDATION_ERROR");
        expect(fs.readdirSync(testsDir).filter((d) => d !== projectId)).toEqual([]);
        expect(fs.existsSync(path.join(tmp, "x_test.md"))).toBe(false);
      },
    );

    it("returns 404 for an unknown or malformed project id", async () => {
      const unknown = "7b4f1f53-7d5a-4f5d-86d8-789f4c2b7e10";
      expect((await fileRoute.PUT(req("PUT", { content: "x" }), fileCtx("a", unknown))).status).toBe(404);
      expect((await fileRoute.GET(req("GET"), fileCtx("a", unknown))).status).toBe(404);
      expect((await fileRoute.PUT(req("PUT", { content: "x" }), fileCtx("a", "..%2f.."))).status).toBe(404);
      expect(fs.readdirSync(testsDir)).toEqual([]);
    });

    it("returns 404 for a file that does not exist", async () => {
      const res = await fileRoute.GET(req("GET"), fileCtx("missing"));
      expect(res.status).toBe(404);
      expect((await json(res)).error.code).toBe("NOT_FOUND");
    });

    it("validates the body", async () => {
      for (const body of [{}, { content: 5 }, { content: "" }, { content: "   \n" }, { content: "x", extra: 1 }, [], "null", { content: "a\0b" }]) {
        const res = await put("a", body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect((await json(res)).error.code).toBe("VALIDATION_ERROR");
      }
      expect((await put("a", "{not json")).status).toBe(400);
      expect(svc.testFiles.list(projectId)).toEqual([]);
    });

    it("enforces the size limit by bytes, not characters", async () => {
      const ok = "a".repeat(MAX_TEST_CONTENT_BYTES);
      expect((await put("big", { content: ok })).status).toBe(200);
      const tooBig = "é".repeat(MAX_TEST_CONTENT_BYTES / 2 + 1);
      const res = await put("big2", { content: tooBig });
      expect(res.status).toBe(400);
      expect((await json(res)).error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects cross-origin writes with 403 and writes nothing", async () => {
      const res = await put("a", { content: "x" }, { origin: "http://evil.example" });
      expect(res.status).toBe(403);
      expect(svc.testFiles.list(projectId)).toEqual([]);
    });

    it("refuses to write through a symlinked project folder", async (ctx) => {
      const outside = path.join(tmp, "outside");
      fs.mkdirSync(outside);
      try {
        fs.symlinkSync(outside, path.join(testsDir, projectId), "junction");
      } catch {
        ctx.skip();
        return;
      }
      const res = await put("a", { content: "x" });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(fs.readdirSync(outside)).toEqual([]);
    });

    it("makes an earlier passing run stale when the file is edited, and a new file can be mapped", async () => {
      await put("a", { content: "FAKE_MODE=pass FAKE_PACK=1\n" });
      const criterion = svc.createCriterion(projectId, { title: "T", expectedBehavior: "E", testFile: `${projectId}/a_test.md` });
      const { runId } = verification.startRun(projectId, criterion.id);
      await verification.waitForRun(runId);
      const status = () => svc.getProject(projectId).criteria.find((c) => c.id === criterion.id);
      expect(status()).toMatchObject({ status: "VERIFIED", statusNote: null });

      const res = await put("a", { content: "FAKE_MODE=pass FAKE_PACK=1\n# edited\n" });
      expect(res.status).toBe(200);
      expect(status()).toMatchObject({ status: "UNVERIFIED", statusNote: "TEST_FILE_CHANGED" });
      // History is untouched.
      expect(svc.runs.listForCriterion(criterion.id)).toHaveLength(1);
    });
  });

  describe("raw output (INT-014)", () => {
    async function completedRun() {
      await put("a", { content: "FAKE_MODE=pass FAKE_PACK=1\n" });
      const criterion = svc.createCriterion(projectId, { title: "T", expectedBehavior: "E", testFile: `${projectId}/a_test.md` });
      const { runId } = verification.startRun(projectId, criterion.id);
      await verification.waitForRun(runId);
      return { runId, criterion };
    }
    const get = (runId: string, stream?: string) =>
      outputRoute.GET(req("GET", undefined, {}, `http://127.0.0.1:3000/api/v1/runs/${runId}/output${stream ? `?stream=${stream}` : ""}`), {
        params: Promise.resolve({ runId }),
      });

    it("returns saved stdout and stderr as plain text", async () => {
      const { runId } = await completedRun();
      const out = await get(runId, "stdout");
      expect(out.status).toBe(200);
      expect(out.headers.get("content-type")).toContain("text/plain");
      expect(out.headers.get("x-content-type-options")).toBe("nosniff");
      expect(await out.text()).toContain("test_md_done");
      const err = await get(runId, "stderr");
      expect(err.status).toBe(200);
      expect(typeof (await err.text())).toBe("string");
    });

    it("requires a valid stream", async () => {
      const { runId } = await completedRun();
      for (const s of [undefined, "", "both", "../stdout"]) {
        const res = await get(runId, s);
        expect(res.status, String(s)).toBe(400);
        expect((await json(res)).error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("returns 404 for an unknown or malformed run id", async () => {
      expect((await get("7b4f1f53-7d5a-4f5d-86d8-789f4c2b7e10", "stdout")).status).toBe(404);
      expect((await get("not-an-id", "stdout")).status).toBe(404);
    });

    it("returns 404 OUTPUT_UNAVAILABLE when no output was saved", async () => {
      const { runId } = await completedRun();
      fs.rmSync(path.join(dataDir, "runs", runId, "stdout.log"));
      const res = await get(runId, "stdout");
      expect(res.status).toBe(404);
      expect((await json(res)).error.code).toBe("OUTPUT_UNAVAILABLE");
    });

    it("returns 404 OUTPUT_UNAVAILABLE for a run that has not produced output yet", async () => {
      const criterion = svc.createCriterion(projectId, { title: "T", expectedBehavior: "E", testFile: `${projectId}/a_test.md` });
      const run = svc.runs.createQueued(
        projectId,
        criterion.id,
        snapshot(),
      );
      const res = await get(run.id, "stdout");
      expect(res.status).toBe(404);
      expect((await json(res)).error.code).toBe("OUTPUT_UNAVAILABLE");
    });

    it("never reads outside the run's own folder, even if a stored path points elsewhere", async () => {
      const secret = path.join(tmp, "secret.txt");
      fs.writeFileSync(secret, "TOP-SECRET");
      const criterion = svc.createCriterion(projectId, { title: "T", expectedBehavior: "E", testFile: `${projectId}/a_test.md` });
      const run = svc.runs.createQueued(
        projectId,
        criterion.id,
        snapshot(),
      );
      for (const bad of ["../secret.txt", `runs/${run.id}/../../../secret.txt`, secret, `runs/${run.id}`, "runs/other/stdout.log"]) {
        svc.runs.updateLifecycle(run.id, { status: "RUNNING", rawStdoutPath: bad });
        const res = await get(run.id, "stdout");
        expect(res.status, bad).toBe(404);
        expect(await res.text()).not.toContain("TOP-SECRET");
      }
    });
  });
});
