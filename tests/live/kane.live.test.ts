import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildKaneRunCommand, resolveKaneLaunch } from "@/server/kane/command";
import { discoverRunEvidence, importEvidencePack } from "@/server/kane/evidence";
import { preflightKane } from "@/server/kane/preflight";
import { startKaneProcess, type RunResult } from "@/server/kane/runner";
import { createRedactor } from "@/server/security/redact";

// Label: LIVE KANE VERIFICATION. Requires an installed, authenticated kane-cli, Chrome, network,
// and TestMu credits. Each run uploads to the account's Test Manager. Run only with
// `npm run test:live-kane`. These tests never run in the normal `npm test`.
const SMOKE = path.resolve(process.cwd(), "tests", "kane-smoke");
const FAKE_RUN_ID = "7b4f1f53-7d5a-4f5d-86d8-789f4c2b7e10";

describe("live Kane through the ProofLoop adapter", () => {
  let tmp: string;
  const redact = createRedactor();

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-live-"));
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  /** One working directory per run, as the Phase 4 service must do. */
  function runLive(testFile: string, label: string): Promise<{ r: RunResult; workDir: string }> {
    const workDir = path.join(tmp, `work-${label}`);
    fs.mkdirSync(workDir, { recursive: true });
    const launch = resolveKaneLaunch(null);
    expect(launch).not.toBeNull();
    const command = buildKaneRunCommand(launch!, path.join(SMOKE, testFile));
    return startKaneProcess({ command, cwd: workDir, timeoutMs: 600_000, maxBytesPerStream: 10 * 1024 * 1024, redact }).result.then((r) => ({ r, workDir }));
  }

  it("preflight finds Kane and reports the validated version", async () => {
    const dir = path.join(tmp, "work-preflight");
    fs.mkdirSync(dir, { recursive: true });
    const r = await preflightKane(null, dir, redact);
    console.log("[live] preflight:", JSON.stringify(r));
    expect(r.found).toBe(true);
    expect(r.versionSupported).toBe(true);
  });

  it("a passing test file yields PASSED, exit 0, and a verified evidence pack in the isolated cwd", async () => {
    const { r, workDir } = await runLive("login_pass_test.md", "pass");
    console.log("[live] pass:", JSON.stringify({ exit: r.exitCode, status: r.outcome.status, ms: r.durationMs, done: r.snapshot.done, steps: r.snapshot.summary, credits: r.snapshot.creditsConsumed, unknown: r.snapshot.unknownEventTypes, malformed: r.snapshot.malformedLineCount }));
    expect(r.exitCode).toBe(0);
    expect(r.snapshot.done?.overallStatus).toBe("passed");
    expect(r.outcome.status).toBe("PASSED");
    expect(r.snapshot.malformedLineCount).toBe(0);
    expect(r.stdout).not.toContain(os.homedir());
    expect(r.stderr).not.toContain(os.homedir());

    const ev = discoverRunEvidence(workDir, r.snapshot.evidenceId, r.stderr);
    console.log("[live] pass evidence:", JSON.stringify({ available: ev.available, source: ev.source, size: ev.sizeBytes, reason: ev.unavailableReason }));
    expect(ev.available).toBe(true);
    const imported = importEvidencePack(ev, path.join(tmp, "evidence"), FAKE_RUN_ID, ev.evidenceId!);
    expect(fs.existsSync(path.join(tmp, "evidence", ...imported.relativePath.split("/")))).toBe(true);
  }, 700_000);

  it("a failing test file yields FAILED, exit 1, a failure reason, and a verified evidence pack", async () => {
    const { r, workDir } = await runLive("login_fail_test.md", "fail");
    console.log("[live] fail:", JSON.stringify({ exit: r.exitCode, status: r.outcome.status, ms: r.durationMs, done: r.snapshot.done, failure: r.snapshot.failure && { code: r.snapshot.failure.reasonCode, result: r.snapshot.failure.resultCode, reason: r.snapshot.failure.reason }, assertions: r.snapshot.assertions, eventEvidenceId: r.snapshot.evidenceId }));
    expect(r.exitCode).toBe(1);
    expect(r.snapshot.done?.overallStatus).toBe("failed");
    expect(r.outcome.status).toBe("FAILED");
    // Kane's failure code is not stable between identical runs (observed: final_verification 710 and
    // step_not_achievable 750), so only its presence is asserted.
    expect(r.snapshot.failure?.reasonCode).toMatch(/^assertion_error\./);
    expect(r.snapshot.failure?.reason).toBeTruthy();

    const ev = discoverRunEvidence(workDir, r.snapshot.evidenceId, r.stderr);
    console.log("[live] fail evidence:", JSON.stringify({ available: ev.available, source: ev.source, size: ev.sizeBytes, reason: ev.unavailableReason }));
    expect(ev.available).toBe(true);
  }, 700_000);

  it("a missing test file path is rejected before any process starts", () => {
    const launch = resolveKaneLaunch(null);
    expect(() => buildKaneRunCommand(launch!, path.join(SMOKE, "no_such_test.md"))).toThrow();
  });
});
