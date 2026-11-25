// Real-browser check of the dashboard. Starts its own production server on :3100 with its own data
// folder, drives headless Chrome over the DevTools protocol, and writes a JSON result plus screenshots.
// No dependencies. Not part of the app.
//
//   node scripts/ui-e2e.mjs layout <outDir>   360 px layout, keyboard flow, dialogs. Never starts Kane.
//   node scripts/ui-e2e.mjs live <outDir>     Full flow through the UI with a REAL Kane run (uses credits).
//   node scripts/ui-e2e.mjs demo <outDir>     Report, copy, downloads, evidence and compare in the UI, on the runs
//                                             that scripts/demo-loop.mjs recorded. Starts no Kane run.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [mode, outArg] = process.argv.slice(2);
if (!["layout", "live", "demo"].includes(mode)) throw new Error("mode must be layout, live or demo");
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(app, outArg ?? `docs/phase5-${mode}`);
fs.mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:3100";
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const result = { mode, startedAt: new Date().toISOString(), checks: [], errors: [], notes: [] };
const check = (name, ok, detail) => {
  result.checks.push({ name, ok: Boolean(ok), detail: detail ?? null });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
};
const save = () => fs.writeFileSync(path.join(outDir, `result-${mode}.json`), JSON.stringify(result, null, 2));

async function health() {
  try {
    return (await fetch(base + "/api/v1/health")).status;
  } catch {
    return 0;
  }
}
if ((await health()) !== 0) throw new Error("Something already listens on :3100; not touching it.");

// `demo` mode only reads the data left by `node scripts/demo-loop.mjs`; it never wipes or starts a run.
const dataDir = path.join(app, "data", mode === "demo" ? "demo-loop" : `e2e-ui-${mode}`);
if (mode !== "demo") fs.rmSync(dataDir, { recursive: true, force: true });
const server = spawn(process.execPath, [path.join(app, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", "3100"], {
  cwd: app,
  env: { ...process.env, PROOFLOOP_DATA_DIR: dataDir, PROOFLOOP_PORT: "3100" },
  stdio: "ignore",
  shell: false,
  windowsHide: true,
});
const port = 9600 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pl-e2e-"));
let chrome;

async function cleanup() {
  try {
    chrome?.kill();
  } catch {
    // already gone
  }
  spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { shell: false });
  await sleep(400);
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome may still hold the profile briefly.
  }
}

try {
  for (let i = 0; i < 80 && (await health()) === 0; i++) await sleep(500);
  check("server up", (await health()) === 200);

  chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore", shell: false });
  let pageWs;
  for (let i = 0; i < 60 && !pageWs; i++) {
    await sleep(250);
    try {
      pageWs = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
  }
  if (!pageWs) throw new Error("Chrome did not start");
  const ws = new WebSocket(pageWs);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) events.push(msg);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      id += 1;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const js = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  const waitFor = async (expr, what, timeoutMs = 20000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try {
        if (await js(expr)) return true;
      } catch {
        // page navigating
      }
      await sleep(150);
    }
    throw new Error(`Timed out waiting for: ${what}`);
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.result.data, "base64"));
  };
  const key = async (k) => {
    const map = { Tab: [9, "Tab", ""], Enter: [13, "Enter", "\r"], Escape: [27, "Escape", ""] };
    const [code, name, text] = map[k];
    await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key: name, code: name, windowsVirtualKeyCode: code, text });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name, windowsVirtualKeyCode: code });
    await sleep(120);
  };

  // Helpers evaluated in the page.
  const H = `
    const ctl = (t, scope) => { const root = scope ? document.querySelector(scope) : document; const l = [...root.querySelectorAll('label')].find(l => l.textContent.trim().startsWith(t)); return l ? document.getElementById(l.htmlFor) : null; };
    const btn = (t, scope) => { const root = scope ? document.querySelector(scope) : document; return [...root.querySelectorAll('button')].find(b => b.textContent.trim() === t || b.getAttribute('aria-label') === t); };
  `;
  const fill = async (label, value, scope) => {
    const ok = await js(`(()=>{${H} const el = ctl(${JSON.stringify(label)}, ${JSON.stringify(scope ?? null)}); if(!el) return false; el.focus(); el.select && el.select(); return true;})()`);
    if (!ok) throw new Error(`No field labelled ${label}`);
    await send("Input.insertText", { text: value });
    await sleep(80);
  };
  const click = async (label, scope) => {
    const ok = await js(`(()=>{${H} const b = btn(${JSON.stringify(label)}, ${JSON.stringify(scope ?? null)}); if(!b || b.disabled) return false; b.click(); return true;})()`);
    if (!ok) throw new Error(`No enabled button ${label}`);
    await sleep(150);
  };

  await send("Page.enable");
  await send("Runtime.enable");
  const goto = async (url) => {
    const before = events.length;
    await send("Page.navigate", { url });
    for (let i = 0; i < 100 && !events.slice(before).some((e) => e.method === "Page.loadEventFired"); i++) await sleep(100);
    await sleep(1200);
  };
  const viewport = (width, height, mobile) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

  const api = async (method, p, body) => {
    const res = await fetch(base + "/api/v1" + p, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return res.status === 204 ? null : res.json();
  };

  const PASS_TEST = (url) => `---
mode: testing
url: ${url}
max_steps: 20
---

# Smoke: login reaches inventory (expected to PASS)

## Open the login page
Open ${url} and verify the Login button is visible.

## Sign in with the public demo account
Type "standard_user" into the Username field and "secret_sauce" into the Password field, then click Login.
Verify the page shows the "Products" heading and at least one product with an "Add to cart" button.
`;

  if (mode === "layout") {
    // ---- Data through the API (no Kane involved) ----
    const { project } = await api("POST", "/projects", { name: "Layout check with a deliberately long project name that must wrap on a phone", targetUrl: "https://www.saucedemo.com/" });
    for (const n of ["login", "cart", "checkout"]) {
      await api("PUT", `/projects/${project.id}/test-files/${n}`, { content: PASS_TEST("https://www.saucedemo.com/") });
      await api("POST", `/projects/${project.id}/criteria`, {
        title: `Criterion ${n} with a long title that has to wrap across lines on a 360 pixel screen`,
        expectedBehavior: "A valid user reaches the inventory page and the page shows the product list with every item visible.",
        testFile: `${project.id}/${n}_test.md`,
      });
    }
    await viewport(360, 800, true);

    for (const [name, url] of [["workspace", "/workspace"], ["project", `/workspace/projects/${project.id}`]]) {
      await goto(base + url);
      const m = await js(`({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: window.innerWidth })`);
      check(`360px: no horizontal scroll on ${name}`, m.sw <= m.iw && m.bw <= m.iw, JSON.stringify(m));
      await shot(`360-${name}`);
    }

    // Touch target size and field font size at 360px.
    const sizes = await js(`(()=>{ const bs=[...document.querySelectorAll('.ws-btn')]; return { n: bs.length, minH: Math.min(...bs.map(b=>b.getBoundingClientRect().height)) }; })()`);
    check("360px: buttons are at least 44px tall", sizes.n > 0 && sizes.minH >= 44, JSON.stringify(sizes));

    // Dialogs fit the screen.
    await click("Add criterion");
    await waitFor(`!!document.querySelector('dialog[open]')`, "criterion dialog");
    await sleep(500);
    let d = await js(`(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:innerWidth,h:innerHeight, sw: document.documentElement.scrollWidth, fs: getComputedStyle(document.querySelector('dialog[open] input')).fontSize};})()`);
    check("360px: add-criterion dialog fits the viewport", d.l >= 0 && d.r <= d.w && d.t >= 0 && d.b <= d.h + 1 && d.sw <= d.w, JSON.stringify(d));
    check("360px: form fields use 16px text (no iOS zoom)", d.fs === "16px", d.fs);
    await shot("360-dialog-add-criterion");
    await key("Escape");
    await waitFor(`!document.querySelector('dialog[open]')`, "dialog closes on Escape");

    await click("Run with Kane: Criterion login with a long title that has to wrap across lines on a 360 pixel screen");
    await waitFor(`!!document.querySelector('dialog[open]')`, "run dialog");
    await sleep(400);
    d = await js(`(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:innerWidth,h:innerHeight,text:document.querySelector('dialog[open]').innerText};})()`);
    check("360px: run confirmation fits and states real Kane/credits", d.l >= 0 && d.r <= d.w && /real Kane browser run/.test(d.text) && /credits/.test(d.text) && /Test Manager/.test(d.text), JSON.stringify({ l: d.l, r: d.r, w: d.w }));
    await shot("360-dialog-run-confirm");
    await click("Cancel", "dialog[open]");
    await waitFor(`!document.querySelector('dialog[open]')`, "run dialog closes");
    const runs = await api("GET", `/projects/${project.id}/runs`);
    check("cancelling the confirmation started no run", runs.runs.length === 0);

    // ---- Keyboard flow (trusted key events) ----
    await viewport(1280, 900, false);
    await goto(base + `/workspace/projects/${project.id}`);
    const opener = "Run with Kane: Criterion cart with a long title that has to wrap across lines on a 360 pixel screen";
    await js(`(()=>{${H} btn(${JSON.stringify(opener)}).focus();})()`);
    await key("Enter");
    await waitFor(`!!document.querySelector('dialog[open]')`, "Enter opens the dialog");
    check("keyboard: Enter on a focused button opens the dialog", true);
    check("keyboard: focus moved into the dialog", await js(`document.querySelector('dialog[open]').contains(document.activeElement)`));
    // A modal dialog makes the page behind it inert. Tab may leave the page for the browser's own UI, which
    // shows as <body> being active. What must never happen is focus landing on the page behind the dialog.
    const trail = [];
    let leaked = false;
    for (let i = 0; i < 10; i++) {
      await key("Tab");
      const st = await js(
        `(()=>{const d=document.querySelector('dialog[open]'); const a=document.activeElement; return { inDialog: d.contains(a), isBody: a===document.body, desc: a.tagName.toLowerCase()+(a.getAttribute('aria-label')?'['+a.getAttribute('aria-label')+']':'') };})()`,
      );
      trail.push(st.inDialog ? `dialog:${st.desc}` : st.isBody ? "browser-ui" : `PAGE:${st.desc}`);
      if (!st.inDialog && !st.isBody) leaked = true;
    }
    result.notes.push(`Tab trail: ${trail.join(" > ")}`);
    check("keyboard: Tab never focuses the page behind the open dialog", !leaked && trail.some((t) => t.startsWith("dialog:")), trail.join(" > "));
    await key("Escape");
    await waitFor(`!document.querySelector('dialog[open]')`, "Escape closes the dialog");
    check("keyboard: Escape closes the dialog", true);
    check("keyboard: focus returns to the button that opened it", await js(`(document.activeElement && document.activeElement.getAttribute('aria-label')) === ${JSON.stringify(opener)}`));
    check("keyboard: Escape started no run", (await api("GET", `/projects/${project.id}/runs`)).runs.length === 0);
    await shot("1280-project");
  } else if (mode === "demo") {
    // ---- Demo data: handoff report, clipboard, downloads, evidence, compare ----
    const state = JSON.parse(fs.readFileSync(path.join(dataDir, "state.json"), "utf8"));
    // What must never appear in a report: this user's name, ProofLoop's data folder, or a Test Manager id in a link.
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const leakRe = new RegExp([esc(os.userInfo().username), esc(dataDir), esc(dataDir.replace(/\\/g, "\\\\")), "test-manager\\.[\\w.-]+/projects/(?!<ID>)\\w+"].join("|"), "i");
    const leaks = (text) => leakRe.test(text);
    await send("Browser.grantPermissions", { origin: base, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
    for (const [label, w, h, mobile] of [["1280", 1280, 1000, false], ["360", 360, 800, true]]) {
      await viewport(w, h, mobile);
      await goto(base + `/workspace/projects/${state.projectId}`);
      await waitFor(`document.querySelectorAll('.ws-history-row').length === 2`, "history with two runs");
      check(`${label}: criterion is Verified because of the newest passing run`, await js(`document.querySelector('.ws-criterion .ws-badge').textContent.trim() === 'Verified'`));
      const rows = await js(`[...document.querySelectorAll('.ws-history-row')].map(r => r.querySelector('.ws-badge').textContent.trim())`);
      check(`${label}: history lists the newest run first, and keeps the failure`, rows[0] === "Passed" && rows[1] === "Failed", JSON.stringify(rows));

      // Open the FAILED run from history.
      await js(`[...document.querySelectorAll('.ws-history-row')].find(r => r.textContent.includes('Failed')).click()`);
      await waitFor(`document.querySelector('.ws-run .ws-run-status .ws-badge')?.textContent.trim() === 'Failed'`, "failed run panel");
      await waitFor(`document.querySelector('textarea[aria-label="Report text"]')?.value.length > 200`, "report loaded");
      const report = await js(`document.querySelector('textarea[aria-label="Report text"]').value`);
      check(`${label}: report shows the failure, Kane's diagnosis and the criterion`, report.includes("**FAILED**") && report.includes("Login navigated to /products") && report.includes("Expected behavior: After signing in") && report.includes("Not recorded"));
      check(`${label}: report has no username, data folder or account id`, !leaks(report));
      check(`${label}: panel labels Kane's diagnosis as Kane's`, await js(`document.querySelector('.ws-run').innerText.includes("Kane's diagnosis (not ProofLoop's)")`));

      // Copy goes to the real clipboard, only when asked.
      const before = await js(`navigator.clipboard.readText().catch(() => '')`);
      check(`${label}: nothing was copied before the button was pressed`, before !== report);
      await send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await js(`window.focus()`);
      await js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Copy report').click()`);
      await waitFor(`document.body.innerText.includes('Copied to the clipboard.') || document.body.innerText.includes('blocked copying')`, "copy result");
      const outcome = await js(`document.body.innerText.includes('Copied to the clipboard.') ? 'copied' : 'blocked'`);
      const readBack = await js(`navigator.clipboard.readText().then(t => ({ ok: true, t }), e => ({ ok: false, t: '', err: String(e) }))`);
      result.notes.push(`${label}: copy outcome=${outcome}; clipboard read ok=${readBack.ok}${readBack.err ? ` (${readBack.err})` : ""}`);
      if (outcome === "copied") {
        // Windows turns \n into \r\n on the clipboard. Compare the text with line endings normalised.
        const lineCount = report.split("\n").length - 1;
        check(`${label}: Copy report puts exactly the report on the clipboard`, readBack.ok && readBack.t.replace(/\r\n/g, "\n") === report, `${readBack.t.length} chars read back, ${report.length} in the report, ${lineCount} lines`);
      } else {
        // The browser refused the write. The fallback must have selected the report for Ctrl+C.
        const sel = await js(`(()=>{const t=document.querySelector('textarea[aria-label="Report text"]'); return { focused: document.activeElement === t, all: t.selectionStart === 0 && t.selectionEnd === t.value.length };})()`);
        check(`${label}: when the browser blocks copying, the report is selected for Ctrl+C`, sel.focused && sel.all, JSON.stringify(sel));
      }

      // Downloads are the same report the page shows.
      const md = await js(`fetch(document.querySelector('a[href*="format=markdown"]').getAttribute('href')).then(r => r.text())`);
      check(`${label}: Markdown download equals the report on screen`, md === report);
      const jsonText = await js(`fetch(document.querySelector('a[href$="format=json"]').getAttribute('href')).then(r => r.text())`);
      const parsed = JSON.parse(jsonText);
      check(`${label}: JSON download is schemaVersion 1 with no raw output`, parsed.schemaVersion === 1 && parsed.output.included === false && !jsonText.includes('"stdout"'));
      const rawText = await js(`fetch(document.querySelector('a[href*="includeOutput=true"]').getAttribute('href')).then(r => r.text())`);
      const rawParsed = JSON.parse(rawText);
      check(`${label}: raw output is only in the explicit export`, rawParsed.output.included === true && rawParsed.output.stdout.includes("test_md_done") && !leaks(rawText));

      // Evidence file download.
      const ev = await js(`(async () => { const a = document.querySelector('a[href*="/evidence/"]'); if (!a) return null; const r = await fetch(a.getAttribute('href')); const b = new Uint8Array(await r.arrayBuffer()); return { status: r.status, type: r.headers.get('content-type'), disp: r.headers.get('content-disposition'), head: [...b.slice(0, 2)], size: b.length }; })()`);
      check(`${label}: evidence downloads as a file (zip signature)`, ev && ev.status === 200 && ev.head[0] === 0x50 && ev.head[1] === 0x4b && /attachment/.test(ev.disp), JSON.stringify(ev));

      // Compare with the passing run.
      await js(`(()=>{const s = document.querySelector('select[id^="cmp-sel-"]'); const o = [...s.options].find(o => o.value); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true }));})()`);
      await waitFor(`!!document.querySelector('[aria-label="Run comparison"] table')`, "comparison table");
      const cells = await js(`(()=>{ const row = [...document.querySelectorAll('[aria-label="Run comparison"] tbody tr')].find(r => r.querySelector('th').textContent.startsWith('Status')); return [...row.querySelectorAll('td')].map(c => c.textContent.trim()); })()`);
      check(`${label}: comparison shows FAILED then PASSED`, cells[0] === "FAILED" && cells[1] === "PASSED", JSON.stringify(cells));
      check(`${label}: comparison states it infers no cause`, await js(`document.querySelector('[aria-label="Run comparison"]').innerText.includes('does not infer what caused them')`));
      const m = await js(`({ sw: document.documentElement.scrollWidth, iw: innerWidth })`);
      check(`${label}: no horizontal scroll with report and comparison open`, m.sw <= m.iw, JSON.stringify(m));
      await js(`document.querySelector('.ws-run').scrollIntoView()`);
      await sleep(400);
      await shot(`demo-${label}-run`);
      await js(`document.querySelector('textarea[aria-label="Report text"]').scrollIntoView({block:'center'})`);
      await sleep(300);
      await shot(`demo-${label}-report`);
      await js(`document.querySelector('[aria-label="Run comparison"]').scrollIntoView({block:'center'})`);
      await sleep(300);
      await shot(`demo-${label}-compare`);
    }
  } else {
    // ---- Live: everything through the UI, then a real Kane run ----
    await viewport(1280, 900, false);
    await goto(base + "/workspace");
    check("empty workspace shows the empty state", await js(`document.body.innerText.includes('No projects yet.')`));
    await fill("Project name", "UI end-to-end");
    await fill("Target URL", "https://www.saucedemo.com/");
    await click("Create project");
    await waitFor(`location.pathname.startsWith('/workspace/projects/')`, "navigate to the project");
    const projectId = await js(`location.pathname.split('/').pop()`);
    await waitFor(`document.body.innerText.includes('Nothing to verify yet.')`, "project page loaded");
    check("project created through the form", Boolean(projectId));
    await shot("live-1-project-empty");

    await click("Add criterion");
    await waitFor(`!!document.querySelector('dialog[open]')`, "criterion dialog");
    await fill("Criterion", "Login reaches inventory", "dialog[open]");
    await fill("Expected behavior", "A valid user reaches the inventory page and the product list is visible.", "dialog[open]");
    await click("Write a new test file", "dialog[open]");
    await waitFor(`!!document.querySelector('dialog[open] textarea.ws-code')`, "test file editor");
    await fill("File name", "login", "dialog[open]");
    await fill("Test", PASS_TEST("https://www.saucedemo.com/"), "dialog[open]");
    await click("Save test file", "dialog[open]");
    await waitFor(`(()=>{${H} const s = ctl('Test file', 'dialog[open]'); return s && [...s.options].some(o => o.value.endsWith('login_test.md'));})()`, "back on the criterion form with the file listed");
    check("test file written through the editor and selected", await js(`(()=>{${H} return ctl('Test file','dialog[open]').value.endsWith('/login_test.md');})()`));
    await shot("live-2-criterion-form");
    await click("Add criterion", "dialog[open]");
    await waitFor(`!document.querySelector('dialog[open]') && document.body.innerText.includes('Login reaches inventory')`, "criterion saved");
    check("criterion added and shown as Unverified", await js(`document.querySelector('.ws-criterion .ws-badge').textContent.trim() === 'Unverified'`));
    const file = path.join(dataDir, "tests", projectId, "login_test.md");
    check("test file exists on disk under the managed folder", fs.existsSync(file) && fs.readFileSync(file, "utf8").includes("standard_user"));
    await shot("live-3-criterion-unverified");

    await click("Run with Kane: Login reaches inventory");
    await waitFor(`!!document.querySelector('dialog[open]')`, "run confirmation");
    await shot("live-4-run-confirm");
    await click("Start real run", "dialog[open]");
    await waitFor(`!!document.querySelector('.ws-run')`, "run panel", 30000);
    const startedAt = Date.now();
    await waitFor(`document.querySelector('.ws-run .ws-run-status')?.textContent.includes('Running') || document.querySelector('.ws-run .ws-run-status')?.textContent.includes('Queued')`, "running state shown", 30000);
    const midBadge = await js(`document.querySelector('.ws-criterion .ws-badge')?.textContent.trim()`);
    check("while running: criterion shows Running, never Verified", midBadge === "Running" || midBadge === "Unverified", midBadge);
    check("while running: the panel says nothing is a pass yet", await js(`document.querySelector('.ws-run').innerText.includes('Nothing here is a pass until then')`));
    check("while running: Run buttons are disabled (one run at a time)", await js(`[...document.querySelectorAll('.ws-criterion .ws-btn-primary')].every(b => b.disabled)`));
    await shot("live-5-running");

    // Wait for a terminal state in the record. Up to 12 minutes (config timeout is 600 s).
    await waitFor(`!/Running|Queued/.test(document.querySelector('.ws-run .ws-run-status')?.textContent ?? 'Running')`, "run to finish", 12 * 60 * 1000);
    const secs = Math.round((Date.now() - startedAt) / 1000);
    await sleep(2500);
    const final = await js(`({ run: document.querySelector('.ws-run .ws-run-status .ws-badge')?.textContent.trim(), crit: document.querySelector('.ws-criterion .ws-badge')?.textContent.trim(), panel: document.querySelector('.ws-run').innerText })`);
    result.notes.push(`Run finished about ${secs}s after the click. Panel status: ${final.run}. Criterion status: ${final.crit}.`);
    await shot("live-6-finished");

    // Cross-check the UI against the stored record.
    const runList = await api("GET", `/projects/${projectId}/runs`);
    const rec = runList.runs[0];
    check("exactly one run was recorded", runList.runs.length === 1);
    check("UI run status matches the stored record", final.run?.toLowerCase().replace(/\s/g, "_") === rec.status.toLowerCase(), `${final.run} vs ${rec.status}`);
    const crit = (await api("GET", `/projects/${projectId}`)).criteria[0];
    check("UI criterion status matches the server's derived status", final.crit?.toLowerCase() === crit.status.toLowerCase(), `${final.crit} vs ${crit.status}`);
    if (rec.status === "PASSED") check("a PASSED run is the only way the criterion became Verified", crit.status === "VERIFIED");
    else check("a run that did not pass leaves the criterion not Verified", crit.status !== "VERIFIED", crit.status);
    check("panel shows the exit code from the record", final.panel.includes(String(rec.exitCode)), `exit ${rec.exitCode}`);
    result.notes.push(`Stored run: status=${rec.status}, exit=${rec.exitCode}, duration=${rec.durationMs}ms, errorCode=${rec.errorCode}, evidenceAvailable=${rec.evidenceAvailable}.`);

    // Raw output disclosure (lazy fetch) and evidence section.
    const fetchedBefore = await js(`performance.getEntriesByType('resource').filter(e => e.name.includes('/output')).length`);
    check("raw output was not fetched before it was opened", fetchedBefore === 0, String(fetchedBefore));
    await js(`(()=>{const d=[...document.querySelectorAll('details')].find(d=>d.textContent.trim().startsWith('Raw stdout')); d.open=true;})()`);
    await waitFor(`!!document.querySelector('pre[aria-label="Raw stdout"]')`, "raw stdout shown", 15000);
    const raw = await js(`document.querySelector('pre[aria-label="Raw stdout"]').textContent`);
    const apiRaw = await (await fetch(`${base}/api/v1/runs/${rec.id}/output?stream=stdout`)).text();
    check("raw stdout in the UI equals the API's saved output", raw === apiRaw.slice(0, raw.length) && raw.length > 0, `${raw.length} chars`);
    check("raw stdout contains Kane's terminal event", raw.includes("test_md_done"));
    result.notes.push(`Evidence section text: ${await js(`[...document.querySelectorAll('.ws-run h3')].find(h=>h.textContent==='Evidence').nextElementSibling.innerText`)}`);
    await shot("live-7-raw-output");

    // 360px view of a finished run.
    await viewport(360, 800, true);
    await goto(base + `/workspace/projects/${projectId}`);
    await click("Latest run: Login reaches inventory");
    await waitFor(`!!document.querySelector('.ws-run .ws-run-status .ws-badge')`, "run panel on mobile");
    await sleep(600);
    const m = await js(`({ sw: document.documentElement.scrollWidth, iw: innerWidth })`);
    check("360px: finished run page has no horizontal scroll", m.sw <= m.iw, JSON.stringify(m));
    await shot("live-8-360-finished-run");

    // History row for the run.
    check("run history lists the run", await js(`document.querySelectorAll('.ws-history-row').length === 1`));
  }

  const exceptions = events.filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails?.exception?.description ?? e.params.exceptionDetails?.text);
  const consoleErrors = events.filter((e) => e.method === "Runtime.consoleAPICalled" && e.params.type === "error").map((e) => e.params.args?.map((a) => a.value ?? a.description).join(" "));
  result.errors = [...exceptions, ...consoleErrors];
  check("no uncaught page exceptions or console errors", result.errors.length === 0, result.errors.slice(0, 3).join(" | "));
  ws.close();
} catch (err) {
  check("script completed", false, String(err?.stack ?? err));
} finally {
  result.finishedAt = new Date().toISOString();
  result.failed = result.checks.filter((c) => !c.ok).length;
  save();
  await cleanup();
  console.log(`DONE failed=${result.failed}`);
}
