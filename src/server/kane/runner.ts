import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import type { Redactor } from "../security/redact";
import type { KaneCommand } from "./command";
import { classifyOutcome, type Outcome } from "./outcome";
import { KaneStreamSummary, parseLine, type KaneStreamSnapshot, type ParsedLine } from "./parser";

const MAX_LINE_CHARS = 1024 * 1024;
const DEFAULT_GRACE_MS = 5_000;
const DEFAULT_CONFIRM_MS = 10_000;

/**
 * Environment variables passed to the child. Everything else, including any application
 * secrets in the server environment, is withheld (SEC-004). Names are matched case-insensitively
 * because Windows environment names are case-insensitive.
 */
const ENV_ALLOWLIST = new Set(
  [
    "PATH", "PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "APPDATA", "LOCALAPPDATA",
    "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "HOME", "USERNAME", "USERDOMAIN", "TEMP", "TMP", "TMPDIR",
    "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432", "PROGRAMDATA", "NUMBER_OF_PROCESSORS",
    "PROCESSOR_ARCHITECTURE", "LANG", "LC_ALL", "TZ", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
    "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "DISPLAY",
  ].map((n) => n.toUpperCase()),
);

export type EnvMap = Record<string, string | undefined>;

export function buildChildEnv(source: EnvMap = process.env): EnvMap {
  const out: EnvMap = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && ENV_ALLOWLIST.has(key.toUpperCase())) out[key] = value;
  }
  return out;
}

export interface RunOptions {
  command: KaneCommand;
  /** ProofLoop-controlled directory. Kane writes .testmuai/evidence relative to it. */
  cwd: string;
  timeoutMs: number;
  maxBytesPerStream: number;
  redact: Redactor;
  env?: EnvMap;
  /** POSIX only: delay before SIGKILL after SIGTERM. */
  terminationGraceMs?: number;
  /** How long to wait for the process to close after a kill before reporting it unconfirmed. */
  terminationConfirmMs?: number;
  /** Called for every non-empty stdout line, already redacted. Errors thrown here are ignored. */
  onEvent?: (line: ParsedLine, sequence: number) => void;
  onStarted?: (info: { pid: number; startedAt: string }) => void;
}

export interface RunResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** Executable and arguments with redaction applied. */
  redactedCommand: string[];
  pid: number | null;
  spawnError: string | null;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  canceled: boolean;
  terminationUnconfirmed: boolean;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  stdoutBytes: number;
  stderrBytes: number;
  snapshot: KaneStreamSnapshot;
  outcome: Outcome;
}

export interface RunHandle {
  /** Requests cancellation. The result is reported only after the process closes (PROC-003). */
  cancel(): void;
  result: Promise<RunResult>;
}

class Capture {
  private readonly chunks: Buffer[] = [];
  private kept = 0;
  total = 0;
  truncated = false;
  constructor(private readonly max: number) {}

  push(chunk: Buffer): void {
    this.total += chunk.length;
    const room = this.max - this.kept;
    if (room <= 0) {
      this.truncated = true;
      return;
    }
    if (chunk.length > room) {
      this.chunks.push(chunk.subarray(0, room));
      this.kept += room;
      this.truncated = true;
    } else {
      this.chunks.push(chunk);
      this.kept += chunk.length;
    }
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

class LineSplitter {
  private buffer = "";
  private discarding = false;
  constructor(
    private readonly onLine: (line: string, tooLong: boolean) => void,
    private readonly maxLine: number,
  ) {}

  write(text: string): void {
    this.buffer += text;
    let idx = this.buffer.indexOf("\n");
    while (idx !== -1) {
      let line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (this.discarding) this.discarding = false;
      else this.onLine(line, false);
      idx = this.buffer.indexOf("\n");
    }
    if (this.buffer.length > this.maxLine) {
      if (!this.discarding) this.onLine(this.buffer.slice(0, 2000), true);
      this.buffer = "";
      this.discarding = true;
    }
  }

  end(): void {
    if (this.buffer.length > 0 && !this.discarding) this.onLine(this.buffer, false);
    this.buffer = "";
  }
}

function errorCode(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === "string" ? code : "SPAWN_ERROR";
}

/**
 * Starts one supervised Kane process (PROC-001 to PROC-005). `shell:false`, fixed argv,
 * stdin closed, stdout and stderr drained concurrently into capped buffers, wall-clock timeout,
 * tree-kill on cancel/timeout. A result is produced only after the process closes, a spawn error is
 * observed, or termination could not be confirmed.
 */
export function startKaneProcess(opts: RunOptions): RunHandle {
  const startedAtDate = new Date();
  const t0 = process.hrtime.bigint();
  const summary = new KaneStreamSummary();
  const out = new Capture(opts.maxBytesPerStream);
  const err = new Capture(opts.maxBytesPerStream);
  const graceMs = opts.terminationGraceMs ?? DEFAULT_GRACE_MS;
  const confirmMs = opts.terminationConfirmMs ?? DEFAULT_CONFIRM_MS;

  let sequence = 0;
  let finished = false;
  let terminating = false;
  let spawnError: string | null = null;
  let timedOut = false;
  let canceled = false;
  let terminationUnconfirmed = false;
  let child: ChildProcess | null = null;
  let timeoutTimer: NodeJS.Timeout | null = null;
  let confirmTimer: NodeJS.Timeout | null = null;
  let resolveResult!: (r: RunResult) => void;
  const result = new Promise<RunResult>((resolve) => (resolveResult = resolve));

  const handleLine = (rawLine: string, tooLong: boolean): void => {
    const redacted = opts.redact(rawLine);
    const parsed: ParsedLine = tooLong ? { kind: "malformed", raw: redacted, reason: "line_too_long" } : parseLine(redacted);
    summary.ingest(parsed);
    if (parsed.kind === "empty") return;
    sequence += 1;
    try {
      opts.onEvent?.(parsed, sequence);
    } catch {
      // A failing consumer must not break process supervision.
    }
  };
  const lines = new LineSplitter(handleLine, MAX_LINE_CHARS);
  const decoder = new StringDecoder("utf8");

  const finish = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
    if (finished) return;
    finished = true;
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (confirmTimer) clearTimeout(confirmTimer);
    lines.write(decoder.end());
    lines.end();

    const finishedAt = new Date();
    const snapshot = summary.snapshot();
    const marker = (n: number) => `\n[ProofLoop: output truncated at ${n} bytes]\n`;
    const stdout = opts.redact(out.text() + (out.truncated ? marker(opts.maxBytesPerStream) : ""));
    const stderr = opts.redact(err.text() + (err.truncated ? marker(opts.maxBytesPerStream) : ""));
    const facts = {
      spawnError,
      exitCode,
      signal: signal ?? null,
      timedOut,
      canceled,
      terminationUnconfirmed,
      stdoutTruncated: out.truncated,
      snapshot,
    };
    resolveResult({
      startedAt: startedAtDate.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: Number((process.hrtime.bigint() - t0) / 1_000_000n),
      redactedCommand: [opts.command.executable, ...opts.command.args].map((a) => opts.redact(a)),
      pid: child?.pid ?? null,
      spawnError,
      exitCode,
      signal: signal ?? null,
      timedOut,
      canceled,
      terminationUnconfirmed,
      stdout,
      stderr,
      stdoutTruncated: out.truncated,
      stderrTruncated: err.truncated,
      stdoutBytes: out.total,
      stderrBytes: err.total,
      snapshot,
      outcome: classifyOutcome(facts),
    });
  };

  const killTree = (proc: ChildProcess): void => {
    const pid = proc.pid;
    if (pid === undefined) return;
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { shell: false, stdio: "ignore", windowsHide: true });
      killer.on("error", () => {
        try {
          proc.kill();
        } catch {
          // Already gone.
        }
      });
      return;
    }
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        proc.kill("SIGTERM");
      } catch {
        // Already gone.
      }
    }
    setTimeout(() => {
      if (finished) return;
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }, graceMs).unref();
  };

  const terminate = (): void => {
    if (terminating || finished || child === null) return;
    terminating = true;
    killTree(child);
    confirmTimer = setTimeout(() => {
      if (finished) return;
      terminationUnconfirmed = true;
      finish(null, null);
    }, confirmMs);
  };

  try {
    child = spawn(opts.command.executable, opts.command.args, {
      cwd: opts.cwd,
      env: (opts.env ?? buildChildEnv()) as NodeJS.ProcessEnv,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
  } catch (e) {
    spawnError = errorCode(e);
    queueMicrotask(() => finish(null, null));
    return { cancel: () => undefined, result };
  }

  const proc = child;
  proc.on("error", (e) => {
    if (proc.pid === undefined) {
      spawnError = errorCode(e);
      finish(null, null);
    }
  });
  proc.stdout?.on("data", (chunk: Buffer) => {
    out.push(chunk);
    lines.write(decoder.write(chunk));
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    err.push(chunk);
  });
  proc.on("close", (code, signal) => finish(code, signal));

  if (proc.pid !== undefined) opts.onStarted?.({ pid: proc.pid, startedAt: startedAtDate.toISOString() });

  timeoutTimer = setTimeout(() => {
    if (finished) return;
    timedOut = true;
    terminate();
  }, opts.timeoutMs);

  return {
    cancel: () => {
      if (finished) return;
      canceled = true;
      terminate();
    },
    result,
  };
}
