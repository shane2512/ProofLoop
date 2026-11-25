"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import type { RunPage, RunSummary } from "@/lib/api-types";
import { formatDuration, formatTime } from "@/lib/status";
import { ErrorNotice } from "./ErrorNotice";
import { StatusBadge } from "./StatusBadge";
import { useLoad } from "./useLoad";

const PAGE_SIZE = 10;

interface Props {
  projectId: string;
  /** Changes whenever a run starts or finishes, to re-read the first page. */
  refreshKey: number;
  selectedRunId: string | null;
  onSelect: (run: RunSummary) => void;
}

/** Every run for the project, newest first. Runs are never edited or removed. */
export function RunHistory({ projectId, refreshKey, selectedRunId, onSelect }: Props) {
  const first = useLoad((signal) => api.listRuns(projectId, { limit: PAGE_SIZE }, signal), `${projectId}:${refreshKey}`);
  const [more, setMore] = useState<{ base: RunPage; runs: RunSummary[]; cursor: string | null } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);

  const page = first.data;
  const extra = more && more.base === page ? more : null;
  const runs = page ? [...page.runs, ...(extra?.runs ?? [])] : [];
  const cursor = page ? (extra ? extra.cursor : page.nextCursor) : null;

  async function loadMore() {
    if (!page || !cursor || moreBusy) return;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const next = await api.listRuns(projectId, { limit: PAGE_SIZE, cursor });
      setMore({ base: page, runs: [...(extra?.runs ?? []), ...next.runs], cursor: next.nextCursor });
    } catch (err) {
      setMoreError(err);
    } finally {
      setMoreBusy(false);
    }
  }

  return (
    <section className="ws-panel" aria-labelledby="ws-history-title">
      <h2 id="ws-history-title" className="ws-h2">
        Run history
      </h2>
      {first.error && !page ? <ErrorNotice error={first.error} onRetry={first.reload} /> : null}
      {first.loading && !page && !first.error ? <div className="ws-skeleton" aria-busy="true" aria-label="Loading run history" /> : null}
      {page && runs.length === 0 ? (
        <div className="ws-empty">
          <p className="ws-empty-title">No runs yet.</p>
          <p>Every run you start is kept here, including failed and canceled ones.</p>
        </div>
      ) : null}
      {runs.length > 0 ? (
        <ul className="ws-history">
          {runs.map((r) => (
            <li key={r.id}>
              <button type="button" className="ws-history-row" aria-pressed={r.id === selectedRunId} onClick={() => onSelect(r)}>
                <StatusBadge kind="run" status={r.status} />
                <span className="ws-history-title">{r.criterionSnapshot.title}</span>
                <span className="ws-history-meta">
                  {formatTime(r.startedAt ?? r.createdAt)} · {formatDuration(r.durationMs)}
                  {r.evidenceAvailable ? " · evidence saved" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {first.error && page ? <ErrorNotice error={first.error} onRetry={first.reload} /> : null}
      {moreError ? <ErrorNotice error={moreError} onRetry={loadMore} /> : null}
      {cursor ? (
        <button type="button" className="ws-btn ws-btn-ghost" onClick={loadMore} disabled={moreBusy}>
          {moreBusy ? "Loading..." : "Load older runs"}
        </button>
      ) : null}
    </section>
  );
}
