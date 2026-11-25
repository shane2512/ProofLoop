import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "@/server/errors";
import type { KaneLaunch } from "@/server/kane/command";
import { ProofLoopService } from "@/server/services";
import { openDatabase, type Db } from "@/server/storage/db";
import { VerificationService } from "@/server/verification";

// Label: ProofLoop application tests for the verification service. The Kane process is the FAKE child
// in tests/helpers/fake-kane.mjs. A VERIFIED status in this file proves ProofLoop's rule logic only and
// is never a Kane verification.
const FAKE = fileURLToPath(new URL("./helpers/fake-kane.mjs", import.meta.url));
const FAKE_LAUNCH: KaneLaunch = { executable: process.execPath, prefixArgs: [FAKE] };

function errorOf(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("Expected an AppError but nothing was thrown.");
}

describe("VerificationService (fake Kane process)", () => {
  let tmp: string;
  let db: Db;
  let svc: ProofLoopService;
  let verification: VerificationService;
  let launch: KaneLaunch | null;
  let timeoutMs: number;
  let projectId: string;
  let dataDir: string;
  let testsDir: string;
  let evidenceDir: string;
  let workDir: string;
  let counter = 0;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-verif-"));
    dataDir = path.join(tmp, "data");
    testsDir = path.join(dataDir, "tests");
    evidenceDir = path.join(dataDir, "evidence");
    workDir = path.join(dataDir, "kane-work");
    for (const d of [testsDir, evidenceDir, workDir]) fs.mkdirSync(d, { recursive: true });
    db = openDatabase(path.join(dataDir, "proofloop.sqlite"));
    svc = new ProofLoopService(db, testsDir);
    launch = FAKE_LAUNCH;
    timeoutMs = 30_000;
    verification = new VerificationService({
      db,
      projects: svc.projects,
      criteria: svc.criteria,
      runs: svc.runs,
      evidence: svc.evidence,
      dirs: { dataDir, testsDir, evidenceDir, workDir },
      kaneCliPath: null,
      timeoutMs,
      maxBytesPerStream: 10 * 1024 * 1024,
      resolveLaunch: () => launch,
    });
    svc.verification = verification;
    projectId = svc.createProject({ name: "Demo", targetUrl: "https://a.test" }).id;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  /** Writes a test file for the fake and maps a new criterion to it. */
  function addCriterion(mode: string, extra = "FAKE_PACK=1") {
    counter += 1;
    const rel = `${projectId}/c${counter}_test.md`;
    const abs = path.join(testsDir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `---\nmode: testing\n---\n\n## Step\nFAKE_MODE=${mode} ${extra}\n`);
    const criterion = svc.createCriterion(projectId, { title: `Criterion ${counter}`, expectedBehavior: "The page shows the list", testFile: rel });
    return { criterion, abs, rel };
  }
  const status = (criterionId: string) => svc.getProject(projectId).criteria.find((c) => c.id === criterionId);
  async function run(criterionId: string) {
    const { runId } = verification.startRun(projectId, criterionId);
    await verification.waitForRun(runId);
    return verification.getRunDetail(runId);
  }

  it("a passing run is recorded, verified, and its evidence and raw output are saved", async () => {
    const { criterion } = addCriterion("pass");
    const started = verification.startRun(projectId, criterion.id);
    expect(started.status).toBe("QUEUED");
    // The run record exists before the process finishes.
    expect(["QUEUED", "RUNNING"]).toContain(svc.runs.mustGet(started.runId).status);
    expect(status(criterion.id)?.status).toBe("RUNNING");

    await verification.waitForRun(started.runId);
    const d = verification.getRunDetail(started.runId);
    expect(d.run).toMatchObject({ status: "PASSED", exitCode: 0, timedOut: false, canceled: false, evidenceAvailable: true });
    expect(d.run.summary).toContain("exited 0");
    expect(d.command?.join(" ")).toContain("testmd run");
    expect(d.events.map((e) => e.eventType)).toContain("test_md_done");
    expect(d.events[0]?.sequence).toBe(1);

    const pack = d.evidence[0];
    expect(pack).toMatchObject({ kind: "EVIDENCE_PACK", available: true, source: "kane:kane_event" });
    expect(fs.existsSync(path.join(evidenceDir, ...(pack?.relativePath ?? "missing").split("/")))).toBe(true);
    const stdout = fs.readFileSync(path.join(dataDir, "runs", started.runId, "stdout.log"), "utf8");
    expect(stdout).toContain("test_md_done");
    expect(fs.existsSync(path.join(workDir, started.runId))).toBe(false);

    expect(status(criterion.id)).toMatchObject({ status: "VERIFIED", statusNote: null, lastRunId: started.runId });
  });

  it("a failing run is FAILED and Kane's failure detail is kept without becoming ProofLoop's claim", async () => {
    const { criterion } = addCriterion("fail");
    const d = await run(criterion.id);
    expect(d.run).toMatchObject({ status: "FAILED", exitCode: 1 });
    const kane = d.kane as { failure: { reasonCode: string; kaneVerdict: { rootCause: string } } };
    expect(kane.failure.reasonCode).toBe("assertion_error.final_verification");
    expect(kane.failure.kaneVerdict.rootCause).toBe("Heading absent");
    expect(status(criterion.id)?.status).toBe("FAILED");
  });

  it("a later failure replaces the status but the earlier pass stays in history unchanged", async () => {
    const { criterion, abs } = addCriterion("pass");
    const first = await run(criterion.id);
    expect(status(criterion.id)?.status).toBe("VERIFIED");

    fs.writeFileSync(abs, fs.readFileSync(abs, "utf8").replace("FAKE_MODE=pass", "FAKE_MODE=fail"));
    const second = await run(criterion.id);
    expect(second.run.status).toBe("FAILED");
    expect(status(criterion.id)?.status).toBe("FAILED");

    const reread = verification.getRunDetail(first.run.id);
    expect(reread.run).toEqual(first.run);
    expect(reread.run.status).toBe("PASSED");
    const list = verification.listRuns(projectId, { criterionId: criterion.id, limit: 10 });
    expect(list.runs.map((r) => r.id)).toEqual([second.run.id, first.run.id]);
  });

  it("a pass stops verifying when the test file, mapping or expected behavior changes afterwards", async () => {
    const a = addCriterion("pass");
    await run(a.criterion.id);
    expect(status(a.criterion.id)?.status).toBe("VERIFIED");

    const original = fs.readFileSync(a.abs, "utf8");
    fs.appendFileSync(a.abs, "\nan extra line\n");
    expect(status(a.criterion.id)).toMatchObject({ status: "UNVERIFIED", statusNote: "TEST_FILE_CHANGED" });
    fs.writeFileSync(a.abs, original);
    expect(status(a.criterion.id)?.status).toBe("VERIFIED");

    svc.updateCriterion(projectId, a.criterion.id, { expectedBehavior: "A different expectation" });
    expect(status(a.criterion.id)).toMatchObject({ status: "UNVERIFIED", statusNote: "EXPECTED_BEHAVIOR_CHANGED" });
    svc.updateCriterion(projectId, a.criterion.id, { expectedBehavior: "The page shows the list" });
    expect(status(a.criterion.id)?.status).toBe("VERIFIED");

    // A file that exists but is not used by any other active criterion.
    const otherRel = `${projectId}/unused_test.md`;
    fs.writeFileSync(path.join(testsDir, ...otherRel.split("/")), "---\nmode: testing\n---\n\n## Step\nFAKE_MODE=pass\n");
    svc.updateCriterion(projectId, a.criterion.id, { testFile: otherRel });
    expect(status(a.criterion.id)).toMatchObject({ status: "UNVERIFIED", statusNote: "MAPPING_CHANGED" });
    svc.updateCriterion(projectId, a.criterion.id, { testFile: a.rel });
    fs.rmSync(a.abs);
    expect(status(a.criterion.id)).toMatchObject({ status: "UNVERIFIED", statusNote: "TEST_FILE_MISSING" });
  });

  it("editing a criterion never rewrites an earlier run's snapshot", async () => {
    const { criterion } = addCriterion("pass");
    const first = await run(criterion.id);
    svc.updateCriterion(projectId, criterion.id, { title: "Renamed", expectedBehavior: "Changed" });
    expect(verification.getRunDetail(first.run.id).run.criterionSnapshot).toMatchObject({ title: criterion.title, expectedBehavior: "The page shows the list" });
  });

  it("exit 0 without a terminal event is UNKNOWN, never verified", async () => {
    const { criterion } = addCriterion("noterminal");
    const d = await run(criterion.id);
    expect(d.run.status).toBe("UNKNOWN");
    expect(status(criterion.id)?.status).toBe("UNKNOWN");
  });

  it("a conflicting exit code and terminal status is UNKNOWN", async () => {
    const { criterion } = addCriterion("pass-but-exit1");
    expect((await run(criterion.id)).run.status).toBe("UNKNOWN");
  });

  it("exit 2 is NOT_STARTED and the criterion is BLOCKED", async () => {
    const { criterion } = addCriterion("exit2");
    const d = await run(criterion.id);
    expect(d.run).toMatchObject({ status: "NOT_STARTED", exitCode: 2 });
    expect(status(criterion.id)?.status).toBe("BLOCKED");
  });

  it("falls back to the stderr hint when Kane omits the evidence event", async () => {
    const { criterion } = addCriterion("pass", "FAKE_PACK=1 FAKE_NO_INGEST=1");
    const d = await run(criterion.id);
    expect(d.run.status).toBe("PASSED");
    expect(d.evidence[0]).toMatchObject({ available: true, source: "kane:kane_stderr_hint" });
  });

  it("records missing evidence as unavailable with a reason and keeps the test result", async () => {
    const { criterion } = addCriterion("pass", "");
    const d = await run(criterion.id);
    expect(d.run.status).toBe("PASSED");
    expect(d.run.evidenceAvailable).toBe(false);
    expect(d.evidence[0]).toMatchObject({ available: false, relativePath: null });
    expect(d.evidence[0]?.unavailableReason).toBeTruthy();
  });

  it("allows only one active run and frees the slot afterwards", async () => {
    const a = addCriterion("hang");
    const b = addCriterion("pass");
    const { runId } = verification.startRun(projectId, a.criterion.id);
    expect(errorOf(() => verification.startRun(projectId, b.criterion.id))).toMatchObject({ code: "RUNNER_BUSY", status: 409 });

    verification.cancelRun(runId);
    await verification.waitForRun(runId);
    expect((await run(b.criterion.id)).run.status).toBe("PASSED");
  }, 30_000);

  it("another process holding an active run also blocks a start (database check)", () => {
    const { criterion } = addCriterion("pass");
    svc.runs.createQueued(projectId, criterion.id, { projectName: "x", targetUrl: "https://a.test", title: "t", expectedBehavior: "e", notes: null, testFile: criterion.testFile, stepLabel: null }, "abc");
    expect(errorOf(() => verification.startRun(projectId, criterion.id)).code).toBe("RUNNER_BUSY");
  });

  it("cancels a running process: CANCELED is recorded only after it closes, and it never verifies", async () => {
    const { criterion } = addCriterion("hang");
    const { runId } = verification.startRun(projectId, criterion.id);
    await new Promise((r) => setTimeout(r, 700));
    expect(svc.runs.mustGet(runId).status).toBe("RUNNING");

    expect(verification.cancelRun(runId)).toEqual({ runId, status: "CANCEL_REQUESTED" });
    expect(svc.runs.mustGet(runId).status).toBe("RUNNING"); // not CANCELED until the process is observed to close
    await verification.waitForRun(runId);

    const d = verification.getRunDetail(runId);
    expect(d.run).toMatchObject({ status: "CANCELED", canceled: true });
    expect(status(criterion.id)?.status).toBe("CANCELED");
    expect(errorOf(() => verification.cancelRun(runId))).toMatchObject({ code: "RUN_NOT_ACTIVE", status: 409 });
  }, 30_000);

  it("cancel for an unknown or malformed run id is 404", () => {
    expect(errorOf(() => verification.cancelRun("7b4f1f53-7d5a-4f5d-86d8-789f4c2b7e10")).status).toBe(404);
    expect(errorOf(() => verification.cancelRun("nope")).status).toBe(404);
  });

  it("times out a hung run as TIMED_OUT", async () => {
    const short = new VerificationService({
      db,
      projects: svc.projects,
      criteria: svc.criteria,
      runs: svc.runs,
      evidence: svc.evidence,
      dirs: { dataDir, testsDir, evidenceDir, workDir },
      kaneCliPath: null,
      timeoutMs: 1500,
      maxBytesPerStream: 1024 * 1024,
      resolveLaunch: () => launch,
    });
    const { criterion } = addCriterion("hang");
    const { runId } = short.startRun(projectId, criterion.id);
    await short.waitForRun(runId);
    expect(short.getRunDetail(runId).run).toMatchObject({ status: "TIMED_OUT", timedOut: true });
    expect(status(criterion.id)?.status).toBe("TIMED_OUT");
  }, 30_000);

  it("a missing Kane executable still leaves a NOT_STARTED run record and reports 424", async () => {
    const { criterion } = addCriterion("pass");
    launch = null;
    const err = errorOf(() => verification.startRun(projectId, criterion.id));
    expect(err).toMatchObject({ code: "PREREQUISITE_FAILED", status: 424 });
    const runId = String(err.details.runId);
    expect(svc.runs.mustGet(runId)).toMatchObject({ status: "NOT_STARTED", errorCode: "PREREQUISITE_FAILED" });
    expect(status(criterion.id)?.status).toBe("BLOCKED");

    launch = FAKE_LAUNCH; // the slot was released
    expect((await run(criterion.id)).run.status).toBe("PASSED");
  });

  it("rejects a missing or escaping test file with 422 before any run record exists", () => {
    const { criterion, abs } = addCriterion("pass");
    fs.rmSync(abs);
    expect(errorOf(() => verification.startRun(projectId, criterion.id))).toMatchObject({ code: "TEST_MAPPING_INVALID", status: 422 });
    expect(svc.runs.listForCriterion(criterion.id)).toHaveLength(0);
  });

  it("a test file that changes while Kane runs cannot yield a result for either version", async () => {
    const { criterion, abs } = addCriterion("slowpass");
    const { runId } = verification.startRun(projectId, criterion.id);
    await new Promise((r) => setTimeout(r, 500));
    fs.appendFileSync(abs, "\nedited during the run\n");
    await verification.waitForRun(runId);
    const d = verification.getRunDetail(runId);
    expect(d.run.status).toBe("UNKNOWN");
    expect(d.run.summary).toContain("changed while the run was in progress");
    expect(status(criterion.id)?.status).toBe("UNKNOWN");
  }, 30_000);

  it("recovers runs left active by a previous process as UNKNOWN, never PASSED", async () => {
    const a = addCriterion("pass");
    const done = await run(a.criterion.id);
    const snap = { projectName: "x", targetUrl: "https://a.test", title: "t", expectedBehavior: "e", notes: null, testFile: a.rel, stepLabel: null };
    const queued = svc.runs.createQueued(projectId, a.criterion.id, snap, "h1");
    const running = svc.runs.createQueued(projectId, a.criterion.id, snap, "h2");
    svc.runs.updateLifecycle(running.id, { status: "RUNNING", startedAt: new Date().toISOString() });

    expect(verification.recoverInterruptedRuns()).toBe(2);
    for (const id of [queued.id, running.id]) {
      expect(svc.runs.mustGet(id)).toMatchObject({ status: "UNKNOWN", errorCode: "UNKNOWN_RUN_RESULT" });
    }
    expect(svc.runs.mustGet(done.run.id).status).toBe("PASSED");
    expect(verification.recoverInterruptedRuns()).toBe(0);
    expect(status(a.criterion.id)?.status).toBe("UNKNOWN");
  });

  it("lists runs newest first with a stable cursor and filters by criterion", async () => {
    const a = addCriterion("pass");
    const b = addCriterion("fail");
    const r1 = await run(a.criterion.id);
    const r2 = await run(b.criterion.id);
    const r3 = await run(a.criterion.id);

    const page1 = verification.listRuns(projectId, { limit: 2 });
    expect(page1.runs.map((r) => r.id)).toEqual([r3.run.id, r2.run.id]);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = verification.listRuns(projectId, { limit: 2, cursor: page1.nextCursor });
    expect(page2.runs.map((r) => r.id)).toEqual([r1.run.id]);
    expect(page2.nextCursor).toBeNull();

    expect(verification.listRuns(projectId, { criterionId: a.criterion.id }).runs).toHaveLength(2);
    expect(errorOf(() => verification.listRuns(projectId, { limit: 0 })).code).toBe("VALIDATION_ERROR");
    expect(errorOf(() => verification.listRuns(projectId, { limit: 101 })).code).toBe("VALIDATION_ERROR");
    expect(errorOf(() => verification.listRuns(projectId, { cursor: "!!!" })).code).toBe("VALIDATION_ERROR");
  });

  it("completed runs cannot be altered or deleted through the repository or SQL", async () => {
    const { criterion } = addCriterion("pass");
    const d = await run(criterion.id);
    expect(errorOf(() => svc.runs.updateLifecycle(d.run.id, { status: "FAILED" }))).toMatchObject({ code: "CONFLICT" });
    expect(() => db.prepare("DELETE FROM runs WHERE id = ?").run(d.run.id)).toThrow();
    expect(() => db.prepare("UPDATE runs SET test_file_sha256 = 'x' WHERE id = ?").run(d.run.id)).toThrow();
    expect(svc.runs.mustGet(d.run.id).status).toBe("PASSED");
  });

  it("never exposes absolute paths or the home directory in run output", async () => {
    const { criterion } = addCriterion("secret");
    const d = await run(criterion.id);
    const all = JSON.stringify(d);
    expect(all).not.toContain(os.homedir());
    expect(all).not.toContain(tmp);
  });
});
