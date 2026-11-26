// Records the closed-loop demo as a silent screen capture: planted bug -> real Kane failure -> report -> fix -> real Kane pass -> compare.
//
//   node scripts/record-demo.mjs rehearsal   Uses the FAKE Kane test process (no credits). A red banner says so on every frame.
//                                            For checking the recorder only. Never a deliverable.
//   node scripts/record-demo.mjs real        Drives the REAL Kane CLI twice (uses credits; Kane uploads each run to your Test Manager).
//
// Everything shown is the real dashboard. The waits for Kane are NOT recorded; a card says how long each wait really took.
// The step between the report and the second run shows the real change made to the demo shop. Output: vids/demo-recording/.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (!["rehearsal", "real"].includes(mode)) throw new Error("usage: node scripts/record-demo.mjs rehearsal|real");
const REAL = mode === "real";
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(app, "vids", "demo-recording");
const framesDir = path.join(outRoot, `frames-${mode}`);
const dataDir = path.join(app, "data", `video-${mode}`);
const shopFile = path.join(app, "demo", "shop", "server.mjs");
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PL = "http://127.0.0.1:3100";
const SHOP = "http://127.0.0.1:4100";
const DIFF_PORT = 4200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${s}`);
const T0 = Date.now();
const facts = { mode, startedAt: new Date().toISOString(), runs: [], cuts: [], notes: [] };

fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
fs.rmSync(dataDir, { recursive: true, force: true });

// ---- The demo shop: buggy for run 1, fixed for run 2 --------------------------------------------------
const fixedBytes = fs.readFileSync(shopFile); // restored byte-for-byte in `finally`
const gitText = (rev) => execFileSync("git", ["show", `${rev}:demo/shop/server.mjs`], { cwd: app, maxBuffer: 1 << 24 }).toString("utf8").replace(/\r\n/g, "\n");
const buggyText = gitText("48393bb");
const fixedText = gitText("HEAD");
if (buggyText === fixedText || !buggyText.includes('location: "/products"') || !fixedText.includes("location: INVENTORY_PATH")) {
  throw new Error("The demo shop in git is not in the expected buggy/fixed shape; refusing to record.");
}

const children = [];
let shopProc = null;
function killTree(p) {
  if (p?.pid) spawnSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { shell: false });
}
async function up(url) {
  try {
    return (await fetch(url)).status;
  } catch {
    return 0;
  }
}
async function startShop() {
  shopProc = spawn(process.execPath, [shopFile, "4100"], { cwd: app, stdio: "ignore", windowsHide: true });
  for (let i = 0; i < 40 && (await up(SHOP + "/")) === 0; i++) await sleep(250);
}
async function stopShop() {
  killTree(shopProc);
  shopProc = null;
  for (let i = 0; i < 40 && (await up(SHOP + "/")) !== 0; i++) await sleep(250);
}
/** What a person sees in a browser: does login land on the products page? */
async function shopWorks() {
  const post = await fetch(SHOP + "/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "user=standard_user&password=secret_sauce", redirect: "manual" });
  const target = post.headers.get("location");
  const landed = target ? await fetch(new URL(target, SHOP)) : null;
  const html = landed && landed.status === 200 ? await landed.text() : "";
  return { redirect: target, status: landed?.status ?? null, works: html.includes("<h1>Products</h1>") && html.includes("Add to cart") };
}

// ---- A page that shows the real change ---------------------------------------------------------------
function diffHtml() {
  const a = buggyText.split("\n");
  const b = fixedText.split("\n");
  let s = 0;
  while (s < a.length && a[s] === b[s]) s++;
  let ea = a.length - 1;
  let eb = b.length - 1;
  while (ea > s && eb > s && a[ea] === b[eb]) {
    ea--;
    eb--;
  }
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const ctx = 6;
  const rows = [];
  for (let i = Math.max(0, s - ctx); i < s; i++) rows.push(["ctx", i + 1, a[i]]);
  for (let i = s; i <= ea; i++) rows.push(["del", i + 1, a[i]]);
  for (let i = s; i <= eb; i++) rows.push(["add", i + 1, b[i]]);
  for (let i = eb + 1; i < Math.min(b.length, eb + 1 + ctx); i++) rows.push(["ctx", i + 1, b[i]]);
  const body = rows.map(([k, n, t]) => `<div class="${k}"><span class="n">${n}</span><span class="m">${k === "del" ? "-" : k === "add" ? "+" : " "}</span><code>${esc(t) || " "}</code></div>`).join("");
  return `<!doctype html><meta charset="utf-8"><title>The change</title><style>
body{margin:0;background:#070708;color:#e6e6e8;font:15px/1.6 ui-monospace,Consolas,monospace;padding:56px 64px}
h1{font:600 26px system-ui;margin:0 0 6px}p{color:#a3a3aa;font:16px system-ui;margin:0 0 28px;max-width:900px}
.box{border:1px solid #2a2a2f;border-radius:10px;overflow:hidden;background:#0d0d0f}
.hd{padding:10px 16px;border-bottom:1px solid #2a2a2f;color:#a3a3aa}
.box div{display:flex;gap:14px;padding:1px 16px;white-space:pre}.n{width:34px;text-align:right;color:#55555b}.m{width:12px}
.del{background:rgba(255,80,60,.16);color:#ffb4aa}.add{background:rgba(70,200,120,.16);color:#a6f0c3}code{font:inherit}
</style><h1>One change to the demo shop</h1><p>After login the shop sent the browser to a page it does not serve. The change points the redirect at the page that exists. It was made by hand for this recording, after reading the report.</p>
<div class="box"><div class="hd">demo/shop/server.mjs</div>${body}</div>`;
}
const diffServer = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(diffHtml());
});

// ---- ProofLoop API (used only for setup and for waiting; the demo itself is driven through the UI) ----
async function api(method, p, body) {
  const res = await fetch(PL + "/api/v1" + p, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
async function waitTerminal(runId, timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    const d = await api("GET", `/runs/${runId}`);
    if (!["QUEUED", "RUNNING"].includes(d.run.status)) return d;
    if (Date.now() - t0 > timeoutMs) throw new Error("Timed out waiting for the run record.");
    await sleep(1500);
  }
}
const fmtDur = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} seconds` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};

// ---- Chrome + recorder -------------------------------------------------------------------------------
const cdpPort = 9700 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pl-rec-"));
let chrome;
let ws;
let msgId = 0;
const pending = new Map();
const rec = { on: false, frames: [], seg: 0, segStart: {}, segEnd: {}, n: 0 };

function onFrame(p) {
  void send("Page.screencastFrameAck", { sessionId: p.sessionId });
  if (!rec.on) return;
  const t = Math.max(p.metadata.timestamp * 1000, rec.segStart[rec.seg]);
  const file = `f${String(rec.n++).padStart(6, "0")}.jpg`;
  fs.writeFileSync(path.join(framesDir, file), Buffer.from(p.data, "base64"));
  rec.frames.push({ file, t, seg: rec.seg });
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    msgId += 1;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
const js = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
async function waitFor(expr, what, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if (await js(expr)) return true;
    } catch {
      // page may be navigating
    }
    await sleep(120);
  }
  throw new Error(`Timed out waiting for: ${what}`);
}
async function recStart() {
  rec.seg += 1;
  rec.segStart[rec.seg] = Date.now();
  rec.on = true;
  await js("window.__demo && window.__demo.pulse()");
}
async function recPause() {
  await sleep(200);
  rec.on = false;
  rec.segEnd[rec.seg] = Date.now();
}

const OVERLAY = `(() => {
  if (window.__demo && document.getElementById('__demo_root')) return 'ok';
  const root = document.createElement('div');
  root.id = '__demo_root';
  root.setAttribute('popover', 'manual');
  root.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;';
  root.innerHTML =
    '<div id="__ban" style="display:none;position:absolute;top:0;left:0;right:0;background:#b00020;color:#fff;font:700 15px system-ui;text-align:center;padding:7px;z-index:5"></div>' +
    '<div id="__cap" style="display:none;position:absolute;left:50%;bottom:30px;transform:translateX(-50%);max-width:80%;background:rgba(11,11,12,.94);color:#fff;font:600 19px system-ui;padding:12px 22px;border-radius:10px;border:1px solid rgba(255,255,255,.25);text-align:center;z-index:4"></div>' +
    '<div id="__card" style="display:none;position:absolute;inset:0;background:#070708;color:#f6f6f7;align-items:center;justify-content:center;flex-direction:column;text-align:center;font-family:system-ui;padding:60px;z-index:3"></div>' +
    '<div id="__pulse" style="position:absolute;left:0;top:0;width:2px;height:2px;background:rgba(0,0,0,0.01)"></div>' +
    '<div id="__cur" style="position:absolute;left:-60px;top:-60px;width:24px;height:24px;z-index:6;transition:left .7s cubic-bezier(.45,.05,.2,1),top .7s cubic-bezier(.45,.05,.2,1)"><svg width="24" height="24" viewBox="0 0 22 22"><path d="M2 1 L2 17 L6.5 13 L9.5 20 L12.5 18.7 L9.5 12 L15.5 12 Z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg></div>' +
    '<div id="__rip" style="position:absolute;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;border:3px solid #ff4f17;opacity:0;z-index:5"></div>';
  document.body.appendChild(root);
  const q = (id) => document.getElementById(id);
  let flip = false;
  window.__demo = {
    top() { try { root.hidePopover(); } catch {} try { root.showPopover(); } catch {} },
    pulse() { flip = !flip; q('__pulse').style.background = flip ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.01)'; },
    banner(t) { const b = q('__ban'); b.textContent = t || ''; b.style.display = t ? 'block' : 'none'; },
    caption(t) { const c = q('__cap'); c.textContent = t || ''; c.style.display = t ? 'block' : 'none'; },
    card(html) { const c = q('__card'); c.innerHTML = html || ''; c.style.display = html ? 'flex' : 'none'; },
    cursorTo(x, y) { const c = q('__cur'); c.style.left = (x - 2) + 'px'; c.style.top = (y - 1) + 'px'; },
    ripple(x, y) { const r = q('__rip'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.animate([{ opacity: .95, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(1.7)' }], { duration: 520, easing: 'ease-out' }); },
    smoothScroll(y, ms) {
      return new Promise((res) => {
        const max = document.documentElement.scrollHeight - innerHeight;
        const to = Math.max(0, Math.min(max, y)); const s = scrollY; const d = to - s;
        if (Math.abs(d) < 2) return res();
        const t0 = performance.now(); const ease = (t) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
        const step = (now) => { const k = Math.min(1, (now - t0) / ms); scrollTo(0, s + d * ease(k)); if (k < 1) requestAnimationFrame(step); else res(); };
        requestAnimationFrame(step);
      });
    },
  };
  window.__demo.top();
  return 'ok';
})()`;

async function ensure() {
  for (let i = 0; i < 20; i++) {
    try {
      if ((await js(OVERLAY)) === "ok") break;
    } catch {
      await sleep(150);
    }
  }
  if (!REAL) await js(`__demo.banner('REHEARSAL: fake Kane process, not a real run. Do not use this video.')`);
}
async function goto(url) {
  await send("Page.navigate", { url });
  await sleep(500);
  await waitFor("document.readyState === 'complete'", "page load");
  await sleep(900);
  await ensure();
}

// Elements are found by expressions evaluated in the page.
const E = {
  byAria: (label) => `document.querySelector('[aria-label=${JSON.stringify(label)}]')`,
  dialogButton: (text) => `[...document.querySelectorAll('dialog[open] button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`,
  button: (text) => `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled)`,
  heading: (text) => `[...document.querySelectorAll('h2,h3,h4')].find(h => h.textContent.trim().startsWith(${JSON.stringify(text)}))`,
};
async function scrollToEl(expr, where = "center", ms = 800) {
  const y = await js(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return scrollY + r.top - (${JSON.stringify(where)} === 'top' ? 110 : innerHeight / 2 - r.height / 2); })()`);
  if (y === null) throw new Error(`Cannot scroll: element not found: ${expr.slice(0, 80)}`);
  await js(`__demo.smoothScroll(${y}, ${ms})`);
}
/** Moves the visible cursor to the element, ripples, and clicks it. */
async function clickEl(expr, what) {
  await waitFor(`!!(${expr})`, what, 20000);
  const inDialog = await js(`!!(${expr})?.closest('dialog')`);
  if (!inDialog) await scrollToEl(expr, "center", 650);
  const pt = await js(`(() => { const el = ${expr}; const r = el.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 80), y: r.top + r.height / 2 }; })()`);
  await js(`__demo.top(); __demo.cursorTo(${pt.x}, ${pt.y})`);
  await sleep(850);
  await js(`__demo.ripple(${pt.x}, ${pt.y})`);
  await sleep(160);
  await js(`(${expr}).click()`);
  await sleep(350);
  await js(`__demo.top()`);
}
async function assertClean(where) {
  const text = await js("document.body.innerText");
  const bad = [os.userInfo().username, dataDir, "AppData", "test-manager.lambdatest"].filter((s) => s && text.toLowerCase().includes(s.toLowerCase()));
  if (bad.length) throw new Error(`Private text on screen at "${where}": ${bad.join(", ")}`);
}
async function card(titleHtml, subHtml, ms) {
  await js(`__demo.card(${JSON.stringify(`<div style="font-size:44px;font-weight:700;letter-spacing:-.01em;max-width:1000px;line-height:1.2">${titleHtml}</div><div style="margin-top:22px;font-size:22px;color:#a3a3aa;max-width:900px;line-height:1.5">${subHtml}</div>`)}); __demo.top()`);
  await sleep(ms);
  await js(`__demo.card('')`);
}

// ---- The recording -----------------------------------------------------------------------------------
async function main() {
  if (REAL) {
    // A logged-out Kane must fail here, before anything starts and before any credits could be spent.
    const cjs = path.join(process.env.APPDATA ?? "", "npm", "node_modules", "@testmuai", "kane-cli", "bin", "kane-cli.cjs");
    if (!fs.existsSync(cjs)) throw new Error("The Kane CLI was not found. Install it and run kane-cli login first. Nothing was started.");
    const who = spawnSync(process.execPath, [cjs, "whoami"], { encoding: "utf8", timeout: 60000 });
    if (who.status !== 0) throw new Error(`kane-cli whoami failed (exit ${who.status}). Run kane-cli login, then retry. Nothing was started.`);
    facts.notes.push("kane-cli whoami succeeded before recording (its output is not saved).");
  }
  for (const [u, n] of [[PL + "/api/v1/health", "3100"], [SHOP + "/", "4100"], [`http://127.0.0.1:${DIFF_PORT}/`, String(DIFF_PORT)]]) {
    if ((await up(u)) !== 0) throw new Error(`Port ${n} is already in use; not touching it.`);
  }

  // The planted bug goes back in for run 1.
  fs.writeFileSync(shopFile, buggyText.replace(/\n/g, fixedBytes.includes("\r\n") ? "\r\n" : "\n"));
  await startShop();
  const pre1 = await shopWorks();
  log(`shop (bug in): ${JSON.stringify(pre1)}`);
  if (pre1.works) throw new Error("The shop works, so the planted bug is not in place. Stopping before any Kane run.");
  facts.notes.push(`Shop with the planted bug: login redirected to ${pre1.redirect}, which answered ${pre1.status}.`);

  await new Promise((r) => diffServer.listen(DIFF_PORT, "127.0.0.1", r));

  const env = { ...process.env, PROOFLOOP_DATA_DIR: dataDir, PROOFLOOP_PORT: "3100", KANE_TIMEOUT_SECONDS: REAL ? "600" : "60" };
  if (!REAL) env.KANE_CLI_PATH = path.join(app, "tests", "helpers", "fake-kane.mjs");
  const pl = spawn(process.execPath, [path.join(app, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", "3100"], { cwd: app, env, stdio: "ignore", windowsHide: true });
  children.push(pl);
  for (let i = 0; i < 80 && (await up(PL + "/api/v1/health")) === 0; i++) await sleep(500);
  if ((await up(PL + "/api/v1/health")) !== 200) throw new Error("ProofLoop did not start.");

  // Setup done before the camera rolls: one project, one test file, one criterion.
  const testText = fs.readFileSync(path.join(app, "demo", "shop", "login_test.md"), "utf8").replace(/\r\n/g, "\n");
  const seededTest = REAL ? testText : `${testText}\nFAKE_MODE=fail FAKE_PACK=1\n`;
  const { project } = await api("POST", "/projects", { name: "Demo shop", targetUrl: SHOP + "/" });
  await api("PUT", `/projects/${project.id}/test-files/login`, { content: seededTest });
  const TITLE = "Login reaches the products page";
  const { criterion } = await api("POST", `/projects/${project.id}/criteria`, {
    title: TITLE,
    expectedBehavior: "After signing in with the demo account, the browser shows the Products page with a product list and Add to cart buttons.",
    testFile: `${project.id}/login_test.md`,
    stepLabel: "Products page is shown",
  });
  log(`seeded project ${project.id}`);

  chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run", "--disable-infobars", "about:blank"], { stdio: "ignore" });
  let pageWs;
  for (let i = 0; i < 60 && !pageWs; i++) {
    await sleep(250);
    try {
      pageWs = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
  }
  if (!pageWs) throw new Error("Chrome did not start.");
  ws = new WebSocket(pageWs);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Page.screencastFrame") onFrame(msg.params);
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1.5, mobile: false });
  await send("Browser.grantPermissions", { origin: PL, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

  const projectUrl = `${PL}/workspace/projects/${project.id}`;
  await goto(projectUrl);
  await waitFor(`!!${E.byAria(`Run with Kane: ${TITLE}`)}`, "criterion card");
  await js("scrollTo(0, 0)");
  await sleep(300);
  await assertClean("project page");

  // 1. The criterion and its test --------------------------------------------------------------------
  await recStart();
  log("segment 1: criterion and test");
  await sleep(2500);
  await clickEl(E.byAria(`Edit: ${TITLE}`), "Edit criterion");
  await clickEl(E.dialogButton("Edit login"), "Edit login");
  await waitFor(`(document.querySelector('dialog[open] textarea.ws-code')?.value ?? '').length > 80`, "test text loaded");
  await sleep(2600);
  await clickEl(E.dialogButton("Back"), "Back");
  await clickEl(E.dialogButton("Cancel"), "Cancel");
  await sleep(600);

  // 2. Start run 1 ----------------------------------------------------------------------------------
  log("segment 2: start run 1");
  await clickEl(E.byAria(`Run with Kane: ${TITLE}`), "Run with Kane");
  await waitFor("!!document.querySelector('dialog[open]')", "confirmation");
  await sleep(2800);
  await assertClean("run confirmation");
  const t1 = Date.now();
  await clickEl(E.dialogButton("Start real run"), "Start real run");
  await waitFor("!!document.querySelector('.ws-run')", "run panel");
  await sleep(500);
  const run1Id = (await api("GET", `/projects/${project.id}/runs`)).runs[0].id;
  await scrollToEl("document.querySelector('.ws-run')", "top", 700);
  await sleep(3000);
  await recPause();

  // Run 1 happens off camera.
  log(`run 1 started (${run1Id}); waiting for Kane`);
  const d1 = await waitTerminal(run1Id, 12 * 60 * 1000);
  const ms1 = Date.now() - t1;
  log(`run 1 finished: ${d1.run.status}, exit ${d1.run.exitCode}, ${fmtDur(ms1)}`);
  facts.runs.push({ n: 1, id: run1Id, status: d1.run.status, exitCode: d1.run.exitCode, durationMs: d1.run.durationMs, realWaitMs: ms1 });
  if (d1.run.status !== "FAILED") throw new Error(`Run 1 was ${d1.run.status}, not FAILED. The story needs a real failure. Stopping.`);
  facts.cuts.push({ after: "run 1 started", realWait: fmtDur(ms1) });

  await recStart();
  await card("Kane is running a real browser test", `Real time: ${fmtDur(ms1)}. Cut from this video.`, 3200);
  await waitFor("(document.querySelector('.ws-run .ws-run-status .ws-badge')?.textContent ?? '').trim() === 'Failed'", "Failed in the panel", 20000);
  await assertClean("failed run");

  // 3. The failure ----------------------------------------------------------------------------------
  log("segment 3: the failure");
  await scrollToEl("document.querySelector('.ws-run')", "top", 600);
  await sleep(3200);
  await scrollToEl(E.heading("What was run"), "top", 1100);
  await sleep(1500);
  await scrollToEl(E.heading("What Kane reported"), "top", 1100);
  await sleep(2200);
  await scrollToEl(`document.querySelector('.ws-run .ws-notice-error')`, "center", 1100);
  await sleep(7000);

  // 4. The report -----------------------------------------------------------------------------------
  log("segment 4: the report");
  await scrollToEl(E.heading("Report for your coding agent"), "top", 1100);
  await sleep(4500);
  await clickEl(E.button("Copy report"), "Copy report");
  await waitFor("document.body.innerText.includes('Copied to the clipboard.') || document.body.innerText.includes('blocked copying')", "copy result");
  const copied = await js("document.body.innerText.includes('Copied to the clipboard.')");
  facts.notes.push(`Copy report: ${copied ? "copied to the clipboard" : "browser blocked the clipboard; text was selected instead"}.`);
  await sleep(2600);
  await assertClean("report");

  // 5. The report goes to a coding agent; the change is shown ---------------------------------------
  log("segment 5: the fix");
  await card("The report goes to your coding agent", "You paste it into the agent you choose and review its change. ProofLoop never edits your code.", 3800);
  await js(`location.href = 'http://127.0.0.1:${DIFF_PORT}/'`);
  await sleep(700);
  await waitFor("document.readyState === 'complete'", "diff page");
  await ensure();
  await sleep(9000);
  await recPause();

  // The fix is applied off camera: write the file and restart the shop.
  await stopShop();
  fs.writeFileSync(shopFile, fixedBytes);
  await startShop();
  const pre2 = await shopWorks();
  log(`shop (fixed): ${JSON.stringify(pre2)}`);
  if (!pre2.works) throw new Error("The fix did not make the shop work. Stopping before the second Kane run.");
  facts.notes.push(`Shop after the fix: login redirected to ${pre2.redirect}, which answered ${pre2.status}.`);
  if (!REAL) await api("PUT", `/projects/${project.id}/test-files/login`, { content: `${testText}\nFAKE_MODE=pass FAKE_PACK=1\n` });

  // 6. Run 2 ----------------------------------------------------------------------------------------
  await goto(projectUrl);
  await waitFor(`!!${E.byAria(`Run with Kane: ${TITLE}`)}`, "criterion card");
  await js("scrollTo(0, 0)");
  await sleep(300);
  await recStart();
  log("segment 6: run 2");
  await sleep(2200);
  await clickEl(E.byAria(`Run with Kane: ${TITLE}`), "Run with Kane");
  await waitFor("!!document.querySelector('dialog[open]')", "confirmation");
  await sleep(1400);
  const t2 = Date.now();
  await clickEl(E.dialogButton("Start real run"), "Start real run");
  await waitFor("!!document.querySelector('.ws-run')", "run panel");
  await sleep(500);
  const run2Id = (await api("GET", `/projects/${project.id}/runs`)).runs[0].id;
  if (run2Id === run1Id) throw new Error("The second run did not start.");
  await scrollToEl("document.querySelector('.ws-run')", "top", 700);
  await sleep(2600);
  await recPause();

  log(`run 2 started (${run2Id}); waiting for Kane`);
  const d2 = await waitTerminal(run2Id, 12 * 60 * 1000);
  const ms2 = Date.now() - t2;
  log(`run 2 finished: ${d2.run.status}, exit ${d2.run.exitCode}, ${fmtDur(ms2)}`);
  facts.runs.push({ n: 2, id: run2Id, status: d2.run.status, exitCode: d2.run.exitCode, durationMs: d2.run.durationMs, realWaitMs: ms2 });
  if (d2.run.status !== "PASSED") throw new Error(`Run 2 was ${d2.run.status}, not PASSED. Stopping; the video would not tell the story.`);
  facts.cuts.push({ after: "run 2 started", realWait: fmtDur(ms2) });

  await recStart();
  await card("Kane is running the same test again", `Real time: ${fmtDur(ms2)}. Cut from this video.`, 3200);
  await waitFor("(document.querySelector('.ws-run .ws-run-status .ws-badge')?.textContent ?? '').trim() === 'Passed'", "Passed in the panel", 20000);
  await waitFor("(document.querySelector('.ws-criterion .ws-badge')?.textContent ?? '').trim() === 'Verified'", "Verified criterion", 20000);
  await assertClean("passed run");

  // 7. Passed and Verified --------------------------------------------------------------------------
  log("segment 7: passed and verified");
  await scrollToEl("document.querySelector('.ws-run')", "top", 700);
  await sleep(2800);
  await scrollToEl("document.querySelector('.ws-criterion')", "center", 900);
  await sleep(5000);

  // 8. Compare and history --------------------------------------------------------------------------
  log("segment 8: compare and history");
  await scrollToEl(E.heading("Compare with another run"), "top", 1100);
  await sleep(1200);
  await waitFor("!!document.querySelector('select[id^=\"cmp-sel-\"]') && document.querySelector('select[id^=\"cmp-sel-\"]').options.length > 1", "compare options");
  await clickEl(`document.querySelector('select[id^="cmp-sel-"]')`, "compare select");
  await js(`(() => { const s = document.querySelector('select[id^="cmp-sel-"]'); const o = [...s.options].find(o => o.value); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor("!!document.querySelector('[aria-label=\"Run comparison\"] table')", "comparison table");
  await sleep(600);
  await scrollToEl(`document.querySelector('[aria-label="Run comparison"]')`, "center", 900);
  await sleep(6000);
  await scrollToEl(E.heading("Run history"), "top", 1100);
  await sleep(4500);
  await assertClean("compare and history");

  // 9. End card -------------------------------------------------------------------------------------
  await card("ProofLoop", `Run. Read. Fix. Re-run.<br><span style="color:#ff4f17">proofloop-kane.shinc.tech</span>`, 3200);
  await recPause();
  log("recording finished");
}

async function assemble() {
  const segs = [...new Set(rec.frames.map((f) => f.seg))];
  const lines = [];
  let total = 0;
  for (const s of segs) {
    const fs_ = rec.frames.filter((f) => f.seg === s).sort((a, b) => a.t - b.t);
    fs_.forEach((f, i) => {
      const next = i + 1 < fs_.length ? fs_[i + 1].t : rec.segEnd[s];
      const dur = Math.max(0.008, (next - f.t) / 1000);
      total += dur;
      lines.push(`file '${f.file}'`, `duration ${dur.toFixed(4)}`);
    });
  }
  const last = lines.filter((l) => l.startsWith("file ")).pop();
  if (last) lines.push(last); // concat needs the final file repeated
  fs.writeFileSync(path.join(framesDir, "list.txt"), lines.join("\n"));
  const outFile = path.join(outRoot, REAL ? "proofloop-demo-silent.mp4" : "rehearsal-NOT-A-REAL-RUN.mp4");
  // JPEG frames are full range; convert to the limited-range yuv420p that editors and players expect.
  const r = spawnSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", path.join(framesDir, "list.txt"), "-vf", "fps=30,scale=1920:1080:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-color_range", "tv", "-movflags", "+faststart", outFile], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || "").slice(-600)}`);
  facts.output = path.relative(app, outFile);
  facts.frames = rec.frames.length;
  facts.expectedSeconds = Math.round(total * 10) / 10;
  log(`video written: ${outFile} (about ${facts.expectedSeconds}s of footage, ${rec.frames.length} frames)`);
}

let failed = null;
try {
  await main();
  await assemble();
} catch (err) {
  failed = err;
  facts.error = String(err?.message ?? err);
  console.error(String(err?.stack ?? err));
} finally {
  try {
    ws?.close();
  } catch {
    // closed
  }
  killTree(chrome);
  for (const c of children) killTree(c);
  killTree(shopProc);
  diffServer.close();
  fs.writeFileSync(shopFile, fixedBytes); // the repository's fixed shop, byte for byte
  await sleep(600);
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome may still hold the profile briefly
  }
  facts.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outRoot, `facts-${mode}.json`), JSON.stringify(facts, null, 2));
  console.log(failed ? "DONE with an error" : "DONE");
  process.exitCode = failed ? 1 : 0;
}
