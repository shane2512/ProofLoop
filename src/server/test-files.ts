import "server-only";
import fs from "node:fs";
import path from "node:path";
import { AppError } from "./errors";
import { resolveManagedTestPath } from "./security/paths";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SUFFIX = "_test.md";

/** Kept below the 64 KiB request cap so the JSON envelope always fits. */
export const MAX_TEST_CONTENT_BYTES = 48 * 1024;

export interface TestFileEntry {
  /** The name without the `_test.md` suffix. */
  name: string;
  /** The managed-relative path to store in a criterion's `testFile`. */
  testFile: string;
  sizeBytes: number;
  modifiedAt: string;
}

function invalid(field: string, message: string): AppError {
  return new AppError("VALIDATION_ERROR", message, 400, { field });
}

export function validateTestName(name: unknown): string {
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    throw invalid("name", "name must be 1 to 64 letters, digits, '-' or '_', and start with a letter or digit.");
  }
  return name;
}

export function parseTestFileWrite(body: unknown): string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AppError("VALIDATION_ERROR", "Request body must be a JSON object.", 400);
  }
  const rec = body as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (key !== "content") throw invalid(key, `Unknown field: ${key}.`);
  }
  const content = rec.content;
  if (typeof content !== "string") throw invalid("content", "content must be a string.");
  if (content.trim().length === 0) throw invalid("content", "content is required.");
  if (content.includes("\0")) throw invalid("content", "content contains an invalid character.");
  if (Buffer.byteLength(content, "utf8") > MAX_TEST_CONTENT_BYTES) {
    throw invalid("content", `content must be at most ${MAX_TEST_CONTENT_BYTES} bytes.`);
  }
  return content;
}

/**
 * Reads and writes `_test.md` files inside the managed tests root, one folder per project.
 * Names are restricted and paths go through the same traversal and symlink checks as criterion
 * mappings (SEC-003). Test files are trusted code (SEC-010), so this is a local-user feature only.
 */
export class TestFileStore {
  constructor(private readonly testsDir: string) {}

  private pathFor(projectId: string, name: string): string {
    return resolveManagedTestPath(this.testsDir, `${projectId}/${validateTestName(name)}${SUFFIX}`);
  }

  list(projectId: string): TestFileEntry[] {
    const dir = path.join(path.resolve(this.testsDir), projectId);
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return [];
    }
    const out: TestFileEntry[] = [];
    for (const file of names) {
      if (!file.endsWith(SUFFIX)) continue;
      const stem = file.slice(0, -SUFFIX.length);
      if (!NAME_RE.test(stem)) continue;
      try {
        const stat = fs.lstatSync(path.join(dir, file));
        if (!stat.isFile()) continue;
        out.push({ name: stem, testFile: `${projectId}/${file}`, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() });
      } catch {
        // Vanished between readdir and lstat.
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  read(projectId: string, name: string): TestFileEntry & { content: string } {
    const abs = this.pathFor(projectId, name);
    try {
      const stat = fs.statSync(abs);
      if (!stat.isFile() || stat.size > MAX_TEST_CONTENT_BYTES * 2) throw new Error("unreadable");
      return {
        name,
        testFile: `${projectId}/${name}${SUFFIX}`,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        content: fs.readFileSync(abs, "utf8"),
      };
    } catch {
      throw new AppError("NOT_FOUND", "Test file not found.", 404);
    }
  }

  write(projectId: string, name: string, content: string): TestFileEntry {
    const abs = this.pathFor(projectId, name);
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true, mode: 0o700 });
      fs.writeFileSync(abs, content, { encoding: "utf8", mode: 0o600 });
      const stat = fs.statSync(abs);
      return { name, testFile: `${projectId}/${name}${SUFFIX}`, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError("STORAGE_ERROR", "The test file could not be saved.", 500);
    }
  }
}
