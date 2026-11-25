"use client";

import { useEffect, useState } from "react";
import { api, describeApiError } from "@/lib/api-client";
import type { RunEvent } from "@/lib/api-types";

const MAX_SHOWN_CHARS = 200_000;

type State = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; text: string } | { kind: "unavailable"; message: string } | { kind: "error"; message: string };

/** Saved stdout or stderr, fetched only when the person opens it. */
export function OutputDisclosure({ runId, stream, truncated, finished }: { runId: string; stream: "stdout" | "stderr"; truncated: boolean; finished: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !finished) return;
    const controller = new AbortController();
    let live = true;
    setState({ kind: "loading" });
    api
      .getRunOutput(runId, stream, controller.signal)
      .then((text) => live && setState({ kind: "ready", text }))
      .catch((err: unknown) => {
        if (!live || (err instanceof DOMException && err.name === "AbortError")) return;
        const code = (err as { code?: string }).code;
        const message = describeApiError(err).title;
        setState(code === "OUTPUT_UNAVAILABLE" ? { kind: "unavailable", message } : { kind: "error", message });
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [open, finished, runId, stream, attempt]);

  return (
    <details className="ws-disclosure" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Raw {stream}</summary>
      <div className="ws-disclosure-body">
        {!finished ? <p className="ws-note">Output is saved when the run finishes.</p> : null}
        {finished && state.kind === "loading" ? <p className="ws-note">Loading...</p> : null}
        {state.kind === "unavailable" ? <p className="ws-note">{state.message}</p> : null}
        {state.kind === "error" ? (
          <p className="ws-note ws-note-warn" role="alert">
            {state.message}{" "}
            <button type="button" className="ws-link-btn" onClick={() => setAttempt((a) => a + 1)}>
              Retry
            </button>
          </p>
        ) : null}
        {state.kind === "ready" ? (
          <>
            {truncated ? <p className="ws-note ws-note-warn">ProofLoop stopped saving this stream at its size limit. What follows is the saved part.</p> : null}
            {state.text.length === 0 ? (
              <p className="ws-note">This stream was empty.</p>
            ) : (
              <>
                <pre className="ws-pre" data-lenis-prevent tabIndex={0} aria-label={`Raw ${stream}`}>
                  {state.text.length > MAX_SHOWN_CHARS ? state.text.slice(0, MAX_SHOWN_CHARS) : state.text}
                </pre>
                {state.text.length > MAX_SHOWN_CHARS ? (
                  <p className="ws-note">
                    Showing the first {MAX_SHOWN_CHARS.toLocaleString()} of {state.text.length.toLocaleString()} characters.
                  </p>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </div>
    </details>
  );
}

export function EventsDisclosure({ events }: { events: RunEvent[] }) {
  return (
    <details className="ws-disclosure">
      <summary>Kane events ({events.length})</summary>
      <div className="ws-disclosure-body">
        {events.length === 0 ? (
          <p className="ws-note">No events were recorded.</p>
        ) : (
          <pre className="ws-pre" data-lenis-prevent tabIndex={0} aria-label="Kane events">
            {events.map((e) => `${String(e.sequence).padStart(3, " ")}  ${e.eventType ?? "(no type)"}  ${e.rawLine}`).join("\n")}
          </pre>
        )}
      </div>
    </details>
  );
}

export function CommandDisclosure({ command }: { command: string[] | null }) {
  return (
    <details className="ws-disclosure">
      <summary>Command that was run</summary>
      <div className="ws-disclosure-body">
        {command ? (
          <pre className="ws-pre" data-lenis-prevent tabIndex={0} aria-label="Command">
            {command.join(" ")}
          </pre>
        ) : (
          <p className="ws-note">No process was started for this run.</p>
        )}
      </div>
    </details>
  );
}
