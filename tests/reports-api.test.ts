import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as compareRoute from "../app/api/v1/runs/compare/route";
import * as evidenceRoute from "../app/api/v1/runs/[runId]/evidence/route";
import * as downloadRoute from "../app/api/v1/runs/[runId]/evidence/[evidenceId]/route";
import * as reportRoute from "../app/api/v1/runs/[runId]/report/route";
import * as cancelRoute from "../app/api/v1/runs/[runId]/cancel/route";
import type { KaneLaunch } from "@/server/kane/command";
import { createRedactor } from "@/server/security/redact";
import { ProofLoopService } from "@/server/services";
import { openDatabase, type Db } from "@/server/storage/db";
import { VerificationService } from "@/server/verification";

// Label: ProofLoop application test (routes with the FAKE Kane process). Not Kane verification.
const FAKE = fileURLToPath(new URL("./helpers/fake-kane.mjs", import.meta.url));
const KEY = Symbol.for("proofloop.service");
const SECRET = "SUPERSECRETVALUE12345";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const get = (url: string) => new Request(`http://127.0.0.1:3000${url}`, { headers: { host: "127.0.0.1:3000" } });
const json = async (r: Response) => (await r.json()) as Json;

describe("report, evidence and compare routes (INT-013, INT-015, FR-020)", () => {
  let tmp: string;
  let dataDir: string;
  let testsDir: string;
  let evidenceDir: string;
  let db: Db;
  let svc: ProofLoopService;
  let verification: VerificationService;
  let projectId: string;
  let criterionId: string;
  let testFile: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-rep-"));
    dataDir = path.join(tmp, "data");
    testsDir = path.join(dataDir, "tests");
    evidenceDir = path.join(dataDir, "evidence");
    for (const d of [testsDir, evidenceDir, path.join(dataDir, "kane-work")]) fs.mkdirSync(d, { recursive: true });
    db = openDatabase(path.join(dataDir, "proofloop.sqlite"));
    svc = new ProofLoopService(db, testsDir);
    const launch: KaneLaunch = { executable: process.execPath, prefixArgs: [FAKE] };
    verification = new VerificationService({
      db,
      projects: svc.projects,
      criteria: svc.criteria,
      runs: svc.runs,
      evidence: svc.evidence,
      dirs: { dataDir, testsDir, evidenceDir, workDir: path.join(dataDir, "kane-work") },
      kaneCliPath: null,
      timeoutMs: 30_000,
      maxBytesPerStream: 1024 * 1024,
      resolveLaunch: () => launch,
      redact: createRedactor({ secrets: [SECRET] }),
    });
    svc.verification = verification;
    (globalThis as unknown as Record<symbol, unknown>)[KEY] = svc;

    projectId = svc.createProject({ name: "Demo", targetUrl: "https://a.test" }).id;
    const rel = `${projectId}/a_test.md`;
    testFile = path.join(testsDir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(testFile, "FAKE_MODE=fail FAKE_PACK=1\n");
    criterionId = svc.createCriterion(projectId, { title: "Heading shows", expectedBehavior: "The Products heading is shown.", testFile: rel }).id;
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<symbol, unknown>)[KEY];
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function run(mode: string, extra = "FAKE_PACK=1"): Promise<string> {
    fs.writeFileSync(testFile, `FAKE_MODE=${mode} ${extra}\n`);
    const { runId } = verification.startRun(projectId, criterionId);
    await verification.waitForRun(runId);
    return runId;
  }
  const report = (runId: string, q = "") => reportRoute.GET(get(`/x?${q}`), { params: Promise.resolve({ runId }) });

  describe("report", () => {
    it("builds a Markdown handoff report from a real stored failed run", async () => {
      const id = await run("fail");
      const res = await report(id);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/markdown");
      expect(res.headers.get("content-disposition")).toBe(`attachment; filename="proofloop-report-${id.slice(0, 8)}.md"`);
      const md = await res.text();
      for (const s of [
        "- Criterion: Heading shows",
        "- Expected behavior: The Products heading is shown.",
        "**FAILED**",
        "- Exit code: 1",
        "- Kane's final result event: failed",
        "Likely cause, per Kane: Heading absent",
        "test_md_done",
        "(available)",
        "kane-cli testmd run a_test.md --agent --headless",
      ]) {
        expect(md, s).toContain(s);
      }
      expect(md).not.toContain(tmp);
      expect(md).not.toContain(os.homedir());
    });

    it("builds a passing report that asks for no fix", async () => {
      const md = await (await report(await run("pass"))).text();
      expect(md).toContain("**PASSED**");
      expect(md).toContain("No fix is requested");
    });

    it("exports JSON schemaVersion 1 without raw output by default", async () => {
      const id = await run("fail");
      const res = await report(id, "format=json");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await json(res);
      expect(body.schemaVersion).toBe(1);
      expect(body.run).toMatchObject({ id, status: "FAILED", exitCode: 1 });
      expect(body.criterion).toMatchObject({ title: "Heading shows", expectedBehavior: "The Products heading is shown." });
      expect(body.output.included).toBe(false);
      // Event type names are counted, but no raw line (which carries fields such as session_id) is exported.
      expect(JSON.stringify(body)).not.toContain("session_id");
      expect(body.output).not.toHaveProperty("stdout");
      expect(body.evidence[0]).toMatchObject({ available: true, kind: "EVIDENCE_PACK" });
    });

    it("includes raw output in the JSON export only when explicitly requested", async () => {
      const id = await run("fail");
      const body = await json(await report(id, "format=json&includeOutput=true"));
      expect(body.output.included).toBe(true);
      expect(body.output.stdout).toContain("test_md_done");
      expect(typeof body.output.stderr).toBe("string");
    });

    it.each([
      ["format=pdf", "format"],
      ["includeOutput=true", "includeOutput"],
      ["format=json&includeOutput=maybe", "includeOutput"],
    ])("rejects %s with 400", async (q, field) => {
      const id = await run("pass");
      const res = await report(id, q);
      expect(res.status).toBe(400);
      expect((await json(res)).error.details.field).toBe(field);
    });

    it("returns 404 for an unknown run and 409 for a run still in progress", async () => {
      expect((await report("7b4f1f53-7d5a-4f5d-86d8-789f4c2b7e10")).status).toBe(404);
      fs.writeFileSync(testFile, "FAKE_MODE=hang\n");
      const { runId } = verification.startRun(projectId, criterionId);
      const res = await report(runId);
      expect(res.status).toBe(409);
      await cancelRoute.POST(new Request("http://127.0.0.1:3000/x", { method: "POST", headers: { host: "127.0.0.1:3000", "content-type": "application/json" }, body: "{}" }), { params: Promise.resolve({ runId }) });
      await verification.waitForRun(runId);
      expect((await report(runId)).status).toBe(200);
    }, 30_000);

    it("redacts a known secret and the home folder from both formats, even full output", async () => {
      const id = await run("secret");
      const md = await (await report(id)).text();
      const full = await (await report(id, "format=json&includeOutput=true")).text();
      for (const text of [md, full]) {
        expect(text).not.toContain(SECRET);
        expect(text).not.toContain(os.homedir());
      }
      expect(full).toContain("[REDACTED]");
    });

    it("says output is unavailable when the saved files are gone, and still produces a report", async () => {
      const id = await run("fail");
      fs.rmSync(path.join(dataDir, "runs", id), { recursive: true, force: true });
      const md = await (await report(id)).text();
      expect(md).toContain("Not available (no output was saved for this run)");
      expect(md).toContain("- Saved stdout");
      const body = await json(await report(id, "format=json&includeOutput=true"));
      expect(body.output).toEqual({ included: true, stdout: null, stderr: null });
    });

    it("keeps the old report unchanged after the criterion is edited (immutable snapshot)", async () => {
      const id = await run("fail");
      const before = await (await report(id)).text();
      svc.updateCriterion(projectId, criterionId, { title: "Renamed", expectedBehavior: "Something else entirely." });
      const after = await (await report(id)).text();
      expect(after).toBe(before);
      expect(after).toContain("- Criterion: Heading shows");
    });
  });

  describe("evidence", () => {
    const list = (runId: string) => evidenceRoute.GET(get("/x"), { params: Promise.resolve({ runId }) });
    const download = (runId: string, evidenceId: string) => downloadRoute.GET(get("/x"), { params: Promise.resolve({ runId, evidenceId }) });

    it("lists verified evidence with no absolute path", async () => {
      const id = await run("fail");
      const body = await json(await list(id));
      expect(body.evidence).toHaveLength(1);
      expect(body.evidence[0]).toMatchObject({ available: true, kind: "EVIDENCE_PACK" });
      expect(JSON.stringify(body)).not.toContain(tmp);
    });

    it("downloads the evidence file locally as an attachment", async () => {
      const id = await run("fail");
      const ev = (await json(await list(id))).evidence[0];
      const res = await download(id, ev.id);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/octet-stream");
      expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="[A-Za-z0-9._-]+\.evidence"$/);
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    });

    it("re-checks the disk: a deleted file is reported unavailable everywhere and cannot be downloaded", async () => {
      const id = await run("fail");
      const ev = (await json(await list(id))).evidence[0];
      fs.rmSync(path.join(evidenceDir, ...ev.relativePath.split("/")));
      const after = (await json(await list(id))).evidence[0];
      expect(after).toMatchObject({ available: false, relativePath: null });
      expect(after.unavailableReason).toMatch(/no longer on disk/);
      expect((await download(id, ev.id)).status).toBe(404);
      const md = await (await report(id)).text();
      expect(md).toContain("not available. The file was verified when the run finished but is no longer on disk.");
      expect(md).not.toContain("(available)");
    });

    it("never serves a file for another run's evidence id, an unknown id, or a path that escapes", async () => {
      const first = await run("fail");
      const second = await run("pass");
      const ev = (await json(await list(first))).evidence[0];
      expect((await download(second, ev.id)).status).toBe(404);
      expect((await download(first, "7b4f1f53-7d5a-4f5d-86d8-789f4c2b7e10")).status).toBe(404);
      expect((await download(first, "..%2f..%2fsecret")).status).toBe(404);
      // A tampered stored path that points outside the evidence folder is refused.
      db.prepare("UPDATE evidence SET relative_path = ? WHERE id = ?").run("../../proofloop.sqlite", ev.id);
      expect((await download(first, ev.id)).status).toBe(404);
      expect((await json(await list(first))).evidence[0].available).toBe(false);
    });

    it("lists a run with no evidence as an empty list", async () => {
      const id = await run("fail", "FAKE_NO_INGEST=1");
      const body = await json(await list(id));
      expect(Array.isArray(body.evidence)).toBe(true);
      expect(body.evidence.every((e: Json) => e.available === false)).toBe(true);
    });
  });

  describe("compare", () => {
    const compare = (a: string, b: string) => compareRoute.GET(get(`/x?a=${a}&b=${b}`));

    it("compares a recorded failure with a later pass and leaves both runs unchanged", async () => {
      const failed = await run("fail");
      const passed = await run("pass");
      const snapshotBefore = JSON.stringify(svc.runs.mustGet(failed));
      const res = await compare(failed, passed);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.a).toMatchObject({ id: failed, status: "FAILED", exitCode: 1, kaneFinalStatus: "failed" });
      expect(body.b).toMatchObject({ id: passed, status: "PASSED", exitCode: 0, kaneFinalStatus: "passed" });
      expect(body.differences.map((d: Json) => d.field)).toEqual(expect.arrayContaining(["status", "exitCode", "kaneFinalStatus"]));
      expect(body.note).toContain("does not infer");
      expect(JSON.stringify(svc.runs.mustGet(failed))).toBe(snapshotBefore);
      expect(svc.runs.listForCriterion(criterionId)).toHaveLength(2);
    });

    it("rejects the same run twice, runs of different criteria, missing ids and unknown runs", async () => {
      const a = await run("fail");
      const rel2 = `${projectId}/b_test.md`;
      fs.writeFileSync(path.join(testsDir, projectId, "b_test.md"), "FAKE_MODE=pass\n");
      const other = svc.createCriterion(projectId, { title: "Other", expectedBehavior: "E", testFile: rel2 });
      const { runId: b } = verification.startRun(projectId, other.id);
      await verification.waitForRun(b);

      expect((await compare(a, a)).status).toBe(400);
      expect((await compare(a, b)).status).toBe(400);
      expect((await compareRoute.GET(get(`/x?a=${a}`))).status).toBe(400);
      expect((await compareRoute.GET(get("/x"))).status).toBe(400);
      expect((await compare(a, "7b4f1f53-7d5a-4f5d-86d8-789f4c2b7e10")).status).toBe(404);
    });
  });
});
