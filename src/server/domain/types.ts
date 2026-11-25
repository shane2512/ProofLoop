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
