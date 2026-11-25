"use client";

import { describeApiError } from "@/lib/api-client";

/** Shows what went wrong and what to do about it. Announced to screen readers. */
export function ErrorNotice({ error, onRetry, retryLabel = "Retry" }: { error: unknown; onRetry?: () => void; retryLabel?: string }) {
  const { title, remedy } = describeApiError(error);
  return (
    <div className="ws-notice ws-notice-error" role="alert">
      <p className="ws-notice-title">{title}</p>
      {remedy ? <p className="ws-notice-body">{remedy}</p> : null}
      {onRetry ? (
        <button type="button" className="ws-btn ws-btn-ghost" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
