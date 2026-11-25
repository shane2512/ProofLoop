"use client";

import type { Criterion } from "@/lib/api-types";
import { CRITERION_STATUS, STATUS_NOTE } from "@/lib/status";
import { StatusBadge } from "./StatusBadge";

interface Props {
  criterion: Criterion;
  /** Another run is active, so a new one cannot start. */
  runnerBusy: boolean;
  onRun: (c: Criterion) => void;
  onEdit: (c: Criterion) => void;
  onDelete: (c: Criterion) => void;
  onViewRun: (runId: string) => void;
}

export function CriterionCard({ criterion: c, runnerBusy, onRun, onEdit, onDelete, onViewRun }: Props) {
  const fileName = c.testFile.split("/").pop() ?? c.testFile;
  const running = c.status === "RUNNING";
  return (
    <li className="ws-criterion" data-status={c.status}>
      <div className="ws-criterion-head">
        <h3 className="ws-criterion-title">{c.title}</h3>
        <StatusBadge kind="criterion" status={c.status} />
      </div>
      <p className="ws-criterion-expected">{c.expectedBehavior}</p>
      {c.statusNote ? <p className="ws-note ws-note-warn">{STATUS_NOTE[c.statusNote]}</p> : <p className="ws-note">{CRITERION_STATUS[c.status].meaning}</p>}
      <p className="ws-criterion-file">
        Test file <code>{fileName}</code>
        {c.stepLabel ? <> · step: {c.stepLabel}</> : null}
      </p>
      <div className="ws-actions ws-actions-tight">
        <button
          type="button"
          className="ws-btn ws-btn-primary"
          onClick={() => onRun(c)}
          disabled={runnerBusy}
          aria-label={`Run with Kane: ${c.title}`}
          title={runnerBusy ? "Another run is in progress. ProofLoop runs one at a time." : undefined}
        >
          {running ? "Running..." : "Run with Kane"}
        </button>
        {c.lastRunId ? (
          <button type="button" className="ws-btn ws-btn-ghost" aria-label={`Latest run: ${c.title}`} onClick={() => onViewRun(c.lastRunId as string)}>
            Latest run
          </button>
        ) : null}
        <button type="button" className="ws-btn ws-btn-ghost" aria-label={`Edit: ${c.title}`} onClick={() => onEdit(c)}>
          Edit
        </button>
        <button type="button" className="ws-btn ws-btn-ghost" aria-label={`Delete: ${c.title}`} onClick={() => onDelete(c)}>
          Delete
        </button>
      </div>
    </li>
  );
}
