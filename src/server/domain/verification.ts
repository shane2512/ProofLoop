import type { RunStatus } from "./types";

export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ["QUEUED", "RUNNING"];

/**
 * Allowed run state transitions. A run only ever moves forward, and a completed run never changes
 * (the database also enforces the second rule with a trigger).
 *
 *   QUEUED  -> RUNNING | NOT_STARTED | CANCELED | UNKNOWN
 *   RUNNING -> PASSED | FAILED | NOT_STARTED | TIMED_OUT | CANCELED | UNKNOWN
 */
const ALLOWED: Record<RunStatus, readonly RunStatus[]> = {
  QUEUED: ["RUNNING", "NOT_STARTED", "CANCELED", "UNKNOWN"],
  RUNNING: ["PASSED", "FAILED", "NOT_STARTED", "TIMED_OUT", "CANCELED", "UNKNOWN"],
  PASSED: [],
  FAILED: [],
  NOT_STARTED: [],
  TIMED_OUT: [],
  CANCELED: [],
  UNKNOWN: [],
};

export function isActiveRunStatus(status: RunStatus): boolean {
  return ACTIVE_RUN_STATUSES.includes(status);
}

export function isCompletedRunStatus(status: RunStatus): boolean {
  return !isActiveRunStatus(status);
}

/** Writing the same active status again (to record a field) is allowed; completed runs never change. */
export function canTransition(from: RunStatus, to: RunStatus): boolean {
  if (from === to) return isActiveRunStatus(from);
  return ALLOWED[from].includes(to);
}
