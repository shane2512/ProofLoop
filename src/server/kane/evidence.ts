import "server-only";
import fs from "node:fs";
import path from "node:path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export interface DiscoveredPack {
  available: boolean;
  /** Absolute path, server-internal. Never sent to a client or stored without verification. */
  absolutePath: string | null;
  sizeBytes: number | null;
  unavailableReason: string | null;
}

const unavailable = (reason: string): DiscoveredPack => ({ available: false, absolutePath: null, sizeBytes: null, unavailableReason: reason });

/**
 * Finds the sealed evidence pack for a run (FR-013). Kane writes it to
 * `<cwd>/.testmuai/evidence/<evidence_id>.evidence` (validated on 0.10.9). The id comes from the
 * `test_md_evidence_ingest` event. The path is only returned if a readable regular file with a zip
 * signature exists there. Nothing is guessed.
 */
export function discoverEvidencePack(workDir: string, evidenceId: string | null): DiscoveredPack {
  if (evidenceId === null) return unavailable("Kane did not report an evidence id for this run.");
  if (!UUID_RE.test(evidenceId)) return unavailable("Reported evidence id was not a valid identifier.");

  const dir = path.join(path.resolve(workDir), ".testmuai", "evidence");
  const file = path.join(dir, `${evidenceId.toLowerCase()}.evidence`);
  try {
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink() || !st.isFile()) return unavailable("Evidence path is not a regular file.");
    const fd = fs.openSync(file, "r");
    try {
      const head = Buffer.alloc(4);
      fs.readSync(fd, head, 0, 4, 0);
      if (!head.equals(ZIP_MAGIC)) return unavailable("Evidence file is not a sealed zip pack.");
    } finally {
      fs.closeSync(fd);
    }
    return { available: true, absolutePath: file, sizeBytes: st.size, unavailableReason: null };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return unavailable("Evidence pack was not found at the expected location.");
    if (code === "EACCES" || code === "EPERM") return unavailable("Evidence pack exists but is not readable.");
    return unavailable("Evidence pack could not be checked.");
  }
}

export type EvidenceSource = "kane_event" | "kane_stderr_hint" | "sole_pack_in_run_dir" | "none";

export interface RunEvidence extends DiscoveredPack {
  evidenceId: string | null;
  source: EvidenceSource;
}

const STDERR_HINT_RE = /kane-cli evidence serve [^\r\n]*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.evidence/i;

/** Pulls the pack id out of Kane's stderr hint line. Returns null when the line is absent. */
export function extractEvidenceIdFromStderr(stderr: string): string | null {
  const m = STDERR_HINT_RE.exec(stderr);
  return m?.[1] ? m[1].toLowerCase() : null;
}

/**
 * Finds the evidence pack for one run, trying independent sources in order and verifying each on disk.
 * Phase 0/3 found that `test_md_evidence_ingest` is not always emitted (docs/phase0-findings.md), while the
 * pack was still written, so the order is: the event id, the stderr hint id, then the only pack present.
 *
 * `workDir` MUST be unique to this run. The last rule is only sound because nothing else writes there.
 * Two or more packs in the directory are treated as ambiguous and nothing is returned.
 */
export function discoverRunEvidence(workDir: string, eventId: string | null, stderr: string): RunEvidence {
  const attempts: Array<[EvidenceSource, string | null]> = [
    ["kane_event", eventId],
    ["kane_stderr_hint", extractEvidenceIdFromStderr(stderr)],
  ];
  let firstReason: string | null = null;
  for (const [source, id] of attempts) {
    if (id === null) continue;
    const found = discoverEvidencePack(workDir, id);
    if (found.available) return { ...found, evidenceId: id.toLowerCase(), source };
    firstReason ??= found.unavailableReason;
  }

  const dir = path.join(path.resolve(workDir), ".testmuai", "evidence");
  let packs: string[] = [];
  try {
    packs = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".evidence") && UUID_RE.test(f.slice(0, -".evidence".length)));
  } catch {
    // Directory missing or unreadable: reported below.
  }
  if (packs.length === 1) {
    const id = (packs[0] as string).slice(0, -".evidence".length).toLowerCase();
    const found = discoverEvidencePack(workDir, id);
    if (found.available) return { ...found, evidenceId: id, source: "sole_pack_in_run_dir" };
    firstReason ??= found.unavailableReason;
  }
  const reason =
    packs.length > 1
      ? "More than one evidence pack was found for this run, so none was chosen."
      : (firstReason ?? "No evidence pack was reported or found for this run.");
  return { available: false, absolutePath: null, sizeBytes: null, unavailableReason: reason, evidenceId: null, source: "none" };
}

export interface ImportedPack {
  /** Path relative to the evidence root, safe to store in the database. */
  relativePath: string;
  sizeBytes: number;
}

/**
 * Copies a discovered pack into `<evidenceRoot>/<runId>/<evidenceId>.evidence` and verifies the copy.
 * Never overwrites. Throws on any failure so the caller can record the evidence as unavailable.
 */
export function importEvidencePack(source: DiscoveredPack, evidenceRoot: string, runId: string, evidenceId: string): ImportedPack {
  if (!source.available || source.absolutePath === null) throw new Error("No verified evidence pack to import.");
  if (!UUID_RE.test(runId) || !UUID_RE.test(evidenceId)) throw new Error("Invalid identifier.");

  const rel = path.join(runId.toLowerCase(), `${evidenceId.toLowerCase()}.evidence`);
  const rootAbs = path.resolve(evidenceRoot);
  const dest = path.resolve(rootAbs, rel);
  if (path.relative(rootAbs, dest).startsWith("..")) throw new Error("Destination escapes the evidence root.");

  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  fs.copyFileSync(source.absolutePath, dest, fs.constants.COPYFILE_EXCL);
  const size = fs.statSync(dest).size;
  if (size !== source.sizeBytes) {
    fs.rmSync(dest, { force: true });
    throw new Error("Copied evidence size did not match the source.");
  }
  return { relativePath: rel.split(path.sep).join("/"), sizeBytes: size };
}
