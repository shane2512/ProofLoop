"use client";

import { useEffect, useRef, useState } from "react";
import { api, describeApiError } from "@/lib/api-client";
import { evidenceUrl, isActiveRun, type KaneSnapshot, type RunDetail } from "@/lib/api-types";
import { describeErrorCode, formatDuration, formatTime, RUN_STATUS } from "@/lib/status";
import { ErrorNotice } from "./ErrorNotice";
import { CompareSection } from "./CompareSection";
import { CommandDisclosure, EventsDisclosure, OutputDisclosure } from "./RawOutput";
import { ReportSection } from "./ReportSection";
import { StatusBadge } from "./StatusBadge";
import { useRunDetail } from "./useRunDetail";

interface Props {
  runId: string;
  /** True for a run this page just started. */
  startedHere?: boolean;
  /** Called once when a watched run finishes, so the page can re-read criteria and history. */
  onSettled: (detail: RunDetail) => void;
  onClose: () => void;
}

export function RunPanel({ runId, startedHere = false, onSettled, onClose }: Props) {
  const { detail, error, loading, refresh } = useRunDetail(runId, onSettled, startedHere);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the run so keyboard and screen-reader users land on the result they asked for.
  useEffect(() => {
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView?.({ block: "nearest" });
  }, []);
  const [cancelState, setCancelState] = useState<{ kind: "idle" } | { kind: "asked" } | { kind: "error"; error: unknown }>({ kind: "idle" });

  async function cancel() {
    try {
      await api.cancelRun(runId);
      setCancelState({ kind: "asked" });
      refresh();
    } catch (err) {
      setCancelState({ kind: "error", error: err });
    }
  }

  const run = detail?.run;
  const active = run ? isActiveRun(run.status) : false;

  return (
    <section className="ws-panel ws-run" aria-labelledby="ws-run-title">
      <div className="ws-run-head">
        <h2 id="ws-run-title" className="ws-h2" tabIndex={-1} ref={headingRef}>
          Run
        </h2>
        <button type="button" className="ws-btn ws-btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      {loading && !detail ? <p className="ws-note">Reading the run record...</p> : null}
      {error && !detail ? <ErrorNotice error={error} onRetry={refresh} /> : null}
      {error && detail ? (
        <div className="ws-notice ws-notice-warn" role="alert">
          <p className="ws-notice-title">Lost contact with ProofLoop.</p>
          <p className="ws-notice-body">
            {describeApiError(error).title} The numbers below are the last record received. The run may still be going, and ProofLoop keeps retrying.
          </p>
        </div>
      ) : null}

      {detail && run ? (
        <>
          <div className="ws-run-status" role="status">
            <StatusBadge kind="run" status={run.status} />
            <p>{RUN_STATUS[run.status].meaning}</p>
          </div>

          {active ? (
            <div className="ws-notice">
              <p className="ws-notice-title">{run.status === "QUEUED" ? "Starting Kane." : "Kane is running the test."}</p>
              <p className="ws-notice-body">
                This can take a minute or more. ProofLoop shows the result only after Kane finishes. Nothing here is a pass until then.
              </p>
              {cancelState.kind === "asked" ? (
                <p className="ws-notice-body">Cancel requested. The run is marked canceled only once the process has actually stopped.</p>
              ) : (
                <button type="button" className="ws-btn ws-btn-danger" onClick={cancel}>
                  Cancel run
                </button>
              )}
              {cancelState.kind === "error" ? <ErrorNotice error={cancelState.error} /> : null}
            </div>
          ) : null}

          <dl className="ws-meta">
            <div>
              <dt>Started</dt>
              <dd>{formatTime(run.startedAt ?? run.createdAt)}</dd>
            </div>
            <div>
              <dt>Finished</dt>
              <dd>{formatTime(run.finishedAt)}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{formatDuration(run.durationMs)}</dd>
            </div>
            <div>
              <dt>Exit code</dt>
              <dd>{run.exitCode ?? "-"}</dd>
            </div>
          </dl>

          {run.summary ? <p className="ws-run-summary">{run.summary}</p> : null}
          {run.errorCode ? (
            <p className="ws-note">
              ProofLoop code <code>{run.errorCode}</code>: {describeErrorCode(run.errorCode)}
            </p>
          ) : null}

          <h3 className="ws-h3">What was run</h3>
          <dl className="ws-meta ws-meta-wide">
            <div>
              <dt>Criterion</dt>
              <dd>{run.criterionSnapshot.title}</dd>
            </div>
            <div>
              <dt>Expected behavior</dt>
              <dd>{run.criterionSnapshot.expectedBehavior}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{run.criterionSnapshot.targetUrl}</dd>
            </div>
            <div>
              <dt>Test file</dt>
              <dd>{run.criterionSnapshot.testFile}</dd>
            </div>
          </dl>
          <p className="ws-note">This is a copy taken when the run started. Editing the criterion later does not change it.</p>

          {detail.kane ? <KaneSection kane={detail.kane} /> : null}

          <h3 className="ws-h3">Evidence</h3>
          <EvidenceSection detail={detail} active={active} />

          {!active ? <ReportSection runId={run.id} /> : null}
          {!active ? <CompareSection run={run} /> : null}

          <h3 className="ws-h3">Raw record</h3>
          <OutputDisclosure runId={run.id} stream="stdout" truncated={run.stdoutTruncated} finished={!active} />
          <OutputDisclosure runId={run.id} stream="stderr" truncated={run.stderrTruncated} finished={!active} />
          <EventsDisclosure events={detail.events} />
          <CommandDisclosure command={detail.command} />
        </>
      ) : null}
    </section>
  );
}

function EvidenceSection({ detail, active }: { detail: RunDetail; active: boolean }) {
  const runId = detail.run.id;
  if (active) return <p className="ws-note">Evidence is looked for after the run finishes.</p>;
  if (detail.evidence.length === 0) {
    return <p className="ws-note">No evidence was recorded for this run. ProofLoop only lists files it confirmed exist.</p>;
  }
  return (
    <ul className="ws-evidence">
      {detail.evidence.map((e) => (
        <li key={e.id} data-available={e.available}>
          <span className="ws-evidence-state">{e.available ? "Available" : "Unavailable"}</span>
          <span className="ws-evidence-label">{e.label}</span>
          {e.available && e.relativePath ? <span className="ws-evidence-path">Saved in ProofLoop&apos;s data folder: {e.relativePath}</span> : null}
          {e.available ? (
            <a className="ws-link-btn" href={evidenceUrl(runId, e.id)} download aria-label={`Download ${e.label}`}>
              Download this file
            </a>
          ) : null}
          {!e.available && e.unavailableReason ? <span className="ws-evidence-path">{e.unavailableReason}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function KaneSection({ kane }: { kane: KaneSnapshot }) {
  const s = kane.summary;
  return (
    <>
      <h3 className="ws-h3">What Kane reported</h3>
      {kane.done ? (
        <p className="ws-note">
          Final result from Kane: <strong>{kane.done.overallStatus ?? "not stated"}</strong>
          {kane.cliVersion ? ` (kane-cli ${kane.cliVersion})` : ""}.
        </p>
      ) : (
        <p className="ws-note ws-note-warn">Kane did not send a final result event.</p>
      )}
      {s ? (
        <dl className="ws-meta">
          <div>
            <dt>Steps passed</dt>
            <dd>{s.stepsPassed ?? "-"}</dd>
          </div>
          <div>
            <dt>Steps failed</dt>
            <dd>{s.stepsFailed ?? "-"}</dd>
          </div>
          <div>
            <dt>Steps skipped</dt>
            <dd>{s.stepsSkipped ?? "-"}</dd>
          </div>
          <div>
            <dt>Credits used</dt>
            <dd>{kane.creditsConsumed ?? "-"}</dd>
          </div>
        </dl>
      ) : null}
      {s?.uploadPerformed ? (
        <p className="ws-note">Kane uploaded this run to your TestMu Test Manager{s.uploadSucceeded === false ? ", but reported that the upload did not succeed" : ""}.</p>
      ) : null}

      {kane.steps.length > 0 ? (
        <>
          <h4 className="ws-h4">Steps</h4>
          <ol className="ws-steps">
            {kane.steps.map((st) => (
              <li key={st.index} data-step-status={st.status ?? "unknown"}>
                <span className="ws-step-status">{st.status ?? "unknown"}</span>
                <span>{st.heading ?? `Step ${st.index}`}</span>
                {st.durationS !== null ? <span className="ws-step-time">{st.durationS} s</span> : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {kane.assertions.length > 0 ? (
        <>
          <h4 className="ws-h4">Assertions</h4>
          <ul className="ws-steps">
            {kane.assertions.map((a, i) => (
              <li key={i} data-step-status={a.passed === null ? "unknown" : a.passed ? "passed" : "failed"}>
                <span className="ws-step-status">{a.passed === null ? "unknown" : a.passed ? "passed" : "failed"}</span>
                <span>{a.detail ?? "(no detail)"}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {kane.failure ? (
        <div className="ws-notice ws-notice-error">
          <p className="ws-notice-title">Kane&apos;s diagnosis (not ProofLoop&apos;s)</p>
          <p className="ws-notice-body">ProofLoop shows this as Kane reported it. It has not checked the cause.</p>
          <dl className="ws-meta ws-meta-wide">
            {kane.failure.reason ? (
              <div>
                <dt>Reason</dt>
                <dd>{kane.failure.reason}</dd>
              </div>
            ) : null}
            {kane.failure.summary ? (
              <div>
                <dt>Summary</dt>
                <dd>{kane.failure.summary}</dd>
              </div>
            ) : null}
            {kane.failure.oneLiner ? (
              <div>
                <dt>One line</dt>
                <dd>{kane.failure.oneLiner}</dd>
              </div>
            ) : null}
            {kane.failure.kaneVerdict?.rootCause ? (
              <div>
                <dt>Likely cause, per Kane</dt>
                <dd>{kane.failure.kaneVerdict.rootCause}</dd>
              </div>
            ) : null}
            {kane.failure.kaneVerdict?.suggestion ? (
              <div>
                <dt>Suggestion, per Kane</dt>
                <dd>{kane.failure.kaneVerdict.suggestion}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </>
  );
}
