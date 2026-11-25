import type { CriterionStatus, RunStatus, StatusNote } from "./api-types";

export type Tone = "good" | "bad" | "warn" | "live" | "idle";

export interface StatusInfo {
  label: string;
  tone: Tone;
  /** One honest sentence about what the status means. */
  meaning: string;
}

/** Criterion statuses are derived by the server from the newest run. The UI never sets them. */
export const CRITERION_STATUS: Record<CriterionStatus, StatusInfo> = {
  UNVERIFIED: { label: "Unverified", tone: "idle", meaning: "No passing Kane run currently backs this criterion." },
  RUNNING: { label: "Running", tone: "live", meaning: "A Kane run is in progress. The result is not known yet." },
  VERIFIED: { label: "Verified", tone: "good", meaning: "The newest Kane run passed, and the test file, mapping and expected behavior are unchanged since." },
  FAILED: { label: "Failed", tone: "bad", meaning: "The newest Kane run reported that the test failed." },
  BLOCKED: { label: "Blocked", tone: "warn", meaning: "The newest run could not start, so nothing was verified." },
  TIMED_OUT: { label: "Timed out", tone: "warn", meaning: "The newest run was stopped at the time limit, so the result is not known." },
  CANCELED: { label: "Canceled", tone: "warn", meaning: "The newest run was canceled before it finished." },
  UNKNOWN: { label: "Unknown", tone: "warn", meaning: "The newest run ended without a clear result from Kane." },
};

export const RUN_STATUS: Record<RunStatus, StatusInfo> = {
  QUEUED: { label: "Queued", tone: "live", meaning: "The run is recorded and about to start." },
  RUNNING: { label: "Running", tone: "live", meaning: "Kane is running the test. The result is not known yet." },
  PASSED: { label: "Passed", tone: "good", meaning: "Kane exited cleanly and reported a passing result." },
  FAILED: { label: "Failed", tone: "bad", meaning: "Kane reported that the test failed." },
  NOT_STARTED: { label: "Not started", tone: "warn", meaning: "Kane could not start the test." },
  TIMED_OUT: { label: "Timed out", tone: "warn", meaning: "The run was stopped at the time limit." },
  CANCELED: { label: "Canceled", tone: "warn", meaning: "The run was canceled before it finished." },
  UNKNOWN: { label: "Unknown", tone: "warn", meaning: "The run ended without a clear result from Kane." },
};

export const STATUS_NOTE: Record<StatusNote, string> = {
  TEST_FILE_CHANGED: "The test file was edited after the last passing run, so that pass no longer counts. Run it again.",
  TEST_FILE_MISSING: "The mapped test file is missing, so the last passing run cannot be trusted.",
  MAPPING_CHANGED: "This criterion now points to a different test file than its last passing run used. Run it again.",
  EXPECTED_BEHAVIOR_CHANGED: "The expected behavior was edited after the last passing run, so that pass no longer counts. Run it again.",
  NO_TEST_FILE_HASH: "The last passing run did not record the test file contents, so it cannot be matched to the current file. Run it again.",
};

const ERROR_CODE_TEXT: Record<string, string> = {
  EXIT_NONZERO: "Kane exited with a failure code.",
  PROCESS_TIMEOUT: "The run exceeded the time limit.",
  PROCESS_CANCELED: "The run was canceled.",
  SPAWN_FAILED: "Kane could not be started.",
  UNKNOWN_RUN_RESULT: "Kane exited without reporting a final result.",
  PREREQUISITE_FAILED: "A prerequisite check failed before Kane started.",
  TEST_SPEC_INVALID: "Kane rejected the test file.",
  OUTPUT_TRUNCATED: "Output was cut at the size limit.",
  EVIDENCE_UNAVAILABLE: "No evidence files could be confirmed.",
  AUTH_REQUIRED: "Kane needs you to log in.",
};

export function describeErrorCode(code: string | null): string | null {
  if (!code) return null;
  return ERROR_CODE_TEXT[code] ?? code;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60)} s`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
