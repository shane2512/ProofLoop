"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { isActiveRun, type RunDetail } from "@/lib/api-types";

export const POLL_ACTIVE_MS = 1500;
export const POLL_RETRY_MS = 3000;

export interface RunDetailState {
  detail: RunDetail | null;
  /** The most recent failure to read the run. Cleared by the next successful read. */
  error: unknown;
  loading: boolean;
  refresh: () => void;
}

/**
 * Reads one run and keeps reading it while it is queued or running. Each read is the server's record;
 * nothing is predicted. If a read fails the last record stays on screen, the error is shown, and polling
 * continues. `onSettled` fires once when a run this hook watched becomes complete.
 * Pass `startedHere` for a run this page just started, so a run that finishes between two reads still settles.
 */
export function useRunDetail(runId: string, onSettled?: (detail: RunDetail) => void, startedHere = false): RunDetailState {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  });

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let sawActive = startedHere;

    async function read() {
      let next = 0;
      try {
        const d = await api.getRun(runId, controller.signal);
        if (!live) return;
        setDetail(d);
        setError(null);
        setLoading(false);
        if (isActiveRun(d.run.status)) {
          sawActive = true;
          next = POLL_ACTIVE_MS;
        } else if (sawActive) {
          sawActive = false;
          settledRef.current?.(d);
        }
      } catch (err) {
        if (!live || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err);
        setLoading(false);
        // A missing run will not appear by waiting. Anything else may be a brief outage.
        if (!(err instanceof ApiError && err.status === 404)) next = POLL_RETRY_MS;
      }
      if (live && next > 0) timer = setTimeout(read, next);
    }
    void read();

    return () => {
      live = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
    // `startedHere` is read once per watched run. Mount this hook with `key={runId}` to watch another run.
  }, [runId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { detail, error, loading, refresh };
}
