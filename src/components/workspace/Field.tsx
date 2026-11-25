"use client";

import { useId, type ReactNode } from "react";

interface Props {
  label: string;
  error?: string | null;
  hint?: string;
  children: (props: { id: string; "aria-describedby": string | undefined; "aria-invalid": boolean }) => ReactNode;
}

/** Label, control, hint and error wired together for assistive technology. */
export function Field({ label, error, hint, children }: Props) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="ws-field">
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": Boolean(error) })}
      {hint ? (
        <p id={`${id}-hint`} className="ws-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} className="ws-field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
