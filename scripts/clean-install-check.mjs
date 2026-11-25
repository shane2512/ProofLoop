// Phase 8: proves the committed repository installs and passes from nothing. Clones the repo (committed
// files only) into a temp folder, then runs npm ci, lint, typecheck, tests and the production build there.
// Never starts Kane. Windows (cmd) only, like the rest of the setup.
//   node scripts/clean-install-check.mjs [outFile]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.resolve(app, process.argv[2] ?? "docs/phase8-clean-install.json");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-clean-"));
const dir = path.join(work, "proofloop");
const steps = [];

function step(name, cmd, args, cwd, timeout = 900_000) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: false, timeout, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  // Paths in the saved result are replaced so the file can be published without local folder names.
  const shown = [cmd, ...args].join(" ").split(app).join("<repo>").split(work).join("<temp folder>");
  const entry = { name, command: shown, exitCode: r.status, seconds: Math.round((Date.now() - t0) / 1000), tail: out.trim().split(/\r?\n/).slice(-6) };
  steps.push(entry);
  console.log(`${r.status === 0 ? "PASS" : "FAIL"} ${name} (${entry.seconds}s)`);
  return r.status === 0;
}

let ok = step("clone committed files", "git", ["clone", "--quiet", app, dir], work);
const head = ok ? spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim() : null;
const npm = (name, ...args) => (ok = ok && step(name, "cmd", ["/c", "npm", ...args], dir));
npm("npm ci", "ci");
npm("lint", "run", "lint");
npm("typecheck", "run", "typecheck");
npm("tests (no Kane, no credits)", "test");
npm("production build", "run", "build");

fs.writeFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), commit: head, node: process.version, ok, steps }, null, 2));
try {
  fs.rmSync(work, { recursive: true, force: true });
} catch {
  // Windows may keep a handle briefly; the folder is in the OS temp directory.
}
console.log(ok ? "DONE all steps passed" : "DONE with failures");
process.exitCode = ok ? 0 : 1;
