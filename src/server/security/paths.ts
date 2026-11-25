import fs from "node:fs";
import path from "node:path";
import { AppError } from "../errors";

const SUFFIX = "_test.md";
const MAX_PATH_LENGTH = 260;

function fail(message: string): AppError {
  return new AppError("VALIDATION_ERROR", message, 400, { field: "testFile" });
}

/**
 * Syntax-only check of a managed-relative test path (FR-003, SEC-003).
 * Accepts forward-slash relative paths only. Returns the normalized path.
 */
export function validateTestFileSyntax(value: unknown): string {
  if (typeof value !== "string") throw fail("testFile must be a string.");
  const v = value.trim();
  if (v.length === 0) throw fail("testFile is required.");
  if (v.length > MAX_PATH_LENGTH) throw fail(`testFile must be at most ${MAX_PATH_LENGTH} characters.`);
  if (v.includes("\0")) throw fail("testFile contains an invalid character.");
  if (v.includes("\\")) throw fail("testFile must use forward slashes.");
  if (v.startsWith("/") || /^[A-Za-z]:/.test(v) || v.includes(":")) {
    throw fail("testFile must be a relative path inside the managed test directory.");
  }
  const segments = v.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") throw fail("testFile must not contain empty, '.' or '..' segments.");
    if (/[<>"|?*\u0000-\u001f]/.test(seg) || /[. ]$/.test(seg)) throw fail("testFile contains an invalid path segment.");
  }
  const base = segments[segments.length - 1] ?? "";
  if (!base.endsWith(SUFFIX) || base.length === SUFFIX.length) {
    throw fail(`testFile must end with ${SUFFIX} and have a name before the suffix.`);
  }
  return segments.join("/");
}

/**
 * Resolves a managed test path under `root` and rejects traversal and any existing
 * symlink or junction on the way (SEC-003). The file need not exist yet.
 * Returns the absolute path.
 */
export function resolveManagedTestPath(root: string, relative: unknown): string {
  const normalized = validateTestFileSyntax(relative);
  const rootAbs = path.resolve(root);
  const segments = normalized.split("/");
  const abs = path.resolve(rootAbs, ...segments);

  const rel = path.relative(rootAbs, abs);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw fail("testFile resolves outside the managed test directory.");
  }

  let current = rootAbs;
  for (const seg of segments) {
    current = path.join(current, seg);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") break;
      throw fail("testFile could not be checked.");
    }
    if (stat.isSymbolicLink()) throw fail("testFile must not pass through a symbolic link.");
  }
  return abs;
}
