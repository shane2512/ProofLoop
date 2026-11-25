"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, describeApiError } from "@/lib/api-client";
import type { Criterion, Project } from "@/lib/api-types";
import { ErrorNotice } from "./ErrorNotice";
import { Field } from "./Field";
import { TestFileEditor } from "./TestFileEditor";
import { useLoad } from "./useLoad";

interface Props {
  project: Project;
  /** Active criteria, used to count how many share a test file. */
  criteria: Criterion[];
  /** When set, edits this criterion; otherwise creates one. */
  criterion?: Criterion;
  onSaved: (criterion: Criterion) => void;
  onCancel: () => void;
}

const FIELDS = ["title", "expectedBehavior", "notes", "testFile", "stepLabel"];

export function CriterionForm({ project, criteria, criterion, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(criterion?.title ?? "");
  const [expected, setExpected] = useState(criterion?.expectedBehavior ?? "");
  const [stepLabel, setStepLabel] = useState(criterion?.stepLabel ?? "");
  const [notes, setNotes] = useState(criterion?.notes ?? "");
  const [testFile, setTestFile] = useState(criterion?.testFile ?? "");
  const [view, setView] = useState<{ kind: "form" } | { kind: "file"; existing?: string }>({ kind: "form" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const files = useLoad((signal) => api.listTestFiles(project.id, signal), `files:${project.id}`);

  if (view.kind === "file") {
    const mapped = view.existing ? criteria.filter((c) => c.testFile === `${project.id}/${view.existing}_test.md`).length : 0;
    return (
      <TestFileEditor
        projectId={project.id}
        targetUrl={project.targetUrl}
        existingName={view.existing}
        mappedCriteria={mapped}
        onCancel={() => setView({ kind: "form" })}
        onSaved={(file) => {
          files.reload();
          setTestFile(file.testFile);
          setView({ kind: "form" });
        }}
      />
    );
  }

  const fieldError = (f: string) => (error instanceof ApiError && error.field === f ? describeApiError(error).title : null);
  const generalError = error && !(error instanceof ApiError && error.field && FIELDS.includes(error.field));
  const options = files.data ?? [];
  const mappedMissing = testFile !== "" && files.data !== null && !options.some((f) => f.testFile === testFile);
  const selectedName = options.find((f) => f.testFile === testFile)?.name;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const input = {
        title: title.trim(),
        expectedBehavior: expected.trim(),
        notes: notes.trim() === "" ? null : notes.trim(),
        testFile,
        stepLabel: stepLabel.trim() === "" ? null : stepLabel.trim(),
      };
      onSaved(criterion ? await api.updateCriterion(project.id, criterion.id, input) : await api.createCriterion(project.id, input));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ws-form" onSubmit={submit} noValidate>
      <Field label="Criterion" hint="A short statement a person could check, such as 'Login reaches inventory'." error={fieldError("title")}>
        {(p) => <input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoComplete="off" />}
      </Field>
      <Field
        label="Expected behavior"
        hint="What must be true when this passes. Changing it later makes an earlier pass stale."
        error={fieldError("expectedBehavior")}
      >
        {(p) => <textarea {...p} value={expected} onChange={(e) => setExpected(e.target.value)} rows={3} maxLength={2000} required />}
      </Field>

      <Field
        label="Test file"
        hint="The Kane test that checks this criterion. ProofLoop verifies the criterion only from a real run of this file."
        error={fieldError("testFile")}
      >
        {(p) => (
          <select {...p} value={testFile} onChange={(e) => setTestFile(e.target.value)} required disabled={files.loading && !files.data}>
            <option value="">{files.loading && !files.data ? "Loading test files..." : "Choose a test file"}</option>
            {mappedMissing ? <option value={testFile}>{testFile} (file is missing)</option> : null}
            {options.map((f) => (
              <option key={f.testFile} value={f.testFile}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {files.error ? <ErrorNotice error={files.error} onRetry={files.reload} /> : null}
      {files.data && options.length === 0 ? <p className="ws-note">This project has no test files yet. Write one to continue.</p> : null}
      <div className="ws-actions ws-actions-tight">
        <button type="button" className="ws-btn ws-btn-ghost" onClick={() => setView({ kind: "file" })}>
          Write a new test file
        </button>
        {selectedName ? (
          <button type="button" className="ws-btn ws-btn-ghost" onClick={() => setView({ kind: "file", existing: selectedName })}>
            Edit {selectedName}
          </button>
        ) : null}
      </div>

      <Field label="Step label (optional)" hint="Name of the step in the test that proves this criterion." error={fieldError("stepLabel")}>
        {(p) => <input {...p} value={stepLabel} onChange={(e) => setStepLabel(e.target.value)} maxLength={120} autoComplete="off" />}
      </Field>
      <Field label="Notes (optional)" error={fieldError("notes")}>
        {(p) => <textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />}
      </Field>

      {generalError ? <ErrorNotice error={error} /> : null}
      <div className="ws-actions">
        <button type="submit" className="ws-btn ws-btn-primary" disabled={busy}>
          {busy ? "Saving..." : criterion ? "Save criterion" : "Add criterion"}
        </button>
        <button type="button" className="ws-btn ws-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
