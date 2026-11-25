"use client";

// Error boundary. Shows no stack trace or internal message (SEC-009).
export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert">
      <h1>Something went wrong</h1>
      <p>The page failed to load. Details are in the local server log.</p>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
