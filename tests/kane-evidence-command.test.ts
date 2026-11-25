import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverEvidencePack, discoverRunEvidence, extractEvidenceIdFromStderr, importEvidencePack } from "@/server/kane/evidence";
import { buildKaneRunCommand, resolveKaneLaunch } from "@/server/kane/command";
import { AppError } from "@/server/errors";

// Label: ProofLoop application test (filesystem and argv construction). Not Kane verification.
const ID = "2ea337ce-92f8-468e-af86-b8a22daa2002";
const RUN = "7b4f1f53-7d5a-4f5d-86d8-789f4c2b7e10";

describe("evidence discovery and import", () => {
  let tmp: string;
  let work: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-ev-"));
    work = path.join(tmp, "work");
    fs.mkdirSync(path.join(work, ".testmuai", "evidence"), { recursive: true });
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const packPath = () => path.join(work, ".testmuai", "evidence", `${ID}.evidence`);

  it("reports unavailable with a reason when no id was reported or the id is malformed", () => {
    expect(discoverEvidencePack(work, null)).toMatchObject({ available: false, absolutePath: null });
    expect(discoverEvidencePack(work, "../../etc/passwd")).toMatchObject({ available: false });
  });

  it("reports unavailable when the file is missing, never guessing a path", () => {
    const d = discoverEvidencePack(work, ID);
    expect(d).toMatchObject({ available: false, absolutePath: null });
    expect(d.unavailableReason).toMatch(/not found/);
  });

  it("rejects a file that is not a zip", () => {
    fs.writeFileSync(packPath(), "not a zip");
    expect(discoverEvidencePack(work, ID).available).toBe(false);
  });

  it("accepts a regular file with a zip signature and imports it without overwriting", () => {
    fs.writeFileSync(packPath(), Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("payload")]));
    const d = discoverEvidencePack(work, ID);
    expect(d.available).toBe(true);
    expect(d.sizeBytes).toBe(11);

    const root = path.join(tmp, "evidence");
    const imported = importEvidencePack(d, root, RUN, ID);
    expect(imported.relativePath).toBe(`${RUN}/${ID}.evidence`);
    expect(fs.statSync(path.join(root, ...imported.relativePath.split("/"))).size).toBe(11);
    expect(() => importEvidencePack(d, root, RUN, ID)).toThrow();
  });

  it("refuses to import an unavailable pack or bad identifiers", () => {
    const missing = discoverEvidencePack(work, "00000000-0000-4000-8000-000000000000");
    expect(() => importEvidencePack(missing, path.join(tmp, "e2"), RUN, ID)).toThrow();
    const ok = discoverEvidencePack(work, ID);
    expect(() => importEvidencePack(ok, path.join(tmp, "e3"), "../x", ID)).toThrow();
  });
});

describe("run evidence discovery fallback chain", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  let tmp: string;
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("x")]);
  const mk = (name: string, ids: string[]) => {
    const work = path.join(tmp, name);
    fs.mkdirSync(path.join(work, ".testmuai", "evidence"), { recursive: true });
    for (const id of ids) fs.writeFileSync(path.join(work, ".testmuai", "evidence", `${id}.evidence`), zip);
    return work;
  };
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-evchain-"));
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("extracts the id from Kane's stderr hint, with or without the redacted path", () => {
    expect(extractEvidenceIdFromStderr(`x\nevidence: view locally with \`kane-cli evidence serve <HOME>\\.testmuai\\s\\evidence\\${A}.evidence\`\n`)).toBe(A);
    expect(extractEvidenceIdFromStderr("nothing here")).toBeNull();
  });

  it("prefers the event id", () => {
    const r = discoverRunEvidence(mk("w1", [A, B]), A, `kane-cli evidence serve ${B}.evidence`);
    expect(r).toMatchObject({ available: true, evidenceId: A, source: "kane_event" });
  });

  it("falls back to the stderr hint when the event is missing", () => {
    const r = discoverRunEvidence(mk("w2", [A, B]), null, `kane-cli evidence serve C:\\x\\${B}.evidence`);
    expect(r).toMatchObject({ available: true, evidenceId: B, source: "kane_stderr_hint" });
  });

  it("falls back to the only pack in a per-run directory", () => {
    const r = discoverRunEvidence(mk("w3", [A]), null, "");
    expect(r).toMatchObject({ available: true, evidenceId: A, source: "sole_pack_in_run_dir" });
  });

  it("refuses to choose between several packs", () => {
    const r = discoverRunEvidence(mk("w4", [A, B]), null, "");
    expect(r.available).toBe(false);
    expect(r.source).toBe("none");
    expect(r.unavailableReason).toMatch(/More than one/);
  });

  it("reports unavailable when nothing exists, and does not trust an id with no file", () => {
    expect(discoverRunEvidence(mk("w5", []), null, "")).toMatchObject({ available: false, source: "none" });
    expect(discoverRunEvidence(mk("w6", []), A, "")).toMatchObject({ available: false, source: "none" });
  });
});

describe("Kane command construction", () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof AppError ? e.code : "OTHER";
    }
    return "NO_ERROR";
  };

  it("builds exactly one fixed argv shape", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-cmd-"));
    try {
      const file = path.join(tmp, "a_test.md");
      fs.writeFileSync(file, "x");
      const cmd = buildKaneRunCommand({ executable: "node", prefixArgs: ["entry.cjs"] }, file);
      expect(cmd).toEqual({ executable: "node", args: ["entry.cjs", "testmd", "run", file, "--agent", "--headless"] });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects relative, wrong-suffix and missing test files", () => {
    const launch = { executable: "node", prefixArgs: [] };
    expect(code(() => buildKaneRunCommand(launch, "relative_test.md"))).toBe("TEST_MAPPING_INVALID");
    expect(code(() => buildKaneRunCommand(launch, path.join(os.tmpdir(), "x.md")))).toBe("TEST_MAPPING_INVALID");
    expect(code(() => buildKaneRunCommand(launch, path.join(os.tmpdir(), "missing-xyz_test.md")))).toBe("TEST_MAPPING_INVALID");
  });

  it("refuses .cmd and .bat launchers and returns null for a missing path", () => {
    expect(code(() => resolveKaneLaunch("C:\\x\\kane-cli.cmd"))).toBe("PREREQUISITE_FAILED");
    expect(code(() => resolveKaneLaunch("C:\\x\\kane.BAT"))).toBe("PREREQUISITE_FAILED");
    expect(resolveKaneLaunch(path.join(os.tmpdir(), "no-such-kane.cjs"))).toBeNull();
  });

  it("runs a configured .cjs under the current Node binary", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-launch-"));
    try {
      const entry = path.join(tmp, "kane-cli.cjs");
      fs.writeFileSync(entry, "");
      expect(resolveKaneLaunch(entry)).toEqual({ executable: process.execPath, prefixArgs: [entry] });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("finds the Windows npm entry only when it exists", () => {
    expect(resolveKaneLaunch(null, { APPDATA: path.join(os.tmpdir(), "no-appdata-xyz") }, "win32")).toBeNull();
    expect(resolveKaneLaunch(null, {}, "win32")).toBeNull();
    expect(resolveKaneLaunch(null, {}, "linux")).toEqual({ executable: "kane-cli", prefixArgs: [] });
  });
});
