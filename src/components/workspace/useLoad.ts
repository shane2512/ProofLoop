"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface LoadState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads data once per `key` and again whenever `reload()` is called.
 * A reload keeps the previous data on screen, so lists do not flash empty.
 */
export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, key: string): LoadState<T> {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    loadRef
      .current(controller.signal)
      .then((data) => {
        if (live) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!live || (error instanceof DOMException && error.name === "AbortError")) return;
        setState((s) => ({ data: s.data, error, loading: false }));
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [key, tick]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, error: null, loading: true }));
    setTick((t) => t + 1);
  }, []);

  return { ...state, reload };
}
