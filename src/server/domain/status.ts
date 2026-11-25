import type { CriterionStatus, RunStatus, StatusNote } from "./types";

/** Facts about a criterion's newest run that the status rule needs. */
export interface LatestRunFacts {
  status: RunStatus;
  /** Mapped test file recorded when the run was created. */
  testFile: string;
  /** SHA-256 of that file when the run was created. */
  testFileSha256: string | null;
  /** Expected behavior text recorded when the run was created. */
  expectedBehavior: string;
}

/** The criterion as it is now. */
export interface CurrentCriterionFacts {
  testFile: string;
  expectedBehavior: string;
  /** SHA-256 of the mapped file right now, or null if it is missing or unreadable. */
  currentTestFileSha256: string | null;
}

export interface DerivedStatus {
  status: CriterionStatus;
  note: StatusNote | null;
}

/**
 * Derives a criterion's status from its newest run (FR-004, FR-005). Nothing else can set it.
 *
 * VERIFIED requires ALL of: the newest run PASSED, and the test file, its content hash and the
 * expected behavior are still what that run used. Otherwise a stale pass would keep verifying a
 * criterion whose test or meaning has since changed, so it falls back to UNVERIFIED with a note.
 * The newest run decides, so a later cancel or runner failure also stops a criterion being VERIFIED.
 */
export function deriveCriterionStatus(latest: LatestRunFacts | null, current: CurrentCriterionFacts): DerivedStatus {
  if (latest === null) return { status: "UNVERIFIED", note: null };
  switch (latest.status) {
    case "QUEUED":
    case "RUNNING":
      return { status: "RUNNING", note: null };
    case "FAILED":
      return { status: "FAILED", note: null };
    case "NOT_STARTED":
      return { status: "BLOCKED", note: null };
    case "TIMED_OUT":
      return { status: "TIMED_OUT", note: null };
    case "CANCELED":
      return { status: "CANCELED", note: null };
    case "UNKNOWN":
      return { status: "UNKNOWN", note: null };
    case "PASSED":
      break;
  }
  if (latest.testFileSha256 === null) return { status: "UNVERIFIED", note: "NO_TEST_FILE_HASH" };
  if (latest.testFile !== current.testFile) return { status: "UNVERIFIED", note: "MAPPING_CHANGED" };
  if (latest.expectedBehavior !== current.expectedBehavior) return { status: "UNVERIFIED", note: "EXPECTED_BEHAVIOR_CHANGED" };
  if (current.currentTestFileSha256 === null) return { status: "UNVERIFIED", note: "TEST_FILE_MISSING" };
  if (current.currentTestFileSha256 !== latest.testFileSha256) return { status: "UNVERIFIED", note: "TEST_FILE_CHANGED" };
  return { status: "VERIFIED", note: null };
}
