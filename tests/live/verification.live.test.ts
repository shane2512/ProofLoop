import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveKaneLaunch } from "@/server/kane/command";
import { ProofLoopService } from "@/server/services";
import { openDatabase, type Db } from "@/server/storage/db";
import { VerificationService } from "@/server/verification";

// Label: LIVE KANE VERIFICATION through the Phase 4 verification service and a real SQLite database.
// Needs an authenticated kane-cli 0.10.9, Chrome, network and TestMu credits. Each run uploads to the
// account's Test Manager. Run only with `npm run test:live-kane`; never part of `npm test`.
const SMOKE = path.resolve(process.cwd(), "tests", "kane-smoke");

describe("live: verification service with real Kane", () => {
  let tmp: string;
  let db: Db;
  let svc: ProofLoopService;
  let verification: VerificationService;
  let projectId: string;
  let testsDir: string;
  let evidenceDir: string;
  let dataDir: string;
  let workDir: string;
  const log = (label: string, value: unknown) => console.log(`[live] ${label}: ${JSON.stringify(value)}`);

  function mapTest(name: string, title: string) {
    const rel = `${projectId}/${name}`;
    const abs = path.join(testsDir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.copyFileSync(path.join(SMOKE, name), abs);
    const criterion = svc.createCriterion(projectId, { title, expectedBehavior: `${title} (live smoke)`, testFile: rel });
    return { criterion, abs };
  }
  const criterionNow = (id: string) => svc.getProject(projectId).criteria.find((c) => c.id === id);
  async function runLive(criterionId: string) {
    const { runId } = verification.startRun(projectId, criterionId);
    await verification.waitForRun(runId);
    return verification.getRunDetail(runId);
  }

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-liveverif-"));
    dataDir = path.join(tmp, "data");
    testsDir = path.join(dataDir, "tests");
    evidenceDir = path.join(dataDir, "evidence");
    workDir = path.join(dataDir, "kane-work");
    for (const d of [testsDir, evidenceDir, workDir]) fs.mkdirSync(d, { recursive: true });
    db = openDatabase(path.join(dataDir, "proofloop.sqlite"));
    svc = new ProofLoopService(db, testsDir);
    verification = new VerificationService({
      db,
      projects: svc.projects,
      criteria: svc.criteria,
      runs: svc.runs,
      evidence: svc.evidence,
      dirs: { dataDir, testsDir, evidenceDir, workDir },
      kaneCliPath: null,
      timeoutMs: 600_000,
      maxBytesPerStream: 10 * 1024 * 1024,
    });
    svc.verification = verification;
    projectId = svc.createProject({ name: "Live smoke", targetUrl: "https://www.saucedemo.com/" }).id;
  });

  afterAll(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("Kane is available", () => {
    expect(resolveKaneLaunch(null)).not.toBeNull();
  });

  let passCriterionId = "";
  let passAbs = "";
  let firstPassRunId = "";

  it("a real passing run verifies its criterion and stores evidence and raw output", async () => {
    const { criterion, abs } = mapTest("login_pass_test.md", "Login reaches inventory");
    passCriterionId = criterion.id;
    passAbs = abs;
    const hashBefore = fs.readFileSync(abs, "utf8");

    const d = await runLive(criterion.id);
    firstPassRunId = d.run.id;
    const kane = d.kane as { done?: { overallStatus?: string }; summary?: { replayDecisions?: number; authorDecisions?: number }; creditsConsumed?: number | null; unknownEventTypes?: object };
    log("pass run", { status: d.run.status, exit: d.run.exitCode, ms: d.run.durationMs, summary: d.run.summary, evidence: d.evidence.map((e) => ({ available: e.available, source: e.source })), events: d.events.length, kaneDone: kane.done, steps: kane.summary, credits: kane.creditsConsumed });

    expect(d.run.status).toBe("PASSED");
    expect(d.run.exitCode).toBe(0);
    expect(kane.done?.overallStatus).toBe("passed");
    expect(d.run.evidenceAvailable).toBe(true);
    expect(fs.existsSync(path.join(evidenceDir, ...(d.evidence[0]?.relativePath ?? "missing").split("/")))).toBe(true);
    expect(fs.readFileSync(path.join(dataDir, "runs", d.run.id, "stdout.log"), "utf8")).toContain("test_md_done");
    expect(JSON.stringify(d)).not.toContain(os.homedir());
    expect(fs.existsSync(path.join(workDir, d.run.id))).toBe(false);
    // Kane must not rewrite the test file, or the hash rule would never verify anything.
    expect(fs.readFileSync(abs, "utf8")).toBe(hashBefore);

    const c = criterionNow(criterion.id);
    log("pass criterion", { status: c?.status, note: c?.statusNote });
    expect(c).toMatchObject({ status: "VERIFIED", lastRunId: d.run.id });
  }, 700_000);

  it("a real failing run marks its criterion FAILED with Kane's reason", async () => {
    const { criterion } = mapTest("login_fail_test.md", "Heading that does not exist");
    const d = await runLive(criterion.id);
    const kane = d.kane as { failure?: { reasonCode?: string; reason?: string; kaneVerdict?: { rootCause?: string } } };
    log("fail run", { status: d.run.status, exit: d.run.exitCode, ms: d.run.durationMs, summary: d.run.summary, evidence: d.evidence.map((e) => ({ available: e.available, source: e.source })), failure: kane.failure });

    expect(d.run.status).toBe("FAILED");
    expect(d.run.exitCode).toBe(1);
    expect(kane.failure?.reason).toBeTruthy();
    expect(d.run.evidenceAvailable).toBe(true);
    expect(criterionNow(criterion.id)?.status).toBe("FAILED");
    // The earlier pass is untouched.
    expect(criterionNow(passCriterionId)?.status).toBe("VERIFIED");
  }, 700_000);

  it("editing the passing test makes the pass stale, and restoring it verifies again", () => {
    const original = fs.readFileSync(passAbs, "utf8");
    fs.appendFileSync(passAbs, "\n");
    log("after edit", criterionNow(passCriterionId)?.statusNote);
    expect(criterionNow(passCriterionId)).toMatchObject({ status: "UNVERIFIED", statusNote: "TEST_FILE_CHANGED" });
    fs.writeFileSync(passAbs, original);
    expect(criterionNow(passCriterionId)?.status).toBe("VERIFIED");
  });

  it("a repeat run is a new immutable record and the first stays unchanged", async () => {
    const before = verification.getRunDetail(firstPassRunId).run;
    const d = await runLive(passCriterionId);
    const kane = d.kane as { summary?: { replayDecisions?: number; authorDecisions?: number } };
    log("repeat run", { status: d.run.status, exit: d.run.exitCode, ms: d.run.durationMs, steps: kane.summary, evidence: d.evidence.map((e) => ({ available: e.available, source: e.source })) });

    expect(d.run.id).not.toBe(firstPassRunId);
    expect(d.run.status).toBe("PASSED");
    expect(verification.getRunDetail(firstPassRunId).run).toEqual(before);
    const history = verification.listRuns(projectId, { criterionId: passCriterionId });
    expect(history.runs.map((r) => r.id)).toEqual([d.run.id, firstPassRunId]);
    expect(criterionNow(passCriterionId)?.status).toBe("VERIFIED");
  }, 700_000);
});
