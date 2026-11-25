"use client";

import { useRef, useState } from "react";

type State = "idle" | "copied" | "error";

/** Code block with a copy button that reports success or failure (no silent failures). */
export function CopyCode({ lines }: { lines: string[] }) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = lines.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("error");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  };

  return (
    <div className="code">
      <pre>
        <code>
          {lines.map((line, i) => (
            <span key={i}>
              <span className="prompt">{line.startsWith("#") ? "" : "> "}</span>
              {line}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
      <button type="button" className="copy-btn" data-state={state} onClick={copy} aria-live="polite">
        {state === "copied" ? "Copied" : state === "error" ? "Copy failed" : "Copy"}
      </button>
    </div>
  );
}
