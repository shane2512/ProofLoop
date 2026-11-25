import { describe, expect, it } from "vitest";
import { canTransition, isActiveRunStatus } from "@/server/domain/verification";
import { deriveCriterionStatus, type CurrentCriterionFacts, type LatestRunFacts } from "@/server/domain/status";
import type { RunStatus } from "@/server/domain/types";

// Label: ProofLoop application test (pure domain rules). Not Kane verification.
const ALL: RunStatus[] = ["QUEUED", "RUNNING", "PASSED", "FAILED", "NOT_STARTED", "TIMED_OUT", "CANCELED", "UNKNOWN"];
const TERMINAL: RunStatus[] = ["PASSED", "FAILED", "NOT_STARTED", "TIMED_OUT", "CANCELED", "UNKNOWN"];

describe("run state machine", () => {
  it("allows the documented forward transitions", () => {
    expect(canTransition("QUEUED", "RUNNING")).toBe(true);
    for (const t of ["NOT_STARTED", "CANCELED", "UNKNOWN"] as const) expect(canTransition("QUEUED", t)).toBe(true);
    for (const t of TERMINAL) expect(canTransition("RUNNING", t)).toBe(true);
  });

  it("does not let a queued run skip to a result it cannot have observed", () => {
    for (const t of ["PASSED", "FAILED", "TIMED_OUT"] as const) expect(canTransition("QUEUED", t)).toBe(false);
  });

  it("never moves backwards", () => {
    expect(canTransition("RUNNING", "QUEUED")).toBe(false);
  });

  it("never changes a completed run, including to the same status", () => {
    for (const from of TERMINAL) {
      for (const to of ALL) expect(canTransition(from, to)).toBe(false);
    }
  });

  it("allows rewriting an active status to record fields, and nothing else", () => {
    expect(canTransition("RUNNING", "RUNNING")).toBe(true);
    expect(canTransition("QUEUED", "QUEUED")).toBe(true);
    expect(isActiveRunStatus("RUNNING")).toBe(true);
    expect(isActiveRunStatus("PASSED")).toBe(false);
  });
});

describe("deriveCriterionStatus", () => {
  const run = (over: Partial<LatestRunFacts> = {}): LatestRunFacts => ({
    status: "PASSED",
    testFile: "p/a_test.md",
    testFileSha256: "aaa",
    expectedBehavior: "Shows the list",
    ...over,
  });
  const now = (over: Partial<CurrentCriterionFacts> = {}): CurrentCriterionFacts => ({
    testFile: "p/a_test.md",
    expectedBehavior: "Shows the list",
    currentTestFileSha256: "aaa",
    ...over,
  });

  it("is UNVERIFIED with no runs", () => {
    expect(deriveCriterionStatus(null, now())).toEqual({ status: "UNVERIFIED", note: null });
  });

  it("is VERIFIED only for a PASSED newest run whose test, mapping and meaning are unchanged", () => {
    expect(deriveCriterionStatus(run(), now())).toEqual({ status: "VERIFIED", note: null });
  });

  it.each([
    ["the test file content changed", now({ currentTestFileSha256: "bbb" }), "TEST_FILE_CHANGED"],
    ["the test file is gone", now({ currentTestFileSha256: null }), "TEST_FILE_MISSING"],
    ["the criterion is mapped to another file", now({ testFile: "p/b_test.md" }), "MAPPING_CHANGED"],
    ["the expected behavior was edited", now({ expectedBehavior: "Something else" }), "EXPECTED_BEHAVIOR_CHANGED"],
  ] as const)("a pass no longer verifies when %s", (_name, current, note) => {
    expect(deriveCriterionStatus(run(), current)).toEqual({ status: "UNVERIFIED", note });
  });

  it("a pass recorded without a test hash can never verify", () => {
    expect(deriveCriterionStatus(run({ testFileSha256: null }), now())).toEqual({ status: "UNVERIFIED", note: "NO_TEST_FILE_HASH" });
  });

  it("maps every other newest status without ever producing VERIFIED", () => {
    const expected: Array<[RunStatus, string]> = [
      ["QUEUED", "RUNNING"],
      ["RUNNING", "RUNNING"],
      ["FAILED", "FAILED"],
      ["NOT_STARTED", "BLOCKED"],
      ["TIMED_OUT", "TIMED_OUT"],
      ["CANCELED", "CANCELED"],
      ["UNKNOWN", "UNKNOWN"],
    ];
    for (const [status, want] of expected) {
      const d = deriveCriterionStatus(run({ status }), now());
      expect(d.status).toBe(want);
      expect(d.status).not.toBe("VERIFIED");
    }
  });

  it("a later non-passing run replaces an earlier pass (the newest run decides)", () => {
    expect(deriveCriterionStatus(run({ status: "FAILED" }), now()).status).toBe("FAILED");
    expect(deriveCriterionStatus(run({ status: "CANCELED" }), now()).status).toBe("CANCELED");
  });
});
