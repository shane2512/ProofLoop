"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { MAX_CRITERIA, MIN_READY_CRITERIA, type Criterion } from "@/lib/api-types";
import { CriterionCard } from "./CriterionCard";
import { CriterionForm } from "./CriterionForm";
import { Dialog } from "./Dialog";
import { ErrorNotice } from "./ErrorNotice";
import { ProjectForm } from "./ProjectForm";
import { RunHistory } from "./RunHistory";
import { RunPanel } from "./RunPanel";
import { useLoad } from "./useLoad";

type Modal =
  | { kind: "none" }
  | { kind: "project" }
  | { kind: "criterion"; criterion?: Criterion }
  | { kind: "run"; criterion: Criterion }
  | { kind: "delete"; criterion: Criterion }
  | { kind: "archive" };

export function ProjectView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { data, error, loading, reload } = useLoad((signal) => api.getProject(projectId, signal), `project:${projectId}`);
  const [modal, setModal] = useState<Modal>({ kind: "none" });
  const [watch, setWatch] = useState<{ runId: string; startedHere: boolean } | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const resumed = useRef(false);

  const criteria = data?.criteria ?? [];
  const project = data?.project ?? null;
  const runnerBusy = criteria.some((c) => c.status === "RUNNING");

  // If the page is opened while a run is active (for example after a reload), watch it.
  useEffect(() => {
    if (resumed.current || !data) return;
    resumed.current = true;
    const active = data.criteria.find((c) => c.status === "RUNNING" && c.lastRunId);
    if (active?.lastRunId) setWatch({ runId: active.lastRunId, startedHere: false });
  }, [data]);

  function closeModal() {
    setModal({ kind: "none" });
    setActionError(null);
  }

  async function startRun(criterion: Criterion) {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const { runId } = await api.startRun(projectId, criterion.id);
      setWatch({ runId, startedHere: true });
      setHistoryKey((k) => k + 1);
      reload();
      setModal({ kind: "none" });
    } catch (err) {
      setActionError(err);
    } finally {
      setActionBusy(false);
    }
  }

  async function removeCriterion(criterion: Criterion) {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await api.deleteCriterion(projectId, criterion.id);
      reload();
      setModal({ kind: "none" });
    } catch (err) {
      setActionError(err);
    } finally {
      setActionBusy(false);
    }
  }

  async function archive() {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await api.archiveProject(projectId);
      router.push("/workspace");
    } catch (err) {
      setActionError(err);
      setActionBusy(false);
    }
  }

  if (error && !data) {
    const gone = error instanceof ApiError && error.status === 404;
    return (
      <div className="ws-stack">
        <ErrorNotice error={error} onRetry={gone ? undefined : reload} />
        <Link className="ws-btn ws-btn-ghost" href="/workspace">
          Back to projects
        </Link>
      </div>
    );
  }

  if (!project) {
    return <div className="ws-skeleton ws-skeleton-tall" aria-busy="true" aria-label={loading ? "Loading project" : "Project"} />;
  }

  const verified = criteria.filter((c) => c.status === "VERIFIED").length;
  const atLimit = criteria.length >= MAX_CRITERIA;
  const missing = Math.max(0, MIN_READY_CRITERIA - criteria.length);

  return (
    <div className="ws-stack">
      <nav aria-label="Breadcrumb" className="ws-crumb">
        <Link href="/workspace">Projects</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{project.name}</span>
      </nav>

      <header className="ws-project-head">
        <div>
          <h1 className="ws-h1">{project.name}</h1>
          <p className="ws-project-url">{project.targetUrl}</p>
          {project.notes ? <p className="ws-note">{project.notes}</p> : null}
        </div>
        <div className="ws-actions ws-actions-tight">
          <button type="button" className="ws-btn ws-btn-ghost" onClick={() => setModal({ kind: "project" })}>
            Edit project
          </button>
          <button type="button" className="ws-btn ws-btn-ghost" onClick={() => setModal({ kind: "archive" })}>
            Archive
          </button>
        </div>
      </header>

      {error ? <ErrorNotice error={error} onRetry={reload} /> : null}

      <section className="ws-panel" aria-labelledby="ws-criteria-title">
        <div className="ws-panel-head">
          <h2 id="ws-criteria-title" className="ws-h2">
            Acceptance criteria
          </h2>
          <button type="button" className="ws-btn ws-btn-primary" onClick={() => setModal({ kind: "criterion" })} disabled={atLimit}>
            Add criterion
          </button>
        </div>
        <p className="ws-note" data-testid="readiness">
          {criteria.length === 0
            ? "No criteria yet. Add three to five that a person could check."
            : missing > 0
              ? `${criteria.length} of ${MIN_READY_CRITERIA} criteria. Add ${missing} more to be ready to judge. Drafts are fine until then.`
              : `${criteria.length} criteria. ${verified} of ${criteria.length} verified by a real Kane run.`}
          {atLimit ? " A project holds at most five criteria, so delete one to add another." : ""}
        </p>
        {criteria.length === 0 ? (
          <div className="ws-empty">
            <p className="ws-empty-title">Nothing to verify yet.</p>
            <p>Each criterion pairs what should be true with a Kane test file that checks it. Nothing counts as verified until Kane runs that test and passes.</p>
            <p className="ws-help">
              Don&apos;t know how to write a test script? <Link href="/test-examples">Click here for the format and examples you can copy</Link>.
            </p>
          </div>
        ) : (
          <ul className="ws-criteria">
            {criteria.map((c) => (
              <CriterionCard
                key={c.id}
                criterion={c}
                runnerBusy={runnerBusy}
                onRun={(x) => {
                  setActionError(null);
                  setModal({ kind: "run", criterion: x });
                }}
                onEdit={(x) => setModal({ kind: "criterion", criterion: x })}
                onDelete={(x) => {
                  setActionError(null);
                  setModal({ kind: "delete", criterion: x });
                }}
                onViewRun={(runId) => setWatch({ runId, startedHere: false })}
              />
            ))}
          </ul>
        )}
      </section>

      {watch ? (
        <RunPanel
          key={watch.runId}
          runId={watch.runId}
          startedHere={watch.startedHere}
          onSettled={() => {
            reload();
            setHistoryKey((k) => k + 1);
          }}
          onClose={() => setWatch(null)}
        />
      ) : null}

      <RunHistory projectId={projectId} refreshKey={historyKey} selectedRunId={watch?.runId ?? null} criteria={criteria} onSelect={(r) => setWatch({ runId: r.id, startedHere: false })} />

      <Dialog open={modal.kind === "project"} onClose={closeModal} title="Edit project">
        <ProjectForm
          project={project}
          onCancel={closeModal}
          onSaved={() => {
            reload();
            closeModal();
          }}
        />
      </Dialog>

      <Dialog open={modal.kind === "criterion"} onClose={closeModal} title={modal.kind === "criterion" && modal.criterion ? "Edit criterion" : "Add criterion"} wide>
        {modal.kind === "criterion" ? (
          <CriterionForm
            project={project}
            criteria={criteria}
            criterion={modal.criterion}
            onCancel={closeModal}
            onSaved={() => {
              reload();
              closeModal();
            }}
          />
        ) : null}
      </Dialog>

      <Dialog open={modal.kind === "run"} onClose={closeModal} title="Start a real Kane run?">
        {modal.kind === "run" ? (
          <div className="ws-form">
            <p>
              This runs <strong>{modal.criterion.title}</strong> against <strong>{project.targetUrl}</strong> using the test file{" "}
              <code>{modal.criterion.testFile.split("/").pop()}</code>.
            </p>
            <ul className="ws-bullets">
              <li>It is a real Kane browser run on this machine, not a simulation.</li>
              <li>It uses your Kane (TestMu) credits. ProofLoop does not estimate the cost.</li>
              <li>Kane uploads each run to your TestMu Test Manager.</li>
              <li>It can take a minute or more, and only one run can be active at a time.</li>
            </ul>
            {actionError ? <ErrorNotice error={actionError} /> : null}
            <div className="ws-actions">
              <button type="button" className="ws-btn ws-btn-primary" onClick={() => startRun(modal.criterion)} disabled={actionBusy}>
                {actionBusy ? "Starting..." : "Start real run"}
              </button>
              <button type="button" className="ws-btn ws-btn-ghost" onClick={closeModal}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog open={modal.kind === "delete"} onClose={closeModal} title="Delete this criterion?">
        {modal.kind === "delete" ? (
          <div className="ws-form">
            <p>
              <strong>{modal.criterion.title}</strong> will no longer appear on this project. Its past runs stay in the history.
            </p>
            {actionError ? <ErrorNotice error={actionError} /> : null}
            <div className="ws-actions">
              <button type="button" className="ws-btn ws-btn-danger" onClick={() => removeCriterion(modal.criterion)} disabled={actionBusy}>
                {actionBusy ? "Deleting..." : "Delete criterion"}
              </button>
              <button type="button" className="ws-btn ws-btn-ghost" onClick={closeModal}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog open={modal.kind === "archive"} onClose={closeModal} title="Archive this project?">
        {modal.kind === "archive" ? (
          <div className="ws-form">
            <p>
              <strong>{project.name}</strong> will leave the project list. Its criteria and run history are kept on disk.
            </p>
            {actionError ? <ErrorNotice error={actionError} /> : null}
            <div className="ws-actions">
              <button type="button" className="ws-btn ws-btn-danger" onClick={archive} disabled={actionBusy}>
                {actionBusy ? "Archiving..." : "Archive project"}
              </button>
              <button type="button" className="ws-btn ws-btn-ghost" onClick={closeModal}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
