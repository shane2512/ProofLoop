import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { KaneLaunch } from "@/server/kane/command";
import { createRedactor } from "@/server/security/redact";
import { ProofLoopService } from "@/server/services";
import { openDatabase, type Db } from "@/server/storage/db";
import { VerificationService } from "@/server/verification";

// Label: ProofLoop application test (Phase 8 hardening, FAKE Kane process). Not Kane verification.
const FAKE = fileURLToPath(new URL("./helpers/fake-kane.mjs", import.meta.url));
const SECRET = "SUPERSECRETVALUE12345";

interface Stack {
  db: Db;
  svc: ProofLoopService;
  verification: VerificationService;
}

describe("hardening: persistence, disk faults and what leaves the app", () => {
  let tmp: string;
  let dataDir: string;
  let testsDir: string;
  let evidenceDir: string;
  let stacks: Stack[];

  function open(overrides: { evidenceDir?: string } = {}): Stack {
    const db = openDatabase(path.join(dataDir, "proofloop.sqlite"));
    const svc = new ProofLoopService(db, testsDir);
    const launch: KaneLaunch = { executable: process.execPath, prefixArgs: [FAKE] };
    const verification = new VerificationService({
      db,
      projects: svc.projects,
      criteria: svc.criteria,
      runs: svc.runs,
      evidence: svc.evidence,
      dirs: { dataDir, testsDir, evidenceDir: overrides.evidenceDir ?? evidenceDir, workDir: path.join(dataDir, "kane-work") },
      kaneCliPath: null,
      timeoutMs: 30_000,
      maxBytesPerStream: 1024 * 1024,
      resolveLaunch: () => launch,
      redact: createRedactor({ secrets: [SECRET] }),
    });
    svc.verification = verification;
    const s = { db, svc, verification };
    stacks.push(s);
    return s;
  }

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-hard-"));
    dataDir = path.join(tmp, "data");
    testsDir = path.join(dataDir, "tests");
    evidenceDir = path.join(dataDir, "evidence");
    for (const d of [testsDir, evidenceDir, path.join(dataDir, "kane-work")]) fs.mkdirSync(d, { recursive: true });
    stacks = [];
  });
  afterEach(() => {
    for (const s of stacks) {
      try {
        s.db.close();
      } catch {
        // already closed by the test
      }
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function seed(s: Stack, mode: string) {
    const project = s.svc.createProject({ name: "Demo", targetUrl: "https://a.test" });
    const rel = `${project.id}/a_test.md`;
    fs.mkdirSync(path.join(testsDir, project.id), { recursive: true });
    fs.writeFileSync(path.join(testsDir, project.id, "a_test.md"), `FAKE_MODE=${mode} FAKE_PACK=1\n`);
    const criterion = s.svc.createCriterion(project.id, { title: "T", expectedBehavior: "E", testFile: rel });
    return { project, criterion };
  }
  async function run(s: Stack, projectId: string, criterionId: string) {
    const { runId } = s.verification.startRun(projectId, criterionId);
    await s.verification.waitForRun(runId);
    return runId;
  }

  it("keeps every run, report and criterion status after the app is restarted", async () => {
    const first = open();
    const { project, criterion } = seed(first, "fail");
    const failed = await run(first, project.id, criterion.id);
    fs.writeFileSync(path.join(testsDir, project.id, "a_test.md"), "FAKE_MODE=pass FAKE_PACK=1\n");
    const passed = await run(first, project.id, criterion.id);
    const reportBefore = first.verification.buildReport(failed, "markdown").body;
    const jsonBefore = first.verification.buildReport(passed, "json").body;
    first.db.close();

    const second = open();
    expect(second.svc.runs.listForCriterion(criterion.id).map((r) => r.status)).toEqual(["PASSED", "FAILED"]);
    expect(second.verification.buildReport(failed, "markdown").body).toBe(reportBefore);
    expect(second.verification.buildReport(passed, "json").body).toBe(jsonBefore);
    expect(second.svc.getProject(project.id).criteria[0]).toMatchObject({ status: "VERIFIED" });
    expect(second.verification.readRawOutput(failed, "stdout")).toContain("test_md_done");
    expect(second.verification.compareRuns(failed, passed).differences.map((d) => d.field)).toContain("status");
  });

  it("still records the real result when raw output cannot be written, and says so in the report", async () => {
    const s = open();
    const { project, criterion } = seed(s, "pass");
    // A file where the runs folder should be makes every write under it fail.
    fs.writeFileSync(path.join(dataDir, "runs"), "not a folder");
    const id = await run(s, project.id, criterion.id);
    const detail = s.verification.getRunDetail(id);
    expect(detail.run).toMatchObject({ status: "PASSED", exitCode: 0 });
    expect(() => s.verification.readRawOutput(id, "stdout")).toThrow(/not saved/);
    const md = s.verification.buildReport(id, "markdown").body;
    expect(md).toContain("Not available (no output was saved for this run)");
    expect(md).toContain("**PASSED**");
  });

  it("does not turn a result into a failure or a pass when evidence cannot be stored", async () => {
    // The evidence root sits under a plain file, so nothing can be copied into it.
    const blocker = path.join(tmp, "blocker.txt");
    fs.writeFileSync(blocker, "x");
    const s = open({ evidenceDir: path.join(blocker, "evidence") });
    const { project, criterion } = seed(s, "pass");
    const id = await run(s, project.id, criterion.id);
    const detail = s.verification.getRunDetail(id);
    expect(detail.run.status).toBe("PASSED");
    expect(detail.evidence.every((e) => !e.available)).toBe(true);
    expect(detail.evidence.length === 0 || detail.evidence.every((e) => (e.unavailableReason ?? "").length > 0)).toBe(true);
    expect(detail.run.evidenceAvailable).toBe(false);
    expect(s.verification.buildReport(id, "markdown").body).not.toContain("(available)");
  });

  it("never puts environment values, the home folder or the test file's absolute path in a report or export", async () => {
    process.env.PROOFLOOP_HARDENING_ENV = "ENVVALUE-should-never-appear";
    try {
      const s = open();
      const { project, criterion } = seed(s, "secret");
      const id = await run(s, project.id, criterion.id);
      const outputs = [
        s.verification.buildReport(id, "markdown").body,
        s.verification.buildReport(id, "json").body,
        s.verification.buildReport(id, "json", true).body,
        JSON.stringify(s.verification.getRunDetail(id)),
      ];
      for (const text of outputs) {
        expect(text).not.toContain("ENVVALUE-should-never-appear");
        expect(text).not.toContain(SECRET);
        expect(text).not.toContain(os.homedir());
        expect(text).not.toContain(testsDir);
        expect(text).not.toContain(dataDir);
      }
    } finally {
      delete process.env.PROOFLOOP_HARDENING_ENV;
    }
  });

  it("refuses to start a second run while one is active, and the first still finishes with its own result", async () => {
    const s = open();
    const { project, criterion } = seed(s, "slowpass");
    const { runId } = s.verification.startRun(project.id, criterion.id);
    expect(() => s.verification.startRun(project.id, criterion.id)).toThrow(/already in progress/);
    await s.verification.waitForRun(runId);
    expect(s.svc.runs.listForCriterion(criterion.id)).toHaveLength(1);
    expect(s.verification.getRunDetail(runId).run.status).toBe("PASSED");
  });

  it("marks a run left active by a crashed process UNKNOWN on the next start, never PASSED", async () => {
    const s = open();
    const { project, criterion } = seed(s, "pass");
    const run1 = s.svc.runs.createQueued(project.id, criterion.id, { projectName: "Demo", targetUrl: "https://a.test", title: "T", expectedBehavior: "E", notes: null, testFile: criterion.testFile, stepLabel: null });
    s.svc.runs.updateLifecycle(run1.id, { status: "RUNNING", startedAt: new Date().toISOString() });
    s.db.close();

    const next = open();
    expect(next.verification.recoverInterruptedRuns()).toBe(1);
    expect(next.verification.getRunDetail(run1.id).run.status).toBe("UNKNOWN");
    expect(next.svc.getProject(project.id).criteria[0]?.status).toBe("UNKNOWN");
    expect(() => next.verification.buildReport(run1.id, "markdown")).not.toThrow();
  });
});
