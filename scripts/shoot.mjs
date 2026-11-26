// Visual QA helper: screenshots a page at several scroll positions with headless Chrome over the
// DevTools protocol. No dependencies (uses Node's global WebSocket). Not part of the app.
//
// Usage: node scripts/shoot.mjs <url> <outDir> <label> <width>x<height> <scrollViewports,comma> [reduce] [mobile]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [url, outDir, label, size, stops, ...flags] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const reduce = flags.includes("reduce");
const mobile = flags.includes("mobile");
const chrome = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pl-shoot-"));
fs.mkdirSync(outDir, { recursive: true });

const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run", `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore", shell: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pageWs;
for (let i = 0; i < 50 && !pageWs; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    pageWs = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
  } catch {
    // Not up yet.
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

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
if (reduce) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.navigate", { url });
for (let i = 0; i < 100 && !events.some((e) => e.method === "Page.loadEventFired"); i++) await sleep(100);
await sleep(3200);

const errors = events.filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails?.exception?.description ?? e.params.exceptionDetails?.text);
const docHeight = (await send("Runtime.evaluate", { expression: "document.documentElement.scrollHeight", returnByValue: true })).result.result.value;

for (const stop of stops.split(",")) {
  const y = stop === "end" ? docHeight : Math.round(Number(stop) * height);
  // Step through intermediate positions so scrubbed timelines and once-triggers fire as for a user.
  await send("Runtime.evaluate", { expression: `(async()=>{const t=${y};const s=window.scrollY;const n=12;for(let i=1;i<=n;i++){window.scrollTo(0,s+(t-s)*i/n);await new Promise(r=>setTimeout(r,60));}})()`, awaitPromise: true });
  await sleep(2000);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(outDir, `${label}-${stop}.png`), Buffer.from(shot.result.data, "base64"));
}

// Horizontal overflow: the page is wider than the window when scrollWidth exceeds innerWidth.
const widths = (await send("Runtime.evaluate", { expression: "({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })", returnByValue: true })).result.result.value;
console.log(JSON.stringify({ label, docHeight, ...widths, overflowsHorizontally: widths.scrollWidth > widths.innerWidth, errors }));
ws.close();
proc.kill();
await sleep(300);
try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {
  // Chrome may still hold the profile briefly.
}
