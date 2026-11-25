import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { EvidenceRef, Run, RunStatus } from "./domain/types";
import { requireId } from "./domain/validation";
import { AppError } from "./errors";
import { buildKaneRunCommand, resolveKaneLaunch, type KaneLaunch } from "./kane/command";
import { discoverRunEvidence, importEvidencePack } from "./kane/evidence";
import { startKaneProcess, type RunHandle, type RunOptions, type RunResult } from "./kane/runner";
import { hashManagedTestFile, readManagedTestFile } from "./kane/testfile";
import { createRedactor, type Redactor } from "./security/redact";
import { transaction, type Db } from "./storage/db";
import type { CriterionRepository } from "./storage/criteria";
import type { EvidenceRepository, NewEvidence } from "./storage/evidence";
import type { ProjectRepository } from "./storage/projects";
import type { NewEvent, RunRepository } from "./storage/runs";

const MAX_STORED_EVENTS = 2000;
const MAX_EVENT_LINE_CHARS = 16 * 1024;

export interface VerificationDeps {
  db: Db;
  projects: ProjectRepository;
  criteria: CriterionRepository;
  runs: RunRepository;
  evidence: EvidenceRepository;
  dirs: {
    dataDir: string;
    testsDir: string;
    evidenceDir: string;
    /** Parent of the per-run Kane working directories. */
    workDir: string;
  };
  kaneCliPath: string | null;
  timeoutMs: number;
  maxBytesPerStream: number;
  redact?: Redactor;
  /** Overridable for tests. */
  resolveLaunch?: () => KaneLaunch | null;
  startProcess?: (options: RunOptions) => RunHandle;
}

export interface RunSummaryDto {
  id: string;
  projectId: string;
  criterionId: string;
  criterionSnapshot: Run["criterionSnapshot"];
  status: RunStatus;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  canceled: boolean;
  summary: string | null;
  errorCode: string | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  /** True only after the evidence file was verified to exist (FR-013). */
  evidenceAvailable: boolean;
  createdAt: string;
}

export interface EvidenceRefDto {
  id: string;
  kind: EvidenceRef["kind"];
  label: string;
  available: boolean;
  source: string;
  relativePath: string | null;
  unavailableReason: string | null;
}

export interface RunDetailDto {
  run: RunSummaryDto;
  events: Array<{ sequence: number; eventType: string | null; rawLine: string; createdAt: string }>;
  evidence: EvidenceRefDto[];
  /** Bounded summary of Kane's stream, including Kane's own failure diagnosis (not ProofLoop's). */
  kane: unknown;
  command: string[] | null;
}

interface ActiveRun {
  handle: RunHandle | null;
  cancelRequested: boolean;
}

const busy = () => new AppError("RUNNER_BUSY", "A verification run is already in progress. Only one run can be active at a time.", 409);

function clip(text: string): string {
  return text.length > MAX_EVENT_LINE_CHARS ? `${text.slice(0, MAX_EVENT_LINE_CHARS)}…[truncated]` : text;
}

/**
 * Orchestrates one verification run (FR-006 to FR-014, PROC-003 to PROC-006).
 *
 * Order of work for a run:
 *  1. validate the project, criterion and mapped test file (rejected before any record exists);
 *  2. atomically create the QUEUED run with an immutable snapshot and the test file hash (only if idle);
 *  3. return the run id immediately;
 *  4. in the background: RUNNING -> spawn Kane -> wait for the process to close -> save raw output,
 *     import verified evidence -> store events, evidence and the final status in one transaction.
 *
 * A run's status only ever becomes terminal after the process has closed or termination was reported
 * unconfirmed. Nothing in this class can set a criterion's status: that is derived from the newest run.
 */
export class VerificationService {
  private readonly active = new Map<string, ActiveRun>();
  private readonly completions = new Map<string, Promise<void>>();
  private readonly redact: Redactor;

  constructor(private readonly d: VerificationDeps) {
    this.redact = d.redact ?? createRedactor();
  }

  /** Marks runs left active by a previous process as UNKNOWN. Call once at startup. */
  recoverInterruptedRuns(): number {
    return this.d.runs.markInterruptedAsUnknown();
  }

  /** Resolves when a run started by this process has been fully recorded. Mainly for tests and shutdown. */
  async waitForRun(runId: string): Promise<void> {
    await this.completions.get(runId);
  }

  startRun(projectIdRaw: string, criterionIdRaw: string): { runId: string; status: "QUEUED" } {
    const projectId = requireId(projectIdRaw, "Project");
    const criterionId = requireId(criterionIdRaw, "Criterion");
    const project = this.d.projects.mustGet(projectId);
    const criterion = this.d.criteria.mustGet(projectId, criterionId);

    // Cheap in-process check first; the atomic database check below also covers other processes.
    if (this.active.size > 0) throw busy();

    const testFile = readManagedTestFile(this.d.dirs.testsDir, criterion.testFile);
    if (testFile === null) {
      throw new AppError("TEST_MAPPING_INVALID", "The mapped test file is missing, unreadable, too large, or outside the managed test directory.", 422, { field: "testFile" });
    }

    const run = this.d.runs.createQueuedIfIdle(
      projectId,
      criterionId,
      {
        projectName: project.name,
        targetUrl: project.targetUrl,
        title: criterion.title,
        expectedBehavior: criterion.expectedBehavior,
        notes: criterion.notes,
        testFile: criterion.testFile,
        stepLabel: criterion.stepLabel,
      },
      testFile.sha256,
    );
    if (run === null) throw busy();

    const entry: ActiveRun = { handle: null, cancelRequested: false };
    this.active.set(run.id, entry);

    let command;
    try {
      const launch = (this.d.resolveLaunch ?? (() => resolveKaneLaunch(this.d.kaneCliPath)))();
      if (launch === null) {
        throw new AppError("PREREQUISITE_FAILED", "Kane CLI was not found. Install it with `npm install -g @testmuai/kane-cli` and run `kane-cli login`, or set KANE_CLI_PATH.", 424);
      }
      command = buildKaneRunCommand(launch, testFile.absolutePath);
    } catch (err) {
      const message = err instanceof AppError ? err.message : "Kane could not be prepared.";
      this.recordNotStarted(run.id, message);
      this.active.delete(run.id);
      throw new AppError("PREREQUISITE_FAILED", message, 424, { runId: run.id });
    }

    const workDir = path.join(this.d.dirs.workDir, run.id);
    try {
      fs.mkdirSync(workDir, { recursive: true, mode: 0o700 });
    } catch {
      this.recordNotStarted(run.id, "The working directory for this run could not be created.");
      this.active.delete(run.id);
      throw new AppError("STORAGE_ERROR", "The working directory for this run could not be created.", 500, { runId: run.id });
    }

    const completion = this.execute(run, command, workDir, entry).finally(() => {
      this.active.delete(run.id);
      this.completions.delete(run.id);
    });
    this.completions.set(run.id, completion);
    return { runId: run.id, status: "QUEUED" };
  }

  cancelRun(runIdRaw: string): { runId: string; status: "CANCEL_REQUESTED" } {
    const runId = requireId(runIdRaw, "Run");
    const entry = this.active.get(runId);
    if (entry) {
      entry.cancelRequested = true;
      entry.handle?.cancel();
      return { runId, status: "CANCEL_REQUESTED" };
    }
    this.d.runs.mustGet(runId);
    throw new AppError("RUN_NOT_ACTIVE", "This run is not active.", 409);
  }

  /**
   * Returns a completed run's saved stdout or stderr (INT-014). The text was redacted before it was
   * saved. The file must sit under `<data>/runs/<run-id>/`; anything else is treated as unavailable.
   */
  readRawOutput(runIdRaw: string, stream: "stdout" | "stderr"): string {
    const runId = requireId(runIdRaw, "Run");
    const run = this.d.runs.mustGet(runId);
    const unavailable = () => new AppError("OUTPUT_UNAVAILABLE", "Output was not saved for this run.", 404);
    const rel = stream === "stdout" ? run.rawStdoutPath : run.rawStderrPath;
    if (!rel) throw unavailable();
    const root = path.resolve(this.d.dirs.dataDir, "runs", run.id);
    const abs = path.resolve(this.d.dirs.dataDir, rel);
    const within = path.relative(root, abs);
    if (within === "" || within.startsWith("..") || path.isAbsolute(within)) throw unavailable();
    try {
      const stat = fs.lstatSync(abs);
      if (!stat.isFile()) throw unavailable();
      return fs.readFileSync(abs, "utf8");
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw unavailable();
    }
  }

  getRunDetail(runIdRaw: string): RunDetailDto {
    const runId = requireId(runIdRaw, "Run");
    const run = this.d.runs.mustGet(runId);
    const evidence = this.d.evidence.listForRun(runId);
    return {
      run: this.toSummary(run, evidence.some((e) => e.available)),
      events: this.d.runs.listEvents(runId).map((e) => ({ sequence: e.sequence, eventType: e.eventType, rawLine: e.rawLine, createdAt: e.createdAt })),
      evidence: evidence.map((e) => ({
        id: e.id,
        kind: e.kind,
        label: e.label,
        available: e.available,
        source: e.source,
        relativePath: e.relativePath,
        unavailableReason: e.unavailableReason,
      })),
      kane: run.kaneResult,
      command: run.commandRedacted,
    };
  }

  listRuns(projectIdRaw: string, opts: { criterionId?: string | null; limit?: number | null; cursor?: string | null }): { runs: RunSummaryDto[]; nextCursor: string | null } {
    const projectId = requireId(projectIdRaw, "Project");
    this.d.projects.mustGet(projectId, true);
    const limit = opts.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError("VALIDATION_ERROR", "limit must be an integer between 1 and 100.", 400, { field: "limit" });
    }
    const criterionId = opts.criterionId ? requireId(opts.criterionId, "Criterion") : undefined;
    const page = this.d.runs.listForProject(projectId, { criterionId, limit, cursor: opts.cursor ?? undefined });
    return { runs: page.runs.map((r) => this.toSummary(r, this.d.evidence.hasAvailable(r.id))), nextCursor: page.nextCursor };
  }

  private toSummary(run: Run, evidenceAvailable: boolean): RunSummaryDto {
    return {
      id: run.id,
      projectId: run.projectId,
      criterionId: run.criterionId,
      criterionSnapshot: run.criterionSnapshot,
      status: run.status,
      exitCode: run.exitCode,
      signal: run.signal,
      timedOut: run.timedOut,
      canceled: run.canceled,
      summary: run.summary,
      errorCode: run.errorCode,
      durationMs: run.durationMs,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      stdoutTruncated: run.stdoutTruncated,
      stderrTruncated: run.stderrTruncated,
      evidenceAvailable,
      createdAt: run.createdAt,
    };
  }

  private recordNotStarted(runId: string, summary: string): void {
    try {
      this.d.runs.updateLifecycle(runId, {
        status: "NOT_STARTED",
        summary,
        errorCode: "PREREQUISITE_FAILED",
        finishedAt: new Date().toISOString(),
      });
    } catch {
      // The run stays QUEUED and is recovered as UNKNOWN on the next start. It is never PASSED.
    }
  }

  private async execute(run: Run, command: { executable: string; args: string[] }, workDir: string, entry: ActiveRun): Promise<void> {
    let keepWorkDir = false;
    try {
      if (entry.cancelRequested) {
        this.d.runs.updateLifecycle(run.id, {
          status: "CANCELED",
          canceled: true,
          summary: "The run was canceled before Kane was started.",
          errorCode: "PROCESS_CANCELED",
          finishedAt: new Date().toISOString(),
        });
        return;
      }
      this.d.runs.updateLifecycle(run.id, { status: "RUNNING", startedAt: new Date().toISOString() });

      const events: NewEvent[] = [];
      let dropped = 0;
      const start = this.d.startProcess ?? startKaneProcess;
      const handle = start({
        command,
        cwd: workDir,
        timeoutMs: this.d.timeoutMs,
        maxBytesPerStream: this.d.maxBytesPerStream,
        redact: this.redact,
        onEvent: (line) => {
          if (line.kind === "empty") return;
          if (events.length >= MAX_STORED_EVENTS) {
            dropped += 1;
            return;
          }
          events.push({ eventType: line.kind === "event" ? line.type : null, rawLine: clip(line.raw) });
        },
      });
      entry.handle = handle;
      if (entry.cancelRequested) handle.cancel();

      const result = await handle.result;
      keepWorkDir = this.finalize(run, result, events, dropped, workDir);
    } catch {
      this.failSafe(run.id);
    } finally {
      if (!keepWorkDir) {
        try {
          fs.rmSync(workDir, { recursive: true, force: true });
        } catch {
          // Leftover directories are harmless and live under the private data directory.
        }
      }
    }
  }

  /** Saves raw output and evidence, then stores events, evidence and the final status together. Returns true to keep the work directory. */
  private finalize(run: Run, result: RunResult, events: NewEvent[], droppedEvents: number, workDir: string): boolean {
    const notes: string[] = [];

    let rawStdoutPath: string | null = null;
    let rawStderrPath: string | null = null;
    try {
      const dir = path.join(this.d.dirs.dataDir, "runs", run.id);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(dir, "stdout.log"), result.stdout, { flag: "wx", mode: 0o600 });
      fs.writeFileSync(path.join(dir, "stderr.log"), result.stderr, { flag: "wx", mode: 0o600 });
      rawStdoutPath = `runs/${run.id}/stdout.log`;
      rawStderrPath = `runs/${run.id}/stderr.log`;
    } catch {
      rawStdoutPath = null;
      rawStderrPath = null;
      notes.push("Raw output could not be saved to disk.");
    }

    let keepWorkDir = false;
    const found = discoverRunEvidence(workDir, result.snapshot.evidenceId, result.stderr);
    let evidenceRow: NewEvidence;
    if (found.available && found.evidenceId !== null) {
      try {
        const imported = importEvidencePack(found, this.d.dirs.evidenceDir, run.id, found.evidenceId);
        evidenceRow = { runId: run.id, kind: "EVIDENCE_PACK", relativePath: imported.relativePath, label: "Kane evidence pack", source: `kane:${found.source}`, available: true, unavailableReason: null };
      } catch {
        keepWorkDir = true;
        notes.push("An evidence pack was found but could not be copied.");
        evidenceRow = { runId: run.id, kind: "EVIDENCE_PACK", relativePath: null, label: "Kane evidence pack", source: "kane", available: false, unavailableReason: "The evidence pack was found but could not be copied into ProofLoop's evidence directory." };
      }
    } else {
      evidenceRow = { runId: run.id, kind: "EVIDENCE_PACK", relativePath: null, label: "Kane evidence pack", source: "kane", available: false, unavailableReason: found.unavailableReason ?? "No evidence pack was found for this run." };
    }

    let status = result.outcome.status;
    let errorCode: string | null = result.outcome.errorCode;
    let summary = result.outcome.summary;
    if (status === "PASSED" || status === "FAILED") {
      const hashNow = hashManagedTestFile(this.d.dirs.testsDir, run.testFileSnapshot);
      if (hashNow !== run.testFileSha256) {
        status = "UNKNOWN";
        errorCode = "UNKNOWN_RUN_RESULT";
        summary = "The test file changed while the run was in progress, so the result cannot be tied to one version of the test.";
      }
    }
    if (droppedEvents > 0) notes.push(`${droppedEvents} stream events were not stored (limit ${MAX_STORED_EVENTS}).`);
    if (notes.length > 0) summary = `${summary} ${notes.join(" ")}`;

    transaction(this.d.db, () => {
      this.d.runs.appendEvents(run.id, events);
      this.d.evidence.add(evidenceRow);
      this.d.runs.updateLifecycle(run.id, {
        status,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        canceled: result.canceled,
        summary,
        rawStdoutPath,
        rawStderrPath,
        stdoutTruncated: result.stdoutTruncated,
        stderrTruncated: result.stderrTruncated,
        durationMs: result.durationMs,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        parserVersion: result.snapshot.parserVersion,
        errorCode,
        commandRedacted: result.redactedCommand,
        kaneResult: result.snapshot,
      });
    });
    return keepWorkDir;
  }

  private failSafe(runId: string): void {
    try {
      this.d.runs.updateLifecycle(runId, {
        status: "UNKNOWN",
        summary: "ProofLoop failed while recording this run, so its result is unknown.",
        errorCode: "INTERNAL_ERROR",
        finishedAt: new Date().toISOString(),
      });
    } catch {
      // Already completed, or the database is unavailable. Recovery marks a stranded run UNKNOWN on restart.
    }
  }
}
