import { describe, expect, it } from "vitest";
import { buildAgentReportMarkdown, type ReportInput } from "@/server/reports/agent-feedback";
import { describeCommand, fenced, scrubDataDir, tailExcerpt } from "@/server/reports/common";
import { buildJsonReport, compareRuns, runFacts } from "@/server/reports/export";
import type { KaneStreamSnapshot } from "@/server/kane/parser";
import type { RunSummaryDto } from "@/server/verification";

// Label: ProofLoop application test with FIXTURE records. Nothing here is a Kane result.

const run = (over: Partial<RunSummaryDto> = {}): RunSummaryDto => ({
  id: "11111111-2222-4333-8444-555555555555",
  projectId: "p",
  criterionId: "c",
  criterionSnapshot: {
    projectName: "Demo Shop",
    targetUrl: "https://shop.test/",
    title: "Login reaches inventory",
    expectedBehavior: "A valid user reaches the inventory page.",
    notes: null,
    testFile: "p/login_test.md",
    stepLabel: "Inventory visible",
  },
  status: "FAILED",
  exitCode: 1,
  signal: null,
  timedOut: false,
  canceled: false,
  summary: "Kane reported the test file failed.",
  errorCode: "EXIT_NONZERO",
  durationMs: 12_300,
  startedAt: "2026-11-25T10:00:00.000Z",
  finishedAt: "2026-11-25T10:00:12.000Z",
  stdoutTruncated: false,
  stderrTruncated: false,
  evidenceAvailable: true,
  createdAt: "2026-11-25T10:00:00.000Z",
  ...over,
});

const kane = (over: Partial<KaneStreamSnapshot> = {}): KaneStreamSnapshot => ({
  parserVersion: "kane-testmd-ndjson/1",
  streamStarted: true,
  cliVersion: "0.10.9",
  done: { overallStatus: "failed", durationS: 9, sessionId: null },
  summary: { overallStatus: "failed", durationS: 9, stepsTotal: 1, stepsPassed: 0, stepsFailed: 1, stepsSkipped: 0, replayDecisions: null, authorDecisions: null, uploadPerformed: true, uploadSucceeded: true, committed: null, cancelled: null },
  evidenceId: null,
  evidenceIngestStatus: null,
  steps: [{ index: 1, heading: "Check heading", status: "failed", durationS: 1 }],
  assertions: [{ detail: "heading is shown", passed: false }],
  failure: { reason: "Final verification failed", reasonCode: "assertion_error", resultCode: 710, summary: "Heading missing", oneLiner: null, kaneVerdict: { rootCause: "Heading absent", suggestion: "Add the heading", confidence: 0.9, family: null, category: null, severity: null } },
  creditsConsumed: null,
  eventCount: 4,
  malformedLineCount: 0,
  unknownEventTypes: {},
  ...over,
});

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  run: run(),
  kane: kane(),
  evidence: [{ id: "e1", kind: "EVIDENCE_PACK", label: "Kane evidence pack", available: true, source: "event", relativePath: "p/abc.evidence", unavailableReason: null }],
  command: ["C:\\Program Files\\nodejs\\node.exe", "C:\\Users\\someone\\kane-cli.cjs", "testmd", "run", "C:\\Users\\someone\\data\\tests\\p\\login_test.md", "--agent", "--headless"],
  stdout: '{"type":"stream_start"}\n{"type":"test_md_done"}\n',
  stderr: "",
  ...over,
});

describe("agent report (FR-017)", () => {
  it("is deterministic: the same record always gives the same text", () => {
    expect(buildAgentReportMarkdown(input())).toBe(buildAgentReportMarkdown(input()));
  });

  it("states the criterion, observed result, exit code, Kane's diagnosis, output and evidence", () => {
    const md = buildAgentReportMarkdown(input());
    for (const s of [
      "# ProofLoop verification report",
      "- Project: Demo Shop",
      "- Criterion: Login reaches inventory",
      "- Expected behavior: A valid user reaches the inventory page.",
      "- ProofLoop run status: **FAILED**. Kane reported that the test failed.",
      "- Exit code: 1",
      "- Kane's final result event: failed",
      "1. [failed] Check heading (1 s)",
      "[failed] heading is shown",
      "These are Kane's statements. ProofLoop has not checked them.",
      "- Likely cause, per Kane: Heading absent",
      '{"type":"test_md_done"}',
      "- Kane evidence pack: `p/abc.evidence` (available)",
      "`kane-cli testmd run login_test.md --agent --headless`",
    ]) {
      expect(md, s).toContain(s);
    }
  });

  it("tells the agent to propose a minimal fix and not to claim verification, for a failed run", () => {
    const md = buildAgentReportMarkdown(input());
    expect(md).toContain("smallest change");
    expect(md).toContain("Do not edit the Kane test file");
    expect(md).toContain("only a new passing Kane run can do that");
  });

  it("asks for no fix when the run passed, and does not call a non-result a defect", () => {
    expect(buildAgentReportMarkdown(input({ run: run({ status: "PASSED", exitCode: 0, errorCode: null }), kane: kane({ done: { overallStatus: "passed", durationS: 1, sessionId: null }, failure: null }) }))).toContain("No fix is requested");
    for (const status of ["TIMED_OUT", "CANCELED", "UNKNOWN", "NOT_STARTED"] as const) {
      const md = buildAgentReportMarkdown(input({ run: run({ status, exitCode: null }) }));
      expect(md, status).toContain("so no pass or fail was established");
      expect(md, status).toContain("Do not treat it as a defect");
    }
  });

  it("labels everything that was not recorded instead of filling it in", () => {
    const md = buildAgentReportMarkdown(
      input({ run: run({ exitCode: null, durationMs: null, finishedAt: null }), kane: null, evidence: [], command: null, stdout: null, stderr: null }),
    );
    for (const s of [
      "Not available (the process did not report one)",
      "Not available (Kane did not send one)",
      "No step results were recorded.",
      "Kane did not report a failure diagnosis for this run.",
      "Not available (no output was saved for this run)",
      "No evidence was recorded for this run.",
      "Not available (no process was started)",
      "## Not recorded",
      "- Exit code (the process did not report one)",
      "- Saved stdout",
      "- Evidence files",
    ]) {
      expect(md, s).toContain(s);
    }
    expect(md).not.toContain("undefined");
    expect(md).not.toContain("null");
  });

  it("lists an unavailable evidence file with its reason and no path", () => {
    const md = buildAgentReportMarkdown(
      input({ evidence: [{ id: "e1", kind: "EVIDENCE_PACK", label: "Kane evidence pack", available: false, source: "event", relativePath: null, unavailableReason: "Kane did not write the file." }] }),
    );
    expect(md).toContain("- Kane evidence pack: not available. Kane did not write the file.");
    expect(md).not.toContain("(available)");
  });

  it("never prints absolute local paths from the recorded command", () => {
    const md = buildAgentReportMarkdown(input());
    expect(md).not.toContain("C:\\Users");
    expect(md).not.toContain("Program Files");
  });

  it("cannot be broken out of by output that contains code fences", () => {
    const md = buildAgentReportMarkdown(input({ stdout: "before\n```\n# Fake heading\n```\nafter\n" }));
    const open = md.indexOf("````");
    expect(open).toBeGreaterThan(-1);
    expect(md.slice(open)).toContain("# Fake heading");
    expect(fenced("a ``` b")).toBe("````\na ``` b\n````");
  });

  it("shows only the tail of long output, and says how much was cut", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
    const ex = tailExcerpt(lines);
    expect(ex).toMatchObject({ shownLines: 25, totalLines: 100 });
    expect(ex.text.startsWith("line 76")).toBe(true);
    const md = buildAgentReportMarkdown(input({ stdout: lines }));
    expect(md).toContain("Last 25 of 100 non-empty lines");
    expect(md).not.toContain("line 75\n");
  });

  it("says when the saved stream was cut at ProofLoop's size limit", () => {
    expect(buildAgentReportMarkdown(input({ run: run({ stdoutTruncated: true }) }))).toContain("stopped saving this stream at its size limit");
  });
});

describe("scrubDataDir", () => {
  const home = "C:\\Users\\someone";
  const data = "C:\\Users\\someone\\proofloop\\data";
  it("hides the data folder in every spelling saved output can use", () => {
    const text = [
      "raw C:\\Users\\someone\\proofloop\\data\\tests\\a.md",
      "after home redaction <HOME>\\proofloop\\data\\tests\\a.md",
      '{"path":"<HOME>\\\\proofloop\\\\data\\\\tests\\\\a.md"}',
      "slashes C:/Users/someone/proofloop/data/evidence/x",
      "case C:\\USERS\\SOMEONE\\PROOFLOOP\\DATA\\x",
    ].join("\n");
    const out = scrubDataDir(text, data, home);
    expect(out).not.toMatch(/proofloop[\\/]+data/i);
    expect(out.match(/<DATA>/g)).toHaveLength(process.platform === "win32" ? 5 : 4);
  });
  it("leaves unrelated text alone", () => {
    expect(scrubDataDir("nothing to see at C:\\other\\place", data, home)).toBe("nothing to see at C:\\other\\place");
  });
});

describe("describeCommand", () => {
  it("keeps the subcommand and reduces path arguments to file names", () => {
    expect(describeCommand(["node", "C:\\x\\kane.cjs", "testmd", "run", "/a/b/c_test.md", "--agent"])).toBe("kane-cli testmd run c_test.md --agent");
  });
  it("is null when there is nothing to describe", () => {
    expect(describeCommand(null)).toBeNull();
    expect(describeCommand(["node", "other"])).toBeNull();
  });
});

describe("JSON export (FR-019)", () => {
  it("uses schemaVersion 1 and carries no raw output unless asked", () => {
    const json = buildJsonReport(input(), [{ eventType: "stream_start" }, { eventType: "stream_start" }, { eventType: null }], false);
    expect(json.schemaVersion).toBe(1);
    expect(json.output).toEqual({ included: false, reason: "Raw output is only exported when requested." });
    expect(JSON.stringify(json)).not.toContain("test_md_done");
    expect(json.eventsSummary).toEqual({ total: 3, byType: { stream_start: 2, "(none)": 1 } });
    expect(json.command).toBe("kane-cli testmd run login_test.md --agent --headless");
  });

  it("includes stdout and stderr only when includeOutput is set", () => {
    const json = buildJsonReport(input(), [], true);
    expect(json.output).toMatchObject({ included: true, stdout: expect.stringContaining("test_md_done") });
  });

  it("gives null with a reason for what was not recorded", () => {
    const json = buildJsonReport(input({ run: run({ exitCode: null }), kane: null, evidence: [], command: null }), [], false);
    expect(json.run.exitCode).toBeNull();
    expect(json.run.exitCodeReason).toMatch(/did not report/);
    expect(json.kane).toEqual({ observed: false, reason: "No Kane output was recorded for this run." });
    expect(json.evidence).toEqual([]);
    expect(json.command).toBeNull();
  });

  it("never exposes a path for unavailable evidence", () => {
    const json = buildJsonReport(input({ evidence: [{ id: "e", kind: "OTHER", label: "x", available: false, source: "s", relativePath: "leftover/path", unavailableReason: "gone" }] }), [], false);
    expect(json.evidence[0]).toMatchObject({ available: false, relativePath: null, unavailableReason: "gone" });
  });
});

describe("run comparison (FR-020)", () => {
  const failed = runFacts(run(), kane(), []);
  const passed = runFacts(
    run({ id: "99999999-2222-4333-8444-555555555555", status: "PASSED", exitCode: 0, errorCode: null, summary: "Kane reported a pass.", durationMs: 9000 }),
    kane({ done: { overallStatus: "passed", durationS: 8, sessionId: null }, summary: { ...kane().summary!, stepsPassed: 1, stepsFailed: 0 } }),
    [{ id: "e", kind: "EVIDENCE_PACK", label: "pack", available: true, source: "s", relativePath: "p/x.evidence", unavailableReason: null }],
  );

  it("lists exactly the recorded fields that differ", () => {
    const c = compareRuns(failed, passed);
    expect(c.differences.map((d) => d.field).sort()).toEqual(["durationMs", "exitCode", "errorCode", "kaneFinalStatus", "status", "stepsFailed", "stepsPassed", "summary"].sort());
    expect(c.differences.find((d) => d.field === "status")).toEqual({ field: "status", a: "FAILED", b: "PASSED" });
  });

  it("reports no differences for identical records and makes no causal claim", () => {
    const c = compareRuns(failed, { ...failed, id: "other" });
    expect(c.differences).toEqual([]);
    expect(c.note).toContain("does not infer what caused them");
    expect(JSON.stringify(c)).not.toMatch(/because|caused by|fixed/i);
  });

  it("notices when the criterion or its test changed between runs", () => {
    const edited = runFacts(run({ id: "z", criterionSnapshot: { ...run().criterionSnapshot, expectedBehavior: "Changed.", testFile: "p/other_test.md" } }), kane(), []);
    const fields = compareRuns(failed, edited).differences.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["expectedBehavior", "testFile"]));
  });
});
