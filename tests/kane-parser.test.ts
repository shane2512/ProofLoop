import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { KaneStreamSummary, PARSER_VERSION, parseLine } from "@/server/kane/parser";

// Label: Kane parser FIXTURE test. The samples are sanitized excerpts of real kane-cli 0.10.9
// output (docs/phase0-samples). They validate ProofLoop's parser only and never count as a Kane
// verification.
const sample = (name: string): string[] =>
  fs
    .readFileSync(fileURLToPath(new URL(`../docs/phase0-samples/${name}`, import.meta.url)), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");

function summarize(lines: string[]) {
  const s = new KaneStreamSummary();
  for (const l of lines) s.ingest(parseLine(l));
  return s.snapshot();
}

describe("parseLine", () => {
  it("classifies empty, malformed and event lines without throwing", () => {
    expect(parseLine("")).toEqual({ kind: "empty" });
    expect(parseLine("   ")).toEqual({ kind: "empty" });
    expect(parseLine("not json")).toMatchObject({ kind: "malformed", reason: "invalid_json" });
    expect(parseLine("[1]")).toMatchObject({ kind: "malformed", reason: "not_an_event_object" });
    expect(parseLine('{"no_type":1}')).toMatchObject({ kind: "malformed" });
    expect(parseLine('{"type":"x","extra":{"a":1}}')).toMatchObject({ kind: "event", type: "x" });
  });
});

describe("KaneStreamSummary on real sanitized samples (fixture)", () => {
  it("reads a failing run: failed terminal status, assertion text, Kane verdict, evidence id", () => {
    const s = summarize(sample("fail-authoring.ndjson"));
    expect(s.parserVersion).toBe(PARSER_VERSION);
    expect(s.cliVersion).toBe("0.10.9");
    expect(s.done).toEqual({ overallStatus: "failed", durationS: 76, sessionId: "ed5ca820-5832-481a-9d14-6bdaae54ac2c" });
    expect(s.failure?.reasonCode).toBe("assertion_error.final_verification");
    expect(s.failure?.resultCode).toBe(710);
    expect(s.failure?.kaneVerdict?.family).toBe("automation_bug");
    expect(s.assertions).toEqual([{ detail: expect.stringContaining("ProofLoop Deliberate Failure 7431"), passed: false }]);
    expect(s.evidenceId).toBe("c2e7cc48-23ca-4607-bb1e-a0ad48acc4a3");
    expect(s.summary).toMatchObject({ stepsTotal: 2, stepsPassed: 1, stepsFailed: 1, uploadPerformed: true, committed: false });
    expect(s.creditsConsumed).toBeCloseTo(11.96699, 4);
    expect(s.steps.map((x) => x.status)).toEqual([null, "failed"]);
    expect(s.malformedLineCount).toBe(0);
  });

  it("reads an authored passing run", () => {
    const s = summarize(sample("pass-authoring.ndjson"));
    expect(s.done?.overallStatus).toBe("passed");
    expect(s.failure).toBeNull();
    expect(s.evidenceId).toBe("2ea337ce-92f8-468e-af86-b8a22daa2002");
    expect(s.summary).toMatchObject({ authorDecisions: 2, replayDecisions: 0, committed: true });
    expect(s.creditsConsumed).toBeCloseTo(13.868775, 4);
  });

  it("reads a replayed passing run, which has no credits", () => {
    const s = summarize(sample("pass-replay.ndjson"));
    expect(s.done?.overallStatus).toBe("passed");
    expect(s.creditsConsumed).toBeNull();
    expect(s.summary).toMatchObject({ replayDecisions: 2, authorDecisions: 0 });
  });

  it("never exposes the share URL", () => {
    expect(JSON.stringify(summarize(sample("fail-authoring.ndjson")))).not.toContain("share");
  });
});

describe("KaneStreamSummary tolerance (fixture)", () => {
  it("counts unknown event types and malformed lines, and keeps going", () => {
    const s = summarize([
      "garbage",
      '{"type":"brand_new_event","x":1}',
      '{"type":"brand_new_event"}',
      '{"type":"test_md_done","overall_status":"passed","duration_s":3,"session_id":"s"}',
    ]);
    expect(s.malformedLineCount).toBe(1);
    expect(s.unknownEventTypes).toEqual({ brand_new_event: 2 });
    expect(s.done?.overallStatus).toBe("passed");
  });

  it("has no terminal event when the stream is cut short", () => {
    const s = summarize(['{"type":"stream_start","cli_version":"0.10.9"}']);
    expect(s.streamStarted).toBe(true);
    expect(s.done).toBeNull();
  });

  it("ignores wrongly typed fields instead of throwing", () => {
    const s = summarize([
      '{"type":"test_md_done","overall_status":42,"duration_s":"slow","session_id":null}',
      '{"type":"test_md_evidence_ingest","evidence_id":"../../etc/passwd","status":"ok"}',
      '{"type":"run_end","status":"failed","verdict":"not-an-object","credits_consumed":"x"}',
    ]);
    expect(s.done).toEqual({ overallStatus: null, durationS: null, sessionId: null });
    expect(s.evidenceId).toBeNull();
    expect(s.failure?.kaneVerdict).toBeNull();
    expect(s.creditsConsumed).toBeNull();
  });

  it("bounds long strings", () => {
    const long = "a".repeat(10_000);
    const s = summarize([JSON.stringify({ type: "run_end", status: "failed", reason: long })]);
    expect(s.failure?.reason?.length).toBe(2000);
  });
});
