import "server-only";
import { randomUUID } from "node:crypto";
import type { CriterionSnapshot, Run, RunEvent, RunStatus } from "../domain/types";
import { AppError } from "../errors";
import { transaction, type Db } from "./db";

interface RunRow {
  id: string;
  project_id: string;
  criterion_id: string;
  criterion_snapshot_json: string;
  test_file_snapshot: string;
  status: RunStatus;
  exit_code: number | null;
  signal: string | null;
  timed_out: number;
  canceled: number;
  summary: string | null;
  raw_stdout_path: string | null;
  raw_stderr_path: string | null;
  stdout_truncated: number;
  stderr_truncated: number;
  duration_ms: number | null;
  started_at: string | null;
  finished_at: string | null;
  parser_version: string | null;
  created_at: string;
}

function toRun(r: RunRow): Run {
  return {
    id: r.id,
    projectId: r.project_id,
    criterionId: r.criterion_id,
    criterionSnapshot: JSON.parse(r.criterion_snapshot_json) as CriterionSnapshot,
    testFileSnapshot: r.test_file_snapshot,
    status: r.status,
    exitCode: r.exit_code,
    signal: r.signal,
    timedOut: r.timed_out === 1,
    canceled: r.canceled === 1,
    summary: r.summary,
    rawStdoutPath: r.raw_stdout_path,
    rawStderrPath: r.raw_stderr_path,
    stdoutTruncated: r.stdout_truncated === 1,
    stderrTruncated: r.stderr_truncated === 1,
    durationMs: r.duration_ms,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    parserVersion: r.parser_version,
    createdAt: r.created_at,
  };
}

/** Lifecycle fields a run may change while it is QUEUED or RUNNING. Snapshots are not included. */
export interface RunLifecycleUpdate {
  status: RunStatus;
  exitCode?: number | null;
  signal?: string | null;
  timedOut?: boolean;
  canceled?: boolean;
  summary?: string | null;
  rawStdoutPath?: string | null;
  rawStderrPath?: string | null;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  durationMs?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  parserVersion?: string | null;
}

/**
 * Phase 2 persistence for runs. There is no public API that creates runs yet:
 * Kane execution is Phase 3 and the verification service is Phase 4.
 */
export class RunRepository {
  constructor(private readonly db: Db) {}

  /** Creates a QUEUED run with an immutable snapshot (FR-014, PROC-006). */
  createQueued(projectId: string, criterionId: string, snapshot: CriterionSnapshot): Run {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO runs (id, project_id, criterion_id, criterion_snapshot_json, test_file_snapshot, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'QUEUED', ?)`,
      )
      .run(id, projectId, criterionId, JSON.stringify(snapshot), snapshot.testFile, new Date().toISOString());
    return this.mustGet(id);
  }

  get(id: string): Run | null {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
    return row ? toRun(row) : null;
  }

  mustGet(id: string): Run {
    const r = this.get(id);
    if (!r) throw new AppError("NOT_FOUND", "Run not found.", 404);
    return r;
  }

  /** Newest first. */
  listForCriterion(criterionId: string): Run[] {
    const rows = this.db
      .prepare("SELECT * FROM runs WHERE criterion_id = ? ORDER BY created_at DESC, rowid DESC")
      .all(criterionId) as unknown as RunRow[];
    return rows.map(toRun);
  }

  /** Rejected by the database once the run is completed. */
  updateLifecycle(id: string, u: RunLifecycleUpdate): Run {
    const flag = (v: boolean | undefined, cur: number) => (v === undefined ? cur : v ? 1 : 0);
    return transaction(this.db, () => {
      const cur = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
      if (!cur) throw new AppError("NOT_FOUND", "Run not found.", 404);
      try {
        this.db
          .prepare(
            `UPDATE runs SET status = ?, exit_code = ?, signal = ?, timed_out = ?, canceled = ?, summary = ?,
              raw_stdout_path = ?, raw_stderr_path = ?, stdout_truncated = ?, stderr_truncated = ?,
              duration_ms = ?, started_at = ?, finished_at = ?, parser_version = ? WHERE id = ?`,
          )
          .run(
            u.status,
            u.exitCode === undefined ? cur.exit_code : u.exitCode,
            u.signal === undefined ? cur.signal : u.signal,
            flag(u.timedOut, cur.timed_out),
            flag(u.canceled, cur.canceled),
            u.summary === undefined ? cur.summary : u.summary,
            u.rawStdoutPath === undefined ? cur.raw_stdout_path : u.rawStdoutPath,
            u.rawStderrPath === undefined ? cur.raw_stderr_path : u.rawStderrPath,
            flag(u.stdoutTruncated, cur.stdout_truncated),
            flag(u.stderrTruncated, cur.stderr_truncated),
            u.durationMs === undefined ? cur.duration_ms : u.durationMs,
            u.startedAt === undefined ? cur.started_at : u.startedAt,
            u.finishedAt === undefined ? cur.finished_at : u.finishedAt,
            u.parserVersion === undefined ? cur.parser_version : u.parserVersion,
            id,
          );
      } catch (err) {
        if (err instanceof Error && /append-only|immutable/i.test(err.message)) {
          throw new AppError("CONFLICT", "Run is already completed and cannot be changed.", 409);
        }
        throw err;
      }
      return this.mustGet(id);
    });
  }

  appendEvent(runId: string, eventType: string | null, rawLine: string, parsedJson: string | null): RunEvent {
    const id = randomUUID();
    const now = new Date().toISOString();
    transaction(this.db, () => {
      const seq = (
        this.db.prepare("SELECT COALESCE(MAX(sequence), 0) AS s FROM run_events WHERE run_id = ?").get(runId) as {
          s: number;
        }
      ).s;
      this.db
        .prepare("INSERT INTO run_events (id, run_id, sequence, event_type, raw_line, parsed_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, runId, seq + 1, eventType, rawLine, parsedJson, now);
    });
    const row = this.db.prepare("SELECT * FROM run_events WHERE id = ?").get(id) as {
      id: string;
      run_id: string;
      sequence: number;
      event_type: string | null;
      raw_line: string;
      parsed_json: string | null;
      created_at: string;
    };
    return {
      id: row.id,
      runId: row.run_id,
      sequence: row.sequence,
      eventType: row.event_type,
      rawLine: row.raw_line,
      parsedJson: row.parsed_json,
      createdAt: row.created_at,
    };
  }
}
