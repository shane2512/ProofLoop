/**
 * Types for the local ProofLoop API (`/api/v1`), as the browser sees it.
 *
 * These are declared separately from the server types so client code never imports server code.
 * `tests/api-types-compat.test.ts` checks at compile time that they stay in step with the server.
 */

export interface Project {
  id: string;
  name: string;
  targetUrl: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type CriterionStatus = "UNVERIFIED" | "RUNNING" | "VERIFIED" | "FAILED" | "BLOCKED" | "TIMED_OUT" | "CANCELED" | "UNKNOWN";

export type StatusNote = "TEST_FILE_CHANGED" | "TEST_FILE_MISSING" | "MAPPING_CHANGED" | "EXPECTED_BEHAVIOR_CHANGED" | "NO_TEST_FILE_HASH";

export interface Criterion {
  id: string;
  projectId: string;
  title: string;
  expectedBehavior: string;
  notes: string | null;
  testFile: string;
  stepLabel: string | null;
  position: number;
  status: CriterionStatus;
  statusNote: StatusNote | null;
  lastRunId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type RunStatus = "QUEUED" | "RUNNING" | "PASSED" | "FAILED" | "NOT_STARTED" | "TIMED_OUT" | "CANCELED" | "UNKNOWN";

export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ["QUEUED", "RUNNING"];

export function isActiveRun(status: RunStatus): boolean {
  return status === "QUEUED" || status === "RUNNING";
}

export interface CriterionSnapshot {
  projectName: string;
  targetUrl: string;
  title: string;
  expectedBehavior: string;
  notes: string | null;
  testFile: string;
  stepLabel: string | null;
}

export interface RunSummary {
  id: string;
  projectId: string;
  criterionId: string;
  criterionSnapshot: CriterionSnapshot;
  status: RunStatus;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  canceled: boolean;
  summary: string | null;
  errorCode: string | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  evidenceAvailable: boolean;
  createdAt: string;
}

export interface RunEvent {
  sequence: number;
  eventType: string | null;
  rawLine: string;
  createdAt: string;
}

export interface EvidenceRef {
  id: string;
  kind: "EVIDENCE_PACK" | "SCREENSHOT" | "RECORDING" | "OTHER";
  label: string;
  available: boolean;
  source: string;
  relativePath: string | null;
  unavailableReason: string | null;
}

export interface KaneStep {
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

/** Bounded summary of Kane's stream. Absent (null) for a run that never produced one. */
export interface KaneSnapshot {
  parserVersion: string;
  streamStarted: boolean;
  cliVersion: string | null;
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
  steps: KaneStep[];
  assertions: KaneAssertion[];
  failure: KaneFailure | null;
  creditsConsumed: number | null;
  eventCount: number;
  malformedLineCount: number;
  unknownEventTypes: Record<string, number>;
}

export interface RunDetail {
  run: RunSummary;
  events: RunEvent[];
  evidence: EvidenceRef[];
  /** Null for a run that never started a process. */
  kane: KaneSnapshot | null;
  command: string[] | null;
}

export interface RunPage {
  runs: RunSummary[];
  nextCursor: string | null;
}

export interface TestFileEntry {
  name: string;
  testFile: string;
  sizeBytes: number;
  modifiedAt: string;
}

export type TestFileContent = TestFileEntry & { content: string };

export interface ProjectInput {
  name: string;
  targetUrl: string;
  notes?: string | null;
}

export interface CriterionInput {
  title: string;
  expectedBehavior: string;
  notes?: string | null;
  testFile: string;
  stepLabel?: string | null;
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
  evidence: Array<Pick<EvidenceRef, "id" | "label" | "available" | "relativePath" | "unavailableReason">>;
}

export interface RunComparison {
  a: RunFacts;
  b: RunFacts;
  differences: Array<{ field: keyof RunFacts; a: unknown; b: unknown }>;
  note: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

/** Download URLs. Plain links: the browser saves the file, nothing is sent anywhere. */
export const reportUrl = (runId: string, format: "markdown" | "json", includeOutput = false) =>
  `/api/v1/runs/${encodeURIComponent(runId)}/report?format=${format}${includeOutput ? "&includeOutput=true" : ""}`;
export const evidenceUrl = (runId: string, evidenceId: string) => `/api/v1/runs/${encodeURIComponent(runId)}/evidence/${encodeURIComponent(evidenceId)}`;

/** The number of criteria at which a project is ready to judge (requirements section 5). */
export const MIN_READY_CRITERIA = 3;
export const MAX_CRITERIA = 5;
