"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { reportUrl } from "@/lib/api-types";
import { ErrorNotice } from "./ErrorNotice";
import { useLoad } from "./useLoad";

/**
 * The handoff report for a finished run. It is only shown, copied or saved when the person asks.
 * ProofLoop never sends it to an agent, and nothing here starts a run.
 */
export function ReportSection({ runId }: { runId: string }) {
  const report = useLoad((signal) => api.getReportMarkdown(runId, signal), `report:${runId}`);
  const area = useRef<HTMLTextAreaElement>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "blocked">("idle");

  async function copyReport() {
    const text = report.data;
    if (text === null) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setCopy("copied");
    } catch {
      // The browser refused. Select the text so the person can press Ctrl+C themselves.
      area.current?.focus();
      area.current?.select();
      setCopy("blocked");
    }
  }

  return (
    <section aria-labelledby={`report-${runId}`}>
      <h3 id={`report-${runId}`} className="ws-h3">
        Report for your coding agent
      </h3>
      <p className="ws-note">
        Built from this run&apos;s stored record only. ProofLoop does not send it anywhere: copy or download it and give it to your own coding agent, then review what the agent changes and start a new run.
      </p>
      {report.error ? <ErrorNotice error={report.error} onRetry={report.reload} /> : null}
      {report.loading && report.data === null && !report.error ? <p className="ws-note">Building the report...</p> : null}
      {report.data !== null ? (
        <>
          <textarea ref={area} className="ws-code ws-report" aria-label="Report text" readOnly value={report.data} rows={14} data-lenis-prevent />
          <div className="ws-actions ws-actions-tight">
            <button type="button" className="ws-btn ws-btn-primary" onClick={copyReport}>
              Copy report
            </button>
            <a className="ws-btn ws-btn-ghost" href={reportUrl(runId, "markdown")} download>
              Download Markdown
            </a>
            <a className="ws-btn ws-btn-ghost" href={reportUrl(runId, "json")} download>
              Download JSON
            </a>
          </div>
          <p role="status" className="ws-note">
            {copy === "copied" ? "Copied to the clipboard." : null}
            {copy === "blocked" ? "The browser blocked copying. The report is selected: press Ctrl+C to copy it." : null}
          </p>
          <details className="ws-disclosure">
            <summary>Export with raw output</summary>
            <div className="ws-disclosure-body">
              <p className="ws-note">
                This JSON file also contains the full stdout and stderr Kane wrote for this run, redacted for known secrets and your home folder. Only download it if you want to share the raw output.
              </p>
              <a className="ws-btn ws-btn-ghost" href={reportUrl(runId, "json", true)} download>
                Download JSON with raw output
              </a>
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}
