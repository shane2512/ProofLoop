// Phase 0 probe: does `taskkill /T /F` on the Kane process remove its headless Chrome? Not part of the app.
// Uses the cached passing test, so the run is a replay and consumes no authoring credits.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const entry = path.join(process.env.APPDATA, "npm", "node_modules", "@testmuai", "kane-cli", "bin", "kane-cli.cjs");
const out = path.resolve("docs", "phase0-raw", "cancel1.json");

function kaneChrome() {
  // Only headless Chrome instances: the developer's normal Chrome windows are never counted or touched.
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -match '--headless' } | Select-Object -ExpandProperty ProcessId"],
    { encoding: "utf8", shell: false },
  );
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map(Number);
}
const alive = (pid) => spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8", shell: false }).stdout.includes(String(pid));

const before = kaneChrome();
const child = spawn(process.execPath, [entry, "testmd", "run", "tests/kane-smoke/login_pass_test.md", "--agent", "--headless"], {
  shell: false,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
child.stdout.resume();
child.stderr.resume();
let closed = null;
child.on("close", (code, signal) => { closed = { code, signal }; });

setTimeout(() => {
  const during = kaneChrome().filter((p) => !before.includes(p));
  const kill = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { encoding: "utf8", shell: false });
  setTimeout(() => {
    const afterAll = kaneChrome().filter((p) => !before.includes(p));
    const survivors = during.filter((p) => alive(p));
    fs.writeFileSync(out, JSON.stringify({
      kanePid: child.pid,
      headlessChromeBeforeStart: before.length,
      newHeadlessChromeDuringRun: during.length,
      taskkillExit: kill.status,
      taskkillStdout: kill.stdout.trim().split(/\r?\n/).slice(0, 3),
      kaneClosedAfterKill: closed,
      newHeadlessChromeStillAliveAfterKill: survivors.length,
      anyNewHeadlessChromeAfter: afterAll.length,
    }, null, 2));
    process.exit(0);
  }, 6000);
}, 22000);
