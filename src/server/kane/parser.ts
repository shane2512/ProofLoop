import "server-only";

/**
 * Parser for `kane-cli testmd run --agent` NDJSON. Written against kane-cli 0.10.9 output
 * (docs/phase0-findings.md). It reads only fields observed there, tolerates unknown events and
 * fields, and never throws on bad input.
 */
export const PARSER_VERSION = "kane-testmd-ndjson/1";

const MAX_STRING = 2000;
const MAX_STEPS = 200;
const MAX_ASSERTIONS = 50;
const MAX_UNKNOWN_TYPES = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Json = Record<string, unknown>;

export type ParsedLine =
  | { kind: "empty" }
  | { kind: "malformed"; raw: string; reason: string }
  | { kind: "event"; type: string; data: Json; raw: string };

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const asString = (v: unknown): string | null => (typeof v === "string" ? v.slice(0, MAX_STRING) : null);
const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseLine(raw: string): ParsedLine {
  if (raw.trim() === "") return { kind: "empty" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "malformed", raw, reason: "invalid_json" };
  }
  if (!isObject(value) || typeof value.type !== "string") {
    return { kind: "malformed", raw, reason: "not_an_event_object" };
  }
  return { kind: "event", type: value.type, data: value, raw };
}

export interface KaneStepSummary {
  index: number;
  heading: string | null;
  status: string | null;
  durationS: number | null;
}

export interface KaneVerdict {
  rootCause: string | null;
  suggestion: string | null;
  confidence: number | null;
  family: string | null;
  category: string | null;
  severity: string | null;
}

/** Details of the first non-passing `run_end`. `kaneVerdict` is Kane's own diagnosis, not ProofLoop's. */
export interface KaneFailure {
  reason: string | null;
  reasonCode: string | null;
  resultCode: number | null;
  summary: string | null;
  oneLiner: string | null;
  kaneVerdict: KaneVerdict | null;
}

export interface KaneAssertion {
  detail: string | null;
  passed: boolean | null;
}

export interface KaneStreamSnapshot {
  parserVersion: string;
  streamStarted: boolean;
  cliVersion: string | null;
  /** Present only when the terminal `test_md_done` event arrived. */
  done: { overallStatus: string | null; durationS: number | null; sessionId: string | null } | null;
  summary: {
    overallStatus: string | null;
    durationS: number | null;
    stepsTotal: number | null;
    stepsPassed: number | null;
    stepsFailed: number | null;
    stepsSkipped: number | null;
    replayDecisions: number | null;
    authorDecisions: number | null;
    uploadPerformed: boolean | null;
    uploadSucceeded: boolean | null;
    committed: boolean | null;
    cancelled: boolean | null;
  } | null;
  evidenceId: string | null;
  evidenceIngestStatus: string | null;
  steps: KaneStepSummary[];
  assertions: KaneAssertion[];
  failure: KaneFailure | null;
  creditsConsumed: number | null;
  eventCount: number;
  malformedLineCount: number;
  unknownEventTypes: Record<string, number>;
}

const KNOWN_TYPES = new Set([
  "stream_start",
  "test_md_step_start",
  "test_md_step_end",
  "bifurcation",
  "run_start",
  "step_start",
  "step_event",
  "describe_trigger",
  "step_end",
  "run_end",
  "test_md_bug_verdict",
  "test_md_evidence_ingest",
  "test_md_bundle_sync",
  "test_md_summary",
  "coverage",
  "test_md_done",
]);

const asBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/** Accumulates a bounded summary of a stream, one line at a time. */
export class KaneStreamSummary {
  private streamStarted = false;
  private cliVersion: string | null = null;
  private done: KaneStreamSnapshot["done"] = null;
  private summary: KaneStreamSnapshot["summary"] = null;
  private evidenceId: string | null = null;
  private evidenceIngestStatus: string | null = null;
  private readonly steps = new Map<number, KaneStepSummary>();
  private readonly assertions: KaneAssertion[] = [];
  private failure: KaneFailure | null = null;
  private credits = 0;
  private sawCredits = false;
  private eventCount = 0;
  private malformed = 0;
  private readonly unknown: Record<string, number> = {};

  ingest(line: ParsedLine): void {
    if (line.kind === "empty") return;
    if (line.kind === "malformed") {
      this.malformed += 1;
      return;
    }
    this.eventCount += 1;
    const d = line.data;
    switch (line.type) {
      case "stream_start":
        this.streamStarted = true;
        this.cliVersion = asString(d.cli_version);
        return;
      case "test_md_step_start": {
        const idx = asNumber(d.step_index);
        if (idx !== null) this.upsertStep(idx, { heading: asString(d.heading) });
        return;
      }
      case "test_md_step_end": {
        const idx = asNumber(d.step_index);
        if (idx !== null) this.upsertStep(idx, { status: asString(d.status), durationS: asNumber(d.duration_s) });
        return;
      }
      case "step_event":
        if (d.event === "assertion" && this.assertions.length < MAX_ASSERTIONS) {
          this.assertions.push({ detail: asString(d.detail), passed: asBool(d.passed) });
        }
        return;
      case "run_end": {
        const credits = asNumber(d.credits_consumed);
        if (credits !== null) {
          this.credits += credits;
          this.sawCredits = true;
        }
        if (d.status !== "passed" && this.failure === null) this.failure = this.readFailure(d);
        return;
      }
      case "test_md_evidence_ingest": {
        const id = asString(d.evidence_id);
        this.evidenceId = id !== null && UUID_RE.test(id) ? id.toLowerCase() : null;
        this.evidenceIngestStatus = asString(d.status);
        return;
      }
      case "test_md_summary": {
        const steps = isObject(d.steps) ? d.steps : {};
        const commit = isObject(d.commit) ? d.commit : {};
        const upload = isObject(d.upload) ? d.upload : {};
        this.summary = {
          overallStatus: asString(d.overall_status),
          durationS: asNumber(d.duration_s),
          stepsTotal: asNumber(steps.total),
          stepsPassed: asNumber(steps.passed),
          stepsFailed: asNumber(steps.failed),
          stepsSkipped: asNumber(steps.skipped),
          replayDecisions: asNumber(steps.replay_decisions),
          authorDecisions: asNumber(steps.author_decisions),
          uploadPerformed: asBool(upload.performed),
          uploadSucceeded: asBool(upload.succeeded),
          committed: asBool(commit.committed),
          cancelled: asBool(d.cancelled),
        };
        return;
      }
      case "test_md_done":
        this.done = {
          overallStatus: asString(d.overall_status),
          durationS: asNumber(d.duration_s),
          sessionId: asString(d.session_id),
        };
        return;
      default:
        if (!KNOWN_TYPES.has(line.type)) this.countUnknown(line.type);
    }
  }

  snapshot(): KaneStreamSnapshot {
    return {
      parserVersion: PARSER_VERSION,
      streamStarted: this.streamStarted,
      cliVersion: this.cliVersion,
      done: this.done,
      summary: this.summary,
      evidenceId: this.evidenceId,
      evidenceIngestStatus: this.evidenceIngestStatus,
      steps: [...this.steps.values()].sort((a, b) => a.index - b.index),
      assertions: [...this.assertions],
      failure: this.failure,
      creditsConsumed: this.sawCredits ? this.credits : null,
      eventCount: this.eventCount,
      malformedLineCount: this.malformed,
      unknownEventTypes: { ...this.unknown },
    };
  }

  private upsertStep(index: number, patch: Partial<KaneStepSummary>): void {
    const existing = this.steps.get(index);
    if (!existing && this.steps.size >= MAX_STEPS) return;
    this.steps.set(index, { index, heading: null, status: null, durationS: null, ...existing, ...patch });
  }

  private countUnknown(type: string): void {
    const key = type.slice(0, 80);
    if (key in this.unknown || Object.keys(this.unknown).length < MAX_UNKNOWN_TYPES) {
      this.unknown[key] = (this.unknown[key] ?? 0) + 1;
    }
  }

  private readFailure(d: Json): KaneFailure {
    const v = isObject(d.verdict) ? d.verdict : null;
    return {
      reason: asString(d.reason),
      reasonCode: asString(d.reason_code),
      resultCode: asNumber(d.result_code),
      summary: asString(d.summary),
      oneLiner: asString(d.one_liner),
      kaneVerdict: v
        ? {
            rootCause: asString(v.root_cause),
            suggestion: asString(v.suggestion),
            confidence: asNumber(v.confidence),
            family: asString(v.family),
            category: asString(v.category),
            severity: asString(v.severity),
          }
        : null,
    };
  }
}
