import "server-only";
import { randomUUID } from "node:crypto";
import type { CriterionSnapshot, Run, RunEvent, RunStatus } from "../domain/types";
import { canTransition } from "../domain/verification";
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
  test_file_sha256: string | null;
  error_code: string | null;
  command_json: string | null;
  kane_result_json: string | null;
  _rowid: number;
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toRun(r: RunRow): Run {
  const command = parseJson(r.command_json);
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
    testFileSha256: r.test_file_sha256,
    errorCode: r.error_code,
    commandRedacted: Array.isArray(command) ? (command as string[]) : null,
    kaneResult: parseJson(r.kane_result_json),
  };
}

/** Lifecycle fields a run may change while it is QUEUED or RUNNING. Snapshots and the test hash are not included. */
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
  errorCode?: string | null;
  commandRedacted?: string[] | null;
  kaneResult?: unknown;
}

export interface NewEvent {
  eventType: string | null;
  rawLine: string;
  parsedJson?: string | null;
}

export interface RunPage {
  runs: Run[];
  nextCursor: string | null;
}

const SELECT_RUN = "SELECT *, rowid AS _rowid FROM runs";
const CURSOR_RE = /^[A-Za-z0-9_-]{1,200}$/;

function encodeCursor(createdAt: string, rowid: number): string {
  return Buffer.from(`${createdAt}|${rowid}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; rowid: number } {
  const bad = () => new AppError("VALIDATION_ERROR", "cursor is not valid.", 400, { field: "cursor" });
  if (!CURSOR_RE.test(cursor)) throw bad();
  const [createdAt, rowidText] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const rowid = Number(rowidText);
  if (!createdAt || !Number.isInteger(rowid) || rowid < 0 || Number.isNaN(Date.parse(createdAt))) throw bad();
  return { createdAt, rowid };
}

/**
 * Persistence for runs. Run history is append-only: snapshots are immutable, completed runs
 * never change, and nothing here deletes a run (the database enforces all three with triggers).
 */
export class RunRepository {
  constructor(private readonly db: Db) {}

  /** Creates a QUEUED run with an immutable snapshot (FR-014, PROC-006). Does not check for other active runs. */
  createQueued(projectId: string, criterionId: string, snapshot: CriterionSnapshot, testFileSha256: string | null = null): Run {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO runs (id, project_id, criterion_id, criterion_snapshot_json, test_file_snapshot, test_file_sha256, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?)`,
      )
      .run(id, projectId, criterionId, JSON.stringify(snapshot), snapshot.testFile, testFileSha256, new Date().toISOString());
    return this.mustGet(id);
  }

  /** Atomically checks that no run is active and creates a QUEUED one. Returns null when the runner is busy. */
  createQueuedIfIdle(projectId: string, criterionId: string, snapshot: CriterionSnapshot, testFileSha256: string | null): Run | null {
    return transaction(this.db, () => {
      const active = (this.db.prepare("SELECT COUNT(*) AS n FROM runs WHERE status IN ('QUEUED','RUNNING')").get() as { n: number }).n;
      if (active > 0) return null;
      return this.createQueued(projectId, criterionId, snapshot, testFileSha256);
    });
  }

  get(id: string): Run | null {
    const row = this.db.prepare(`${SELECT_RUN} WHERE id = ?`).get(id) as RunRow | undefined;
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
      .prepare(`${SELECT_RUN} WHERE criterion_id = ? ORDER BY created_at DESC, rowid DESC`)
      .all(criterionId) as unknown as RunRow[];
    return rows.map(toRun);
  }

  /** Newest first, keyset-paginated (INT-011). */
  listForProject(projectId: string, opts: { criterionId?: string; limit: number; cursor?: string }): RunPage {
    const where = ["project_id = ?"];
    const params: Array<string | number> = [projectId];
    if (opts.criterionId) {
      where.push("criterion_id = ?");
      params.push(opts.criterionId);
    }
    if (opts.cursor) {
      const c = decodeCursor(opts.cursor);
      where.push("(created_at < ? OR (created_at = ? AND rowid < ?))");
      params.push(c.createdAt, c.createdAt, c.rowid);
    }
    const rows = this.db
      .prepare(`${SELECT_RUN} WHERE ${where.join(" AND ")} ORDER BY created_at DESC, rowid DESC LIMIT ?`)
      .all(...params, opts.limit + 1) as unknown as RunRow[];
    const page = rows.slice(0, opts.limit);
    const last = page[page.length - 1];
    const nextCursor = rows.length > opts.limit && last ? encodeCursor(last.created_at, last._rowid) : null;
    return { runs: page.map(toRun), nextCursor };
  }

  /** Rejected by the state machine and by the database once the run is completed. */
  updateLifecycle(id: string, u: RunLifecycleUpdate): Run {
    const flag = (v: boolean | undefined, cur: number) => (v === undefined ? cur : v ? 1 : 0);
    return transaction(this.db, () => {
      const cur = this.db.prepare(`${SELECT_RUN} WHERE id = ?`).get(id) as RunRow | undefined;
      if (!cur) throw new AppError("NOT_FOUND", "Run not found.", 404);
      if (!canTransition(cur.status, u.status)) {
        throw new AppError("CONFLICT", `Run cannot move from ${cur.status} to ${u.status}.`, 409);
      }
      try {
        this.db
          .prepare(
            `UPDATE runs SET status = ?, exit_code = ?, signal = ?, timed_out = ?, canceled = ?, summary = ?,
              raw_stdout_path = ?, raw_stderr_path = ?, stdout_truncated = ?, stderr_truncated = ?,
              duration_ms = ?, started_at = ?, finished_at = ?, parser_version = ?,
              error_code = ?, command_json = ?, kane_result_json = ? WHERE id = ?`,
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
            u.errorCode === undefined ? cur.error_code : u.errorCode,
            u.commandRedacted === undefined ? cur.command_json : u.commandRedacted === null ? null : JSON.stringify(u.commandRedacted),
            u.kaneResult === undefined ? cur.kane_result_json : u.kaneResult === null ? null : JSON.stringify(u.kaneResult),
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

  /**
   * Startup recovery (architecture.md): runs left QUEUED or RUNNING by a previous process can never be
   * confirmed, so they become UNKNOWN. They are never marked PASSED. Returns how many were recovered.
   */
  markInterruptedAsUnknown(): number {
    const result = this.db
      .prepare(
        `UPDATE runs SET status = 'UNKNOWN', error_code = 'UNKNOWN_RUN_RESULT', finished_at = ?,
           summary = 'ProofLoop stopped or restarted while this run was active, so its result is unknown. The Kane process may still have been running.'
         WHERE status IN ('QUEUED','RUNNING')`,
      )
      .run(new Date().toISOString());
    return Number(result.changes);
  }

  appendEvent(runId: string, eventType: string | null, rawLine: string, parsedJson: string | null): RunEvent {
    const [event] = this.appendEvents(runId, [{ eventType, rawLine, parsedJson }]);
    if (!event) throw new AppError("INTERNAL_ERROR", "Event was not stored.", 500);
    return event;
  }

  /** Inserts events with consecutive sequence numbers in one transaction. */
  appendEvents(runId: string, events: readonly NewEvent[]): RunEvent[] {
    if (events.length === 0) return [];
    return transaction(this.db, () => {
      let seq = (this.db.prepare("SELECT COALESCE(MAX(sequence), 0) AS s FROM run_events WHERE run_id = ?").get(runId) as { s: number }).s;
      const insert = this.db.prepare(
        "INSERT INTO run_events (id, run_id, sequence, event_type, raw_line, parsed_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      const out: RunEvent[] = [];
      for (const e of events) {
        seq += 1;
        const id = randomUUID();
        const createdAt = new Date().toISOString();
        insert.run(id, runId, seq, e.eventType, e.rawLine, e.parsedJson ?? null, createdAt);
        out.push({ id, runId, sequence: seq, eventType: e.eventType, rawLine: e.rawLine, parsedJson: e.parsedJson ?? null, createdAt });
      }
      return out;
    });
  }

  listEvents(runId: string): RunEvent[] {
    const rows = this.db.prepare("SELECT * FROM run_events WHERE run_id = ? ORDER BY sequence ASC").all(runId) as unknown as Array<{
      id: string;
      run_id: string;
      sequence: number;
      event_type: string | null;
      raw_line: string;
      parsed_json: string | null;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      runId: r.run_id,
      sequence: r.sequence,
      eventType: r.event_type,
      rawLine: r.raw_line,
      parsedJson: r.parsed_json,
      createdAt: r.created_at,
    }));
  }
}
