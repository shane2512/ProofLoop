import fs from "node:fs";
import path from "node:path";
import type { EvidenceRefDto } from "../verification";

/**
 * Returns the absolute path of a stored evidence file only if it is still a regular file inside the
 * evidence folder right now. Anything else (moved, deleted, a symlink, a path that escapes) is null.
 */
export function resolveEvidenceFile(evidenceDir: string, relativePath: string): string | null {
  const root = path.resolve(evidenceDir);
  const abs = path.resolve(root, relativePath);
  const within = path.relative(root, abs);
  if (within === "" || within.startsWith("..") || path.isAbsolute(within)) return null;
  try {
    const stat = fs.lstatSync(abs);
    return stat.isFile() ? abs : null;
  } catch {
    return null;
  }
}

/**
 * Re-checks each evidence reference against the disk. A file that was verified when the run finished but
 * has since gone is reported unavailable, so no screen, report or export links to something that is not there.
 */
export function verifyEvidence(evidenceDir: string, refs: EvidenceRefDto[]): EvidenceRefDto[] {
  return refs.map((e) => {
    if (!e.available || !e.relativePath) return e;
    if (resolveEvidenceFile(evidenceDir, e.relativePath)) return e;
    return { ...e, available: false, relativePath: null, unavailableReason: "The file was verified when the run finished but is no longer on disk." };
  });
}
