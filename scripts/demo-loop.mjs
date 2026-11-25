// The closed-loop demo: failure -> report -> fix -> pass, with REAL Kane runs (uses credits, and Kane uploads
// each run to your TestMu Test Manager). Starts its own demo shop (:4100) and ProofLoop (:3100) and stops them.
//
//   node scripts/demo-loop.mjs fail   Preflight the shop, create the project, run Kane, save the report.
//   (a person or coding agent reads the report and fixes demo/shop/server.mjs)
//   node scripts/demo-loop.mjs pass   Preflight, run Kane again, save the report and the comparison.
//
// State lives in data/demo-loop (gitignored). Output goes to docs/demo/closed-loop/.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const phase = process.argv[2];
if (!["fail", "pass", "export"].includes(phase)) throw new Error("usage: node scripts/demo-loop.mjs fail|pass|export");
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(app, "data", "demo-loop");
const outDir = path.join(app, "docs", "demo", "closed-loop");
const stateFile = path.join(dataDir, "state.json");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
const PL = "http://127.0.0.1:3100";
const SHOP = "http://127.0.0.1:4100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);

const children = [];
function stop() {
  for (const c of children) spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { shell: false });
}
process.on("exit", stop);

async function up(url) {
  try {
    return (await fetch(url)).status;
  } catch {
    return 0;
  }
}
for (const u of [PL + "/api/v1/health", SHOP + "/"]) if ((await up(u)) !== 0) throw new Error(`${u} is already in use; not touching it.`);

children.push(spawn(process.execPath, [path.join(app, "demo", "shop", "server.mjs"), "4100"], { cwd: app, stdio: "ignore", shell: false, windowsHide: true }));
children.push(
  spawn(process.execPath, [path.join(app, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", "3100"], {
    cwd: app,
    env: { ...process.env, PROOFLOOP_DATA_DIR: dataDir, PROOFLOOP_PORT: "3100" },
    stdio: "ignore",
    shell: false,
    windowsHide: true,
  }),
);
for (let i = 0; i < 80 && ((await up(PL + "/api/v1/health")) === 0 || (await up(SHOP + "/")) === 0); i++) await sleep(500);

async function api(method, p, body) {
  const res = await fetch(PL + "/api/v1" + p, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const getText = async (p) => (await fetch(PL + "/api/v1" + p)).text();

// What a person would see in the browser, checked before spending any Kane credits.
async function preflight() {
  const login = await fetch(SHOP + "/");
  const loginOk = login.status === 200 && (await login.text()).includes("Login");
  const post = await fetch(SHOP + "/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "user=standard_user&password=secret_sauce", redirect: "manual" });
  const target = post.headers.get("location");
  const landed = target ? await fetch(new URL(target, SHOP)) : null;
  const html = landed && landed.status === 200 ? await landed.text() : "";
  const works = loginOk && html.includes("<h1>Products</h1>") && html.includes("Add to cart");
  return { loginOk, redirect: target, landedStatus: landed?.status ?? null, works };
}

try {
  if (phase === "export") {
    // Re-save the reports from the stored records. Starts no Kane run and needs no shop.
    const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    for (const [i, r] of saved.runs.entries()) {
      const step = `${String(i + 1).padStart(2, "0")}-${r.phase}`;
      fs.writeFileSync(path.join(outDir, `${step}-report.md`), await getText(`/runs/${r.runId}/report?format=markdown`));
      fs.writeFileSync(path.join(outDir, `${step}-report.json`), await getText(`/runs/${r.runId}/report?format=json`));
      log(`re-exported ${step}`);
    }
    if (saved.runs.length >= 2) {
      fs.writeFileSync(path.join(outDir, "03-compare.json"), JSON.stringify(await api("GET", `/runs/compare?a=${saved.runs[0].runId}&b=${saved.runs[1].runId}`), null, 2));
      log("re-exported compare");
    }
    process.exit(0);
  }
  const pre = await preflight();
  log(`preflight: ${JSON.stringify(pre)}`);
  if (phase === "fail" && pre.works) throw new Error("The demo shop already works; restore the deliberate defect before running the failing phase.");
  if (phase === "pass" && !pre.works) throw new Error("The demo shop is still broken; apply the fix before running the passing phase.");

  let state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : null;
  if (phase === "fail" && !state) {
    const { project } = await api("POST", "/projects", { name: "Demo shop closed loop", targetUrl: SHOP + "/" });
    await api("PUT", `/projects/${project.id}/test-files/login`, { content: fs.readFileSync(path.join(app, "demo", "shop", "login_test.md"), "utf8") });
    const { criterion } = await api("POST", `/projects/${project.id}/criteria`, {
      title: "Login reaches the products page",
      expectedBehavior: "After signing in with the demo account, the browser shows the Products page with a product list and Add to cart buttons.",
      testFile: `${project.id}/login_test.md`,
      stepLabel: "Products page is shown",
    });
    state = { projectId: project.id, criterionId: criterion.id, runs: [] };
  }
  if (!state) throw new Error("Run the fail phase first.");

  const { runId } = await api("POST", `/projects/${state.projectId}/criteria/${state.criterionId}/runs`, {});
  log(`started run ${runId}; waiting for Kane...`);
  const t0 = Date.now();
  let detail;
  for (;;) {
    await sleep(3000);
    detail = await api("GET", `/runs/${runId}`);
    if (!["QUEUED", "RUNNING"].includes(detail.run.status)) break;
    if (Date.now() - t0 > 15 * 60 * 1000) throw new Error("Timed out waiting for the run record.");
  }
  const project = await api("GET", `/projects/${state.projectId}`);
  const criterion = project.criteria[0];
  const step = phase === "fail" ? "01-fail" : "02-pass";
  fs.writeFileSync(path.join(outDir, `${step}-report.md`), await getText(`/runs/${runId}/report?format=markdown`));
  fs.writeFileSync(path.join(outDir, `${step}-report.json`), await getText(`/runs/${runId}/report?format=json`));
  state.runs.push({ phase, runId, status: detail.run.status, exitCode: detail.run.exitCode, durationMs: detail.run.durationMs });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

  const summary = { phase, preflight: pre, run: { id: runId, status: detail.run.status, exitCode: detail.run.exitCode, durationMs: detail.run.durationMs, errorCode: detail.run.errorCode, evidenceAvailable: detail.run.evidenceAvailable }, criterionStatus: criterion.status, kaneFinal: detail.kane?.done?.overallStatus ?? null, waitedSeconds: Math.round((Date.now() - t0) / 1000) };
  if (phase === "pass") {
    const first = state.runs.find((r) => r.phase === "fail");
    if (first) {
      fs.writeFileSync(path.join(outDir, "03-compare.json"), JSON.stringify(await api("GET", `/runs/compare?a=${first.runId}&b=${runId}`), null, 2));
      summary.firstRun = first;
    }
  }
  fs.writeFileSync(path.join(outDir, `${step}-summary.json`), JSON.stringify(summary, null, 2));
  log(JSON.stringify(summary, null, 2));
} catch (err) {
  console.error(String(err?.stack ?? err));
  process.exitCode = 1;
} finally {
  stop();
}
