"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, describeApiError } from "@/lib/api-client";
import type { TestFileEntry } from "@/lib/api-types";
import { ErrorNotice } from "./ErrorNotice";
import { Field } from "./Field";
import { useLoad } from "./useLoad";

interface Props {
  projectId: string;
  targetUrl: string;
  /** Edit this existing file. Omit to write a new one. */
  existingName?: string;
  /** How many active criteria are mapped to this file. */
  mappedCriteria?: number;
  onSaved: (file: TestFileEntry) => void;
  onCancel: () => void;
}

const MAX_BYTES = 48 * 1024;

export function starterTest(targetUrl: string): string {
  return `---
mode: testing
url: ${targetUrl}
max_steps: 20
---

# Describe what this test proves

## Open the page
Open ${targetUrl} and verify the page loads.

## Check the behavior
Describe one action to take, then what Kane should verify afterwards.
`;
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/**
 * Writes a Kane `_test.md` file into ProofLoop's managed test folder for this project.
 * The browser never sees a filesystem path; it only names the file.
 */
export function TestFileEditor({ projectId, targetUrl, existingName, mappedCriteria = 0, onSaved, onCancel }: Props) {
  const [name, setName] = useState(existingName ?? "");
  const [content, setContent] = useState(existingName ? "" : starterTest(targetUrl));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const existing = useLoad(
    async (signal) => {
      if (!existingName) return null;
      const file = await api.getTestFile(projectId, existingName, signal);
      setContent(file.content);
      return file;
    },
    `file:${projectId}:${existingName ?? ""}`,
  );

  const bytes = byteLength(content);
  const nameError = error instanceof ApiError && error.field === "name" ? describeApiError(error).title : null;
  const contentError = error instanceof ApiError && error.field === "content" ? describeApiError(error).title : null;
  const loaded = !existingName || existing.data !== null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !loaded) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.saveTestFile(projectId, name.trim(), content));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ws-form" onSubmit={submit} noValidate>
      <p className="ws-note">
        Kane runs this file as written, on this machine. ProofLoop saves it as <code>{name.trim() || "name"}_test.md</code> in this project&apos;s test folder.
      </p>
      <p className="ws-help">
        Don&apos;t know how to write a test script?{" "}
        <a href="/test-examples" target="_blank" rel="noopener noreferrer">
          Click here for the format and examples you can copy
        </a>{" "}
        (opens in a new tab, so your work here is kept).
      </p>
      {existingName && mappedCriteria > 0 ? (
        <p className="ws-note ws-note-warn">
          {mappedCriteria === 1 ? "A criterion uses" : `${mappedCriteria} criteria use`} this file. Saving changes means any earlier passing run of{" "}
          {mappedCriteria === 1 ? "it" : "them"} no longer counts until you run again.
        </p>
      ) : null}
      {existingName && existing.error ? <ErrorNotice error={existing.error} onRetry={existing.reload} /> : null}
      <Field label="File name" hint="Letters, digits, '-' and '_'. Up to 64 characters." error={nameError}>
        {(p) => (
          <input
            {...p}
            value={name}
            onChange={(e) => setName(e.target.value)}
            readOnly={Boolean(existingName)}
            maxLength={64}
            required
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </Field>
      <Field label="Test" error={contentError}>
        {(p) => (
          <textarea
            {...p}
            className="ws-code"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
            spellCheck={false}
            disabled={!loaded}
            required
          />
        )}
      </Field>
      <p className={`ws-hint${bytes > MAX_BYTES ? " ws-hint-bad" : ""}`}>
        {bytes.toLocaleString()} of {MAX_BYTES.toLocaleString()} bytes
      </p>
      {error && !nameError && !contentError ? <ErrorNotice error={error} /> : null}
      <div className="ws-actions">
        <button type="submit" className="ws-btn ws-btn-primary" disabled={busy || !loaded || bytes > MAX_BYTES}>
          {busy ? "Saving..." : "Save test file"}
        </button>
        <button type="button" className="ws-btn ws-btn-ghost" onClick={onCancel}>
          Back
        </button>
      </div>
    </form>
  );
}
