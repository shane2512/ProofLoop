import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { resolveManagedTestPath } from "../security/paths";

/** Test files are small hand-written Markdown. Anything larger is refused rather than read. */
export const MAX_TEST_FILE_BYTES = 1024 * 1024;

export interface ManagedTestFile {
  absolutePath: string;
  sha256: string;
}

/**
 * Resolves a mapped test file inside the managed root (traversal and symlink checks), requires a
 * regular file of reasonable size, and returns its SHA-256. Returns null for any problem, so callers
 * can treat "cannot be verified" and "missing" the same way.
 */
export function readManagedTestFile(testsDir: string, relativeTestFile: string): ManagedTestFile | null {
  try {
    const absolutePath = resolveManagedTestPath(testsDir, relativeTestFile);
    const stat = fs.statSync(absolutePath, { throwIfNoEntry: false });
    if (!stat || !stat.isFile() || stat.size > MAX_TEST_FILE_BYTES) return null;
    const sha256 = createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
    return { absolutePath, sha256 };
  } catch {
    return null;
  }
}

export function hashManagedTestFile(testsDir: string, relativeTestFile: string): string | null {
  return readManagedTestFile(testsDir, relativeTestFile)?.sha256 ?? null;
}
