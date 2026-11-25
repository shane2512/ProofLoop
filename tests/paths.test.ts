import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveManagedTestPath } from "@/server/security/paths";
import { AppError } from "@/server/errors";

// Label: ProofLoop application test (not Kane verification).
describe("resolveManagedTestPath", () => {
  let tmp: string;
  let root: string;
  let outside: string;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-paths-"));
    root = path.join(tmp, "tests");
    outside = path.join(tmp, "outside");
    fs.mkdirSync(path.join(root, "real"), { recursive: true });
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "secret_test.md"), "x");
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("resolves a path inside the root even when the file does not exist yet", () => {
    expect(resolveManagedTestPath(root, "real/new_test.md")).toBe(path.join(root, "real", "new_test.md"));
  });

  it("rejects traversal", () => {
    expect(() => resolveManagedTestPath(root, "../outside/secret_test.md")).toThrow(AppError);
  });

  it("rejects a directory link that escapes the root", (ctx) => {
    const link = path.join(root, "escape");
    try {
      // 'junction' works on Windows without elevation; it is ignored on POSIX.
      fs.symlinkSync(outside, link, "junction");
    } catch {
      ctx.skip(); // Reported as skipped, not passed, when links cannot be created.
      return;
    }
    expect(() => resolveManagedTestPath(root, "escape/secret_test.md")).toThrow(/symbolic link/);
  });

  it("rejects a file symlink", (ctx) => {
    const link = path.join(root, "real", "linked_test.md");
    try {
      fs.symlinkSync(path.join(outside, "secret_test.md"), link, "file");
    } catch {
      ctx.skip(); // File symlinks need privileges on Windows.
      return;
    }
    expect(() => resolveManagedTestPath(root, "real/linked_test.md")).toThrow(/symbolic link/);
  });
});
