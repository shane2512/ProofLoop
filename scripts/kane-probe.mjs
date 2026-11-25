// Phase 0 validation probe. Not part of the app. Spawns Kane with shell:false using the
// same approach the Phase 3 runner is expected to use, and records the outcome.
// Usage: node scripts/kane-probe.mjs <label> <path-to-_test.md>
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [label, testFile] = process.argv.slice(2);
if (!label || !testFile) {
  console.error("usage: node scripts/kane-probe.mjs <label> <path-to-_test.md>");
  process.exit(64);
}
const appData = process.env.APPDATA;
const entry = path.join(appData, "npm", "node_modules", "@testmuai", "kane-cli", "bin", "kane-cli.cjs");
const outDir = path.resolve("docs", "phase0-raw");
fs.mkdirSync(outDir, { recursive: true });
const so = fs.createWriteStream(path.join(outDir, `${label}.stdout`));
const se = fs.createWriteStream(path.join(outDir, `${label}.stderr`));

const argv = [entry, "testmd", "run", testFile, "--agent", "--headless"];
const startedAt = new Date();
const t0 = process.hrtime.bigint();
const child = spawn(process.execPath, argv, { shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let bytesOut = 0;
let bytesErr = 0;
child.stdout.on("data", (b) => { bytesOut += b.length; so.write(b); });
child.stderr.on("data", (b) => { bytesErr += b.length; se.write(b); });
child.on("error", (e) => fs.writeFileSync(path.join(outDir, `${label}.meta.json`), JSON.stringify({ spawnError: e.code ?? e.name })));
child.on("close", (code, signal) => {
  const ms = Number((process.hrtime.bigint() - t0) / 1_000_000n);
  so.end();
  se.end();
  fs.writeFileSync(
    path.join(outDir, `${label}.meta.json`),
    JSON.stringify({ label, testFile, argvAfterEntry: argv.slice(1), startedAt: startedAt.toISOString(), durationMs: ms, exitCode: code, signal, bytesOut, bytesErr, pid: child.pid }, null, 2),
  );
});
