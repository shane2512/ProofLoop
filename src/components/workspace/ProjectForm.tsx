"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, describeApiError } from "@/lib/api-client";
import type { Project } from "@/lib/api-types";
import { ErrorNotice } from "./ErrorNotice";
import { Field } from "./Field";

interface Props {
  /** When set, the form edits this project; otherwise it creates one. */
  project?: Project;
  onSaved: (project: Project) => void;
  onCancel?: () => void;
}

export function ProjectForm({ project, onSaved, onCancel }: Props) {
  const [name, setName] = useState(project?.name ?? "");
  const [targetUrl, setTargetUrl] = useState(project?.targetUrl ?? "");
  const [notes, setNotes] = useState(project?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const fieldError = (f: string) => (error instanceof ApiError && error.field === f ? describeApiError(error).title : null);
  const generalError = error && !(error instanceof ApiError && error.field && ["name", "targetUrl", "notes"].includes(error.field));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const input = { name: name.trim(), targetUrl: targetUrl.trim(), notes: notes.trim() === "" ? null : notes.trim() };
      const saved = project ? await api.updateProject(project.id, input) : await api.createProject(input);
      onSaved(saved);
      if (!project) {
        setName("");
        setTargetUrl("");
        setNotes("");
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ws-form" onSubmit={submit} noValidate>
      <Field label="Project name" error={fieldError("name")}>
        {(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="off" />}
      </Field>
      <Field label="Target URL" hint="The site Kane will test. http or https, no credentials in the URL." error={fieldError("targetUrl")}>
        {(p) => (
          <input
            {...p}
            type="url"
            inputMode="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://www.saucedemo.com/"
            required
            autoComplete="off"
          />
        )}
      </Field>
      <Field label="Notes (optional)" error={fieldError("notes")}>
        {(p) => <textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />}
      </Field>
      {generalError ? <ErrorNotice error={error} /> : null}
      <div className="ws-actions">
        <button type="submit" className="ws-btn ws-btn-primary" disabled={busy}>
          {busy ? "Saving..." : project ? "Save project" : "Create project"}
        </button>
        {onCancel ? (
          <button type="button" className="ws-btn ws-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
