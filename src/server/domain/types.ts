export interface Project {
  id: string;
  name: string;
  targetUrl: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type RunStatus =
  | "QUEUED"
  | "RUNNING"
  | "PASSED"
  | "FAILED"
  | "NOT_STARTED"
  | "TIMED_OUT"
  | "CANCELED"
  | "UNKNOWN";

export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = [
  "PASSED",
  "FAILED",
  "NOT_STARTED",
  "TIMED_OUT",
  "CANCELED",
  "UNKNOWN",
];

export type CriterionStatus =
  | "UNVERIFIED"
  | "RUNNING"
  | "VERIFIED"
  | "FAILED"
  | "BLOCKED"
  | "TIMED_OUT"
  | "CANCELED"
  | "UNKNOWN";

/** Why a passing run no longer counts toward VERIFIED. */
export type StatusNote =
  | "TEST_FILE_CHANGED"
  | "TEST_FILE_MISSING"
  | "MAPPING_CHANGED"
  | "EXPECTED_BEHAVIOR_CHANGED"
  | "NO_TEST_FILE_HASH";

export interface Criterion {
  id: string;
  projectId: string;
  title: string;
  expectedBehavior: string;
  notes: string | null;
  testFile: string;
  stepLabel: string | null;
  position: number;
  /** Derived from the latest run. Never stored or set manually (FR-004). */
  status: CriterionStatus;
  /** Set when the newest run passed but the criterion or its test changed afterwards. */
  statusNote: StatusNote | null;
  lastRunId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Copy of the criterion and project context at run time. Immutable (FR-014). */
export interface CriterionSnapshot {
  projectName: string;
  targetUrl: string;
  title: string;
  expectedBehavior: string;
  notes: string | null;
  testFile: string;
  stepLabel: string | null;
}

export interface Run {
  id: string;
  projectId: string;
  criterionId: string;
  criterionSnapshot: CriterionSnapshot;
  testFileSnapshot: string;
  status: RunStatus;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  canceled: boolean;
  summary: string | null;
  rawStdoutPath: string | null;
  rawStderrPath: string | null;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  parserVersion: string | null;
  createdAt: string;
  /** SHA-256 of the mapped _test.md when the run was created. Immutable. */
  testFileSha256: string | null;
  errorCode: string | null;
  /** Redacted argv that was executed. */
  commandRedacted: string[] | null;
  /** Bounded Kane stream summary (parser output). Shape is owned by the Kane parser. */
  kaneResult: unknown;
}

export interface EvidenceRef {
  id: string;
  runId: string;
  kind: "EVIDENCE_PACK" | "SCREENSHOT" | "RECORDING" | "OTHER";
  relativePath: string | null;
  label: string;
  source: string;
  available: boolean;
  unavailableReason: string | null;
  createdAt: string;
}

export interface RunEvent {
  id: string;
  runId: string;
  sequence: number;
  eventType: string | null;
  rawLine: string;
  parsedJson: string | null;
  createdAt: string;
}
