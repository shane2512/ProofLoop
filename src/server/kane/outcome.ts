import "server-only";
import type { RunStatus } from "../domain/types";
import type { KaneStreamSnapshot } from "./parser";

export type RunnerErrorCode =
  | "SPAWN_FAILED"
  | "PROCESS_TIMEOUT"
  | "PROCESS_CANCELED"
  | "TEST_SPEC_INVALID_OR_NOT_STARTED"
  | "EXIT_NONZERO"
  | "OUTPUT_TRUNCATED"
  | "UNKNOWN_RUN_RESULT";

export interface ProcessFacts {
  /** Set when the process could not be started at all (sanitized error code such as ENOENT). */
  spawnError: string | null;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  canceled: boolean;
  /** True when a kill was requested but the process did not close within the confirmation window. */
  terminationUnconfirmed: boolean;
  stdoutTruncated: boolean;
  snapshot: KaneStreamSnapshot;
}

export interface Outcome {
  status: RunStatus;
  errorCode: RunnerErrorCode | null;
  /** One factual sentence. Never states a cause that was not observed. */
  summary: string;
}

/**
 * Maps observed process facts to a run status (FR-005, FR-011, PROC-003).
 *
 * Order matters: ProofLoop's own timeout/cancel flags come first because a forced kill exits 1,
 * which is indistinguishable from a failed test (docs/phase0-findings.md). PASSED requires BOTH exit
 * code 0 and a terminal `test_md_done` event reporting "passed". Anything that disagrees is UNKNOWN.
 */
export function classifyOutcome(f: ProcessFacts): Outcome {
  const { snapshot: s } = f;
  const doneStatus = s.done?.overallStatus ?? null;

  if (f.spawnError !== null) {
    return { status: "NOT_STARTED", errorCode: "SPAWN_FAILED", summary: `Kane could not be started (${f.spawnError}).` };
  }
  if (f.terminationUnconfirmed) {
    return {
      status: "UNKNOWN",
      errorCode: f.timedOut ? "PROCESS_TIMEOUT" : "PROCESS_CANCELED",
      summary: "Termination was requested but the process did not confirm it closed. The run may still be active.",
    };
  }
  if (f.timedOut) {
    return { status: "TIMED_OUT", errorCode: "PROCESS_TIMEOUT", summary: "The run exceeded the ProofLoop time limit and was stopped." };
  }
  if (f.canceled) {
    return { status: "CANCELED", errorCode: "PROCESS_CANCELED", summary: "The run was canceled by the user and stopped." };
  }
  if (f.signal !== null) {
    return { status: "UNKNOWN", errorCode: "UNKNOWN_RUN_RESULT", summary: `The process ended on signal ${f.signal} without a ProofLoop cancel or timeout.` };
  }

  const code = f.exitCode;
  if (code === 0) {
    if (doneStatus === "passed") {
      return { status: "PASSED", errorCode: null, summary: "Kane reported the test file passed and exited 0." };
    }
    if (doneStatus === null) {
      return { status: "UNKNOWN", errorCode: "UNKNOWN_RUN_RESULT", summary: "Exit code 0 but no terminal test_md_done event was received, so a pass cannot be confirmed." };
    }
    return { status: "UNKNOWN", errorCode: "UNKNOWN_RUN_RESULT", summary: `Exit code 0 but Kane reported overall status "${doneStatus}".` };
  }
  if (code === 1) {
    if (doneStatus === "failed") {
      return { status: "FAILED", errorCode: "EXIT_NONZERO", summary: "Kane reported the test file failed (exit 1)." };
    }
    return {
      status: "UNKNOWN",
      errorCode: "EXIT_NONZERO",
      summary: doneStatus === null ? "Exit code 1 without a terminal test_md_done event, so the cause is unknown." : `Exit code 1 but Kane reported overall status "${doneStatus}".`,
    };
  }
  if (code === 2) {
    return {
      status: "NOT_STARTED",
      errorCode: "TEST_SPEC_INVALID_OR_NOT_STARTED",
      summary: "Kane exited 2 before running the test (documented causes: parse error, missing file, auth error, Chrome launch failure). See stderr for the reason.",
    };
  }
  if (code === 3) {
    return { status: "UNKNOWN", errorCode: "UNKNOWN_RUN_RESULT", summary: "Kane exited 3 (documented as cancelled or timed out) without a ProofLoop cancel or timeout." };
  }
  if (code === null) {
    return { status: "UNKNOWN", errorCode: "UNKNOWN_RUN_RESULT", summary: "The process ended without an exit code." };
  }
  return { status: "UNKNOWN", errorCode: "EXIT_NONZERO", summary: `Kane exited with undocumented code ${code}.` };
}
