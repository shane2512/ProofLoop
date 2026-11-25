"use client";

// Error boundary. Shows no stack trace or internal message (SEC-009).
export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#070708", color: "#f6f6f7", padding: 24, textAlign: "center" }}>
      <div>
        <h1 style={{ fontSize: 22, margin: "0 0 10px" }}>Something went wrong</h1>
        <p style={{ color: "#a3a3aa", margin: "0 0 20px" }}>The page failed to load. Details are in the local server log.</p>
        <button type="button" className="cta cta-light" onClick={() => reset()}>
          <span className="cta-sq">&gt;</span>
          Try again
        </button>
      </div>
    </div>
  );
}
