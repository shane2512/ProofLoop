import type { CriterionStatus, RunStatus } from "./types";

/**
 * Derives a criterion status from its newest run (FR-004, FR-005).
 *
 * Phase 2 placeholder rule: only the newest run is considered. Phase 4 adds the
 * rule that PASSED counts as VERIFIED only when the run is tied to a valid
 * mapping and snapshot. Until a run can be created by the API (Phase 3/4), no
 * criterion can leave UNVERIFIED through the public interface.
 */
export function deriveCriterionStatus(latest: RunStatus | null): CriterionStatus {
  switch (latest) {
    case null:
      return "UNVERIFIED";
    case "QUEUED":
    case "RUNNING":
      return "RUNNING";
    case "PASSED":
      return "VERIFIED";
    case "FAILED":
      return "FAILED";
    case "NOT_STARTED":
      return "BLOCKED";
    case "TIMED_OUT":
      return "TIMED_OUT";
    case "CANCELED":
      return "CANCELED";
    case "UNKNOWN":
      return "UNKNOWN";
  }
}
