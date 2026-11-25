import type { EvidenceRefDto, RunSummaryDto } from "../verification";
import type { ReportInput } from "./agent-feedback";
import { asKaneSnapshot, describeCommand } from "./common";

export const REPORT_SCHEMA_VERSION = 1;

/**
 * JSON export (FR-019). Fixed schema, version 1. Raw stdout and stderr are included only when the
 * caller asks for them (`includeOutput`); the default export carries none. Anything not recorded is
 * `null` with a reason, never a guess. Paths are relative to ProofLoop's own folders.
 */
export function buildJsonReport(input: ReportInput, events: Array<{ eventType: string | null }>, includeOutput: boolean) {
  const { run } = input;
  const kane = asKaneSnapshot(input.kane);
  const byType: Record<string, number> = {};
  for (const e of events) byType[e.eventType ?? "(none)"] = (byType[e.eventType ?? "(none)"] ?? 0) + 1;

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    kind: "proofloop.run-report",
    run: {
      id: run.id,
      status: run.status,
      exitCode: run.exitCode,
      exitCodeReason: run.exitCode === null ? "The process did not report an exit code." : null,
      signal: run.signal,
      timedOut: run.timedOut,
      canceled: run.canceled,
      errorCode: run.errorCode,
      summary: run.summary,
      durationMs: run.durationMs,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      stdoutTruncated: run.stdoutTruncated,
      stderrTruncated: run.stderrTruncated,
    },
    project: { name: run.criterionSnapshot.projectName, targetUrl: run.criterionSnapshot.targetUrl },
    criterion: {
      id: run.criterionId,
      title: run.criterionSnapshot.title,
      expectedBehavior: run.criterionSnapshot.expectedBehavior,
      stepLabel: run.criterionSnapshot.stepLabel,
      notes: run.criterionSnapshot.notes,
      testFile: run.criterionSnapshot.testFile,
    },
    kane: kane
      ? {
          observed: true,
          reason: null,
          cliVersion: kane.cliVersion,
          finalStatus: kane.done?.overallStatus ?? null,
          finalStatusReason: kane.done ? null : "Kane did not send a final result event.",
          summary: kane.summary,
          steps: kane.steps,
          assertions: kane.assertions,
          failure: kane.failure,
          creditsConsumed: kane.creditsConsumed,
          malformedLineCount: kane.malformedLineCount,
        }
      : { observed: false, reason: "No Kane output was recorded for this run." },
    eventsSummary: { total: events.length, byType },
    command: describeCommand(input.command),
    evidence: input.evidence.map((e) => ({
      id: e.id,
      kind: e.kind,
      label: e.label,
      source: e.source,
      available: e.available,
      relativePath: e.available ? e.relativePath : null,
      unavailableReason: e.available ? null : e.unavailableReason,
    })),
    output: includeOutput
      ? { included: true, stdout: input.stdout, stderr: input.stderr }
      : { included: false, reason: "Raw output is only exported when requested." },
  };
}

export interface RunFacts {
  id: string;
  status: string;
  exitCode: number | null;
  timedOut: boolean;
  canceled: boolean;
  errorCode: string | null;
  summary: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  kaneFinalStatus: string | null;
  stepsPassed: number | null;
  stepsFailed: number | null;
  expectedBehavior: string;
  testFile: string;
  evidence: Array<Pick<EvidenceRefDto, "id" | "label" | "available" | "relativePath" | "unavailableReason">>;
}

export function runFacts(run: RunSummaryDto, kaneRaw: unknown, evidence: EvidenceRefDto[]): RunFacts {
  const kane = asKaneSnapshot(kaneRaw);
  return {
    id: run.id,
    status: run.status,
    exitCode: run.exitCode,
    timedOut: run.timedOut,
    canceled: run.canceled,
    errorCode: run.errorCode,
    summary: run.summary,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    kaneFinalStatus: kane?.done?.overallStatus ?? null,
    stepsPassed: kane?.summary?.stepsPassed ?? null,
    stepsFailed: kane?.summary?.stepsFailed ?? null,
    expectedBehavior: run.criterionSnapshot.expectedBehavior,
    testFile: run.criterionSnapshot.testFile,
    evidence: evidence.map((e) => ({ id: e.id, label: e.label, available: e.available, relativePath: e.available ? e.relativePath : null, unavailableReason: e.available ? null : e.unavailableReason })),
  };
}

const COMPARED: Array<keyof RunFacts> = [
  "status",
  "exitCode",
  "timedOut",
  "canceled",
  "errorCode",
  "summary",
  "startedAt",
  "finishedAt",
  "durationMs",
  "kaneFinalStatus",
  "stepsPassed",
  "stepsFailed",
  "expectedBehavior",
  "testFile",
];

/**
 * Compares two recorded runs of the same criterion (FR-020). It lists which recorded fields differ and
 * the evidence each run has. It draws no conclusion about why the results differ.
 */
export function compareRuns(a: RunFacts, b: RunFacts) {
  const differences = COMPARED.filter((k) => a[k] !== b[k]).map((field) => ({ field, a: a[field], b: b[field] }));
  return {
    a,
    b,
    differences,
    note: "These are the recorded differences between two runs. ProofLoop does not infer what caused them.",
  };
}
