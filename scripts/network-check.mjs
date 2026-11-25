// Phase 8 network boundary check. Starts its own production server on :3100 (loopback, temp data folder)
// and checks, from the outside, that ProofLoop answers only what it should. Never starts Kane.
//   node scripts/network-check.mjs [outFile]
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.resolve(app, process.argv[2] ?? "docs/phase8-network-check.json");
const dataDir = path.join(app, "data", "network-check");
fs.rmSync(dataDir, { recursive: true, force: true });
const PORT = 3100;
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok), detail: detail ?? null });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A raw request so the Host and Origin headers can be set freely (fetch forbids some of them). */
function raw({ method = "GET", host = "127.0.0.1", path: p = "/", headers = {}, body, address = "127.0.0.1" }) {
  return new Promise((resolve) => {
    const req = http.request({ host: address, port: PORT, method, path: p, headers: { host, ...headers }, timeout: 4000 }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ error: "timeout" });
    });
    req.on("error", (e) => resolve({ error: e.code ?? String(e) }));
    if (body) req.write(body);
    req.end();
  });
}

const server = spawn(process.execPath, [path.join(app, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", String(PORT)], {
  cwd: app,
  env: { ...process.env, PROOFLOOP_DATA_DIR: dataDir, PROOFLOOP_PORT: String(PORT) },
  stdio: "ignore",
  shell: false,
  windowsHide: true,
});

try {
  for (let i = 0; i < 80; i++) {
    const r = await raw({ path: "/api/v1/health", host: `127.0.0.1:${PORT}` });
    if (r.status === 200) break;
    await sleep(500);
  }
  const base = { host: `127.0.0.1:${PORT}` };

  const health = await raw({ ...base, path: "/api/v1/health" });
  check("loopback address answers", health.status === 200, String(health.status));

  // Reachability from this machine's other addresses. A server bound to 0.0.0.0 would answer; ProofLoop must not.
  const external = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  if (external.length === 0) {
    check("no non-loopback IPv4 address on this machine to probe", true, "skipped: nothing to test against");
  }
  for (const address of external) {
    const r = await raw({ ...base, path: "/api/v1/health", address });
    check(`not reachable on ${address}`, r.error === "ECONNREFUSED" || r.error === "timeout" || r.error === "ECONNRESET", JSON.stringify({ status: r.status, error: r.error }));
  }
  const bind = await new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port: PORT, timeout: 2000 }, () => {
      resolve("connected");
      s.destroy();
    });
    s.on("error", (e) => resolve(e.code));
  });
  check("TCP connect to 127.0.0.1 works", bind === "connected");

  // Host header: DNS-rebinding guard.
  for (const [host, expected] of [
    ["evil.example", 403],
    [`evil.example:${PORT}`, 403],
    [`127.0.0.1.evil.example:${PORT}`, 403],
    [`localhost:${PORT}`, 200],
    [`127.0.0.1:${PORT}`, 200],
    [`[::1]:${PORT}`, 200],
  ]) {
    const r = await raw({ host, path: "/api/v1/health" });
    check(`Host "${host}" on the API -> ${expected}`, r.status === expected, String(r.status ?? r.error));
  }
  const page = await raw({ host: "evil.example", path: "/workspace" });
  check("Host evil.example is refused on pages too", page.status === 403, String(page.status));
  const refusal = await raw({ host: "evil.example", path: "/api/v1/projects" });
  check("a refused request leaks no project data", refusal.status === 403 && !refusal.text.includes("projects\":["), refusal.text.slice(0, 120));

  // Cross-origin mutation (CSRF).
  const csrf = await raw({ ...base, method: "POST", path: "/api/v1/projects", headers: { origin: "http://evil.example", "content-type": "application/json" }, body: JSON.stringify({ name: "x", targetUrl: "https://a.test" }) });
  check("cross-origin POST is refused", csrf.status === 403, String(csrf.status));
  const csrfSite = await raw({ ...base, method: "POST", path: "/api/v1/projects", headers: { "sec-fetch-site": "cross-site", "content-type": "application/json" }, body: JSON.stringify({ name: "x", targetUrl: "https://a.test" }) });
  check("Sec-Fetch-Site: cross-site POST is refused", csrfSite.status === 403, String(csrfSite.status));
  const list = await raw({ ...base, path: "/api/v1/projects" });
  check("nothing was created by the refused requests", list.status === 200 && JSON.parse(list.text).projects.length === 0);
  const wrongType = await raw({ ...base, method: "POST", path: "/api/v1/projects", headers: { "content-type": "text/plain" }, body: "{}" });
  check("non-JSON content type is refused", wrongType.status === 400, String(wrongType.status));
  const big = await raw({ ...base, method: "POST", path: "/api/v1/projects", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x".repeat(70_000), targetUrl: "https://a.test" }) });
  check("oversized body is refused", big.status === 413, String(big.status));

  // Security headers on a page and on the API.
  for (const p of ["/", "/api/v1/health"]) {
    const r = await raw({ ...base, path: p });
    const h = r.headers ?? {};
    check(`security headers on ${p}`, h["x-content-type-options"] === "nosniff" && h["x-frame-options"] === "DENY" && (h["content-security-policy"] ?? "").includes("frame-ancestors 'none'") && h["referrer-policy"] === "no-referrer" && !h["x-powered-by"], JSON.stringify({ nosniff: h["x-content-type-options"], xfo: h["x-frame-options"], csp: h["content-security-policy"], ref: h["referrer-policy"], powered: h["x-powered-by"] ?? null }));
  }

  // Errors are generic.
  const missing = await raw({ ...base, path: "/api/v1/runs/not-an-id" });
  check("error body has no stack trace or local path", missing.status === 404 && !/\bat \w|node_modules|\.ts:|C:\\\\|C:\//.test(missing.text), missing.text.slice(0, 160));
  const health2 = await raw({ ...base, path: "/api/v1/health" });
  check("health reveals no environment, path or version", !/PATH|HOME|USERPROFILE|C:\\|kane/i.test(health2.text), health2.text);
} catch (err) {
  check("script completed", false, String(err?.stack ?? err));
} finally {
  spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { shell: false });
  const failed = checks.filter((c) => !c.ok).length;
  fs.writeFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), failed, checks }, null, 2));
  console.log(`DONE failed=${failed}`);
}
