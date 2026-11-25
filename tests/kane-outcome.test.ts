import { describe, expect, it } from "vitest";
import { classifyOutcome, type ProcessFacts } from "@/server/kane/outcome";
import { KaneStreamSummary, parseLine } from "@/server/kane/parser";

// Label: ProofLoop application test (status mapping). Not Kane verification.
function snapshotWith(doneStatus: string | null) {
  const s = new KaneStreamSummary();
  s.ingest(parseLine('{"type":"stream_start","cli_version":"0.10.9"}'));
  if (doneStatus !== null) s.ingest(parseLine(JSON.stringify({ type: "test_md_done", overall_status: doneStatus, duration_s: 1, session_id: "s" })));
  return s.snapshot();
}
const facts = (over: Partial<ProcessFacts> & { done?: string | null }): ProcessFacts => ({
  spawnError: null,
  exitCode: 0,
  signal: null,
  timedOut: false,
  canceled: false,
  terminationUnconfirmed: false,
  stdoutTruncated: false,
  snapshot: snapshotWith(over.done === undefined ? "passed" : over.done),
  ...over,
});

describe("classifyOutcome", () => {
  it("PASSED requires exit 0 AND a terminal passed event", () => {
    expect(classifyOutcome(facts({})).status).toBe("PASSED");
  });

  it.each([
    ["exit 0, no terminal event", { exitCode: 0, done: null }, "UNKNOWN"],
    ["exit 0, terminal says failed", { exitCode: 0, done: "failed" }, "UNKNOWN"],
    ["exit 0, terminal says something new", { exitCode: 0, done: "partial" }, "UNKNOWN"],
    ["exit 1, terminal passed", { exitCode: 1, done: "passed" }, "UNKNOWN"],
    ["exit 1, no terminal event", { exitCode: 1, done: null }, "UNKNOWN"],
    ["exit 3 without a ProofLoop flag", { exitCode: 3, done: null }, "UNKNOWN"],
    ["undocumented exit code", { exitCode: 77, done: null }, "UNKNOWN"],
    ["no exit code", { exitCode: null, done: null }, "UNKNOWN"],
    ["killed by a signal with no flag", { exitCode: null, signal: "SIGKILL", done: null }, "UNKNOWN"],
  ] as const)("%s is never PASSED", (_name, over, expected) => {
    const o = classifyOutcome(facts(over as Partial<ProcessFacts> & { done?: string | null }));
    expect(o.status).toBe(expected);
    expect(o.status).not.toBe("PASSED");
  });

  it("FAILED needs exit 1 and a terminal failed event", () => {
    expect(classifyOutcome(facts({ exitCode: 1, done: "failed" })).status).toBe("FAILED");
  });

  it("exit 2 is NOT_STARTED, even though no verdict event exists", () => {
    const o = classifyOutcome(facts({ exitCode: 2, done: null }));
    expect(o.status).toBe("NOT_STARTED");
    expect(o.summary).toContain("stderr");
  });

  it("a spawn error is NOT_STARTED", () => {
    const o = classifyOutcome(facts({ spawnError: "ENOENT", exitCode: null, done: null }));
    expect(o).toMatchObject({ status: "NOT_STARTED", errorCode: "SPAWN_FAILED" });
  });

  it("ProofLoop timeout and cancel win over the exit code (a forced kill exits 1)", () => {
    expect(classifyOutcome(facts({ timedOut: true, exitCode: 1, done: null })).status).toBe("TIMED_OUT");
    expect(classifyOutcome(facts({ canceled: true, exitCode: 1, done: null })).status).toBe("CANCELED");
  });

  it("a timeout or cancel never turns a passed stream into PASSED", () => {
    expect(classifyOutcome(facts({ timedOut: true, exitCode: 0, done: "passed" })).status).toBe("TIMED_OUT");
    expect(classifyOutcome(facts({ canceled: true, exitCode: 0, done: "passed" })).status).toBe("CANCELED");
  });

  it("unconfirmed termination is UNKNOWN, not TIMED_OUT or CANCELED", () => {
    expect(classifyOutcome(facts({ timedOut: true, terminationUnconfirmed: true, exitCode: null, done: null })).status).toBe("UNKNOWN");
    expect(classifyOutcome(facts({ canceled: true, terminationUnconfirmed: true, exitCode: null, done: null })).status).toBe("UNKNOWN");
  });

  it("summaries never claim an unobserved cause", () => {
    const o = classifyOutcome(facts({ exitCode: 1, done: null }));
    expect(o.summary).not.toMatch(/auth|credit|chrome|network/i);
  });
});
