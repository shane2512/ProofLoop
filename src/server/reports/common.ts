import type { RunStatus } from "../domain/types";
import type { KaneStreamSnapshot } from "../kane/parser";

/** Facts about a run that reports state in plain words. Only statuses a finished run can have. */
export const RUN_STATUS_TEXT: Record<RunStatus, string> = {
  PASSED: "Kane exited 0 and reported a passing final result.",
  FAILED: "Kane reported that the test failed.",
  NOT_STARTED: "Kane could not start the test.",
  TIMED_OUT: "ProofLoop stopped the run at its time limit, so no result was established.",
  CANCELED: "The run was canceled before it finished.",
  UNKNOWN: "The run ended without a clear result from Kane.",
  QUEUED: "The run has not started.",
  RUNNING: "The run is still in progress.",
};

export const EXCERPT_LINES = 25;
export const EXCERPT_LINE_CHARS = 500;

/** Narrows the stored parser snapshot (kept as unknown in the run record) without trusting its shape further than needed. */
export function asKaneSnapshot(value: unknown): KaneStreamSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Partial<KaneStreamSnapshot>;
  if (typeof v.parserVersion !== "string" || !Array.isArray(v.steps) || !Array.isArray(v.assertions)) return null;
  return v as KaneStreamSnapshot;
}

/**
 * Keeps only the part of the recorded argv a reader needs: from the `testmd` subcommand on, with any
 * path argument reduced to its file name. Absolute local paths never appear in a report.
 */
export function describeCommand(command: string[] | null): string | null {
  if (!command) return null;
  const i = command.indexOf("testmd");
  if (i < 0) return null;
  return ["kane-cli", ...command.slice(i).map((a) => (/[\\/]/.test(a) ? (a.split(/[\\/]/).pop() ?? a) : a))].join(" ");
}

export interface Excerpt {
  /** The last lines, each cut to a fixed width. */
  text: string;
  shownLines: number;
  totalLines: number;
}

/** The last `EXCERPT_LINES` non-empty lines. Deterministic: no scoring or guessing about relevance. */
export function tailExcerpt(text: string): Excerpt {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const tail = lines.slice(-EXCERPT_LINES).map((l) => (l.length > EXCERPT_LINE_CHARS ? `${l.slice(0, EXCERPT_LINE_CHARS)} ...[line cut at ${EXCERPT_LINE_CHARS} characters]` : l));
  return { text: tail.join("\n"), shownLines: tail.length, totalLines: lines.length };
}

/** A fenced block whose fence is longer than any backtick run inside, so captured output cannot close it early. */
export function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}\n${text}\n${fence}`;
}

export function formatMs(ms: number | null): string {
  if (ms === null) return "Not available";
  if (ms < 1000) return `${ms} ms`;
  return `${Math.round(ms / 100) / 10} s`;
}

/**
 * Replaces ProofLoop's own data folder with `<DATA>` in every spelling it can take in saved output:
 * as written, with the home folder already shown as `<HOME>`, with forward slashes, and JSON-escaped
 * (single and double). Reports and exports never reveal where on disk the data lives.
 */
export function scrubDataDir(text: string, dataDir: string, homeDir: string): string {
  const spellings = new Set<string>();
  const bases = [dataDir];
  if (homeDir.length > 3 && dataDir.toLowerCase().startsWith(homeDir.toLowerCase())) bases.push(`<HOME>${dataDir.slice(homeDir.length)}`);
  for (const b of bases) {
    spellings.add(b);
    spellings.add(b.replace(/\\/g, "/"));
    spellings.add(b.replace(/\\/g, "\\\\"));
    spellings.add(b.replace(/\\/g, "\\\\\\\\"));
  }
  let out = text;
  for (const s of [...spellings].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), process.platform === "win32" ? "gi" : "g"), "<DATA>");
  }
  return out;
}

export function reportFileName(runId: string, ext: "md" | "json"): string {
  return `proofloop-report-${runId.slice(0, 8)}.${ext}`;
}
