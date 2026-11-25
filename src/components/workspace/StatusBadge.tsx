import type { CriterionStatus, RunStatus } from "@/lib/api-types";
import { CRITERION_STATUS, RUN_STATUS } from "@/lib/status";

/**
 * A status label. Colour is never the only signal: the text is always shown, and the tone is
 * exposed as a data attribute for styling. The `title` carries the plain-language meaning.
 */
export function StatusBadge({ kind, status }: { kind: "criterion"; status: CriterionStatus } | { kind: "run"; status: RunStatus }) {
  const info = kind === "criterion" ? CRITERION_STATUS[status as CriterionStatus] : RUN_STATUS[status as RunStatus];
  return (
    <span className="ws-badge" data-tone={info.tone} data-status={status} title={info.meaning}>
      <span className="ws-badge-dot" aria-hidden="true" />
      {info.label}
    </span>
  );
}
