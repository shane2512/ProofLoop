"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { isActiveRun, type RunComparison, type RunFacts, type RunSummary } from "@/lib/api-types";
import { formatDuration, formatTime } from "@/lib/status";
import { ErrorNotice } from "./ErrorNotice";
import { useLoad } from "./useLoad";

const FIELD_LABEL: Record<keyof RunFacts, string> = {
  id: "Run",
  status: "Status",
  exitCode: "Exit code",
  timedOut: "Timed out",
  canceled: "Canceled",
  errorCode: "ProofLoop error code",
  summary: "Summary",
  createdAt: "Created",
  startedAt: "Started",
  finishedAt: "Finished",
  durationMs: "Duration",
  kaneFinalStatus: "Kane's final result",
  stepsPassed: "Steps passed",
  stepsFailed: "Steps failed",
  expectedBehavior: "Expected behavior (as run)",
  testFile: "Test file (as run)",
  evidence: "Evidence",
};

function show(field: keyof RunFacts, v: unknown): string {
  if (v === null || v === undefined) return "Not recorded";
  if (field === "durationMs") return formatDuration(v as number);
  if (field === "startedAt" || field === "finishedAt") return formatTime(v as string);
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

/** Two recorded runs of one criterion side by side. It lists differences and draws no conclusion. */
export function CompareSection({ run }: { run: RunSummary }) {
  const others = useLoad((signal) => api.listRuns(run.projectId, { criterionId: run.criterionId, limit: 25 }, signal), `cmp:${run.criterionId}`);
  const [otherId, setOtherId] = useState("");
  const [result, setResult] = useState<{ state: "idle" } | { state: "loading" } | { state: "ok"; data: RunComparison } | { state: "error"; error: unknown }>({ state: "idle" });

  const choices = (others.data?.runs ?? []).filter((r) => r.id !== run.id && !isActiveRun(r.status));

  useEffect(() => {
    if (!otherId) return;
    const other = choices.find((r) => r.id === otherId);
    if (!other) return;
    // The earlier run is "a" so the table always reads before and after.
    const [first, second] = other.createdAt <= run.createdAt ? [other, run] : [run, other];
    const controller = new AbortController();
    setResult({ state: "loading" });
    api
      .compareRuns(first.id, second.id, controller.signal)
      .then((data) => setResult({ state: "ok", data }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setResult({ state: "error", error });
      });
    return () => controller.abort();
    // `choices` is derived from `others.data`, which is stable between renders unless it reloads.
  }, [otherId, run.id, run.createdAt, others.data]);

  if (others.error) return <ErrorNotice error={others.error} onRetry={others.reload} />;
  if (others.data && choices.length === 0) {
    return <p className="ws-note">There is no other finished run of this criterion to compare with yet.</p>;
  }

  return (
    <section aria-labelledby={`cmp-${run.id}`}>
      <h3 id={`cmp-${run.id}`} className="ws-h3">
        Compare with another run
      </h3>
      <div className="ws-field">
        <label htmlFor={`cmp-sel-${run.id}`}>Other run of this criterion</label>
        <select id={`cmp-sel-${run.id}`} value={otherId} onChange={(e) => setOtherId(e.target.value)} disabled={!others.data}>
          <option value="">Choose a run</option>
          {choices.map((r) => (
            <option key={r.id} value={r.id}>
              {formatTime(r.startedAt ?? r.createdAt)} · {r.status}
            </option>
          ))}
        </select>
      </div>
      {result.state === "loading" ? <p className="ws-note">Comparing...</p> : null}
      {result.state === "error" ? <ErrorNotice error={result.error} /> : null}
      {result.state === "ok" ? <ComparisonTable data={result.data} /> : null}
    </section>
  );
}

function ComparisonTable({ data }: { data: RunComparison }) {
  const rows: Array<keyof RunFacts> = ["status", "kaneFinalStatus", "exitCode", "startedAt", "durationMs", "stepsPassed", "stepsFailed", "summary"];
  const changed = new Set(data.differences.map((d) => d.field));
  const ev = (r: RunFacts) => (r.evidence.length === 0 ? "None recorded" : r.evidence.map((e) => (e.available ? `${e.label}: available` : `${e.label}: not available`)).join("; "));
  return (
    <div className="ws-compare" role="region" aria-label="Run comparison" data-lenis-prevent>
      <table>
        <thead>
          <tr>
            <th scope="col">Recorded field</th>
            <th scope="col">Earlier run</th>
            <th scope="col">Later run</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f} data-changed={changed.has(f)}>
              <th scope="row">
                {FIELD_LABEL[f]}
                {changed.has(f) ? <span className="sr-only"> (differs)</span> : null}
              </th>
              <td data-label="Earlier run">{show(f, data.a[f])}</td>
              <td data-label="Later run">{show(f, data.b[f])}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">Evidence</th>
            <td data-label="Earlier run">{ev(data.a)}</td>
            <td data-label="Later run">{ev(data.b)}</td>
          </tr>
        </tbody>
      </table>
      {changed.has("expectedBehavior") || changed.has("testFile") ? (
        <p className="ws-note ws-note-warn">The expected behavior or test file was different when these runs were made, so they did not check exactly the same thing.</p>
      ) : null}
      <p className="ws-note">{data.note}</p>
    </div>
  );
}
