# Phase 8 report: Integration testing and hardening

**Result: PASS, with the gaps listed.** The full lifecycle was exercised end to end, the security boundary was checked from outside the process, and the failure paths in the plan were each tested. One real weakness was found and fixed (DNS rebinding).

## Found and fixed in this phase

| Finding | Why it mattered | Fix |
|---|---|---|
| The API answered any `Host` header. A web page on another site could point a hostname it controls at `127.0.0.1` ("DNS rebinding") and read project data as if it were same-origin. The existing origin check only protected writes. | SEC-001 says loopback only. Binding to `127.0.0.1` does not stop a browser on this machine from being used as the bridge. | `proxy.ts` (Next.js 16's name for middleware) returns `403` for any request whose `Host` is not `127.0.0.1`, `localhost` or `[::1]`, on pages and API. |
| Reports and exports could repeat ProofLoop's own data-folder path, taken from Kane's saved output. | A published report should not say where on disk your data lives. | `scrubDataDir` replaces it with `<DATA>` in every spelling saved output uses (raw, home-redacted, slash, JSON-escaped, case-insensitive on Windows). |
| Test Manager project and test-case ids appeared in saved output. | They tie a report to one account. | The redactor now hides them in links and summaries. Old stored output is cleaned at report time. |
| Responses had no browser-hardening headers. | Clickjacking and sniffing. | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy`, `Permissions-Policy`. |
| Two accessible-name collisions (report box and section; history filter options vs. criterion headings in my own tests). | Screen-reader ambiguity. | Report box renamed; tests made precise. |

## What was checked

| Plan item | How | Result |
|---|---|---|
| Clean install | `scripts/clean-install-check.mjs`: clone committed files, `npm ci`, lint, typecheck, tests, build | See "Clean install" below |
| Actual pass and fail | Real Kane: Phase 5 UI run (pass), Phase 6 failure and pass of the demo criterion, Phase 4 live API tests | Pass, see reports |
| No Kane / no Chrome / no auth | Phase 3 and 4 tests: Kane missing gives `PREREQUISITE_FAILED` (`424`) with no run left active; a Kane that cannot start gives `NOT_STARTED`; dashboard renders the 424 message with its remedy | Pass |
| Timeout, cancel, malformed stream | Phase 3 and 4 fake-process tests (`hang`, `malformed`, `noterminal`, `exit2`, `pass-but-exit1`, `fail-but-exit0`) | Pass |
| Disk or permission fault | `tests/hardening.test.ts`: raw output folder unwritable still records the real result and says output is unavailable; evidence folder unwritable leaves the result untouched and evidence unavailable | Pass |
| Path traversal | Phase 2 and 5 tests (criterion paths, test-file names, evidence ids, stored paths that escape, output paths) | Pass |
| Duplicate start | `RUNNER_BUSY` tests; a refused second start leaves the first run intact | Pass |
| App restart | `tests/hardening.test.ts` closes and reopens the database: runs, reports (byte for byte), statuses, output and comparison survive. A run left active by a crash becomes `UNKNOWN`, never `PASSED`. | Pass |
| Export redaction | Known secret, home folder, data folder, environment values and absolute test path absent from Markdown, JSON and JSON with raw output | Pass |
| Local network boundary | `scripts/network-check.mjs` against a real production server | 20 of 20 pass (`docs/phase8-network-check.json`) |

Network boundary results (real server on `127.0.0.1:3100`): answers on loopback; refuses connections on this machine's LAN address (`192.168.1.41`, `ECONNREFUSED`); `Host: evil.example`, `evil.example:3100` and `127.0.0.1.evil.example:3100` get `403`, including on pages and with no data leaked; `localhost`, `127.0.0.1` and `[::1]` get `200`; cross-origin and `Sec-Fetch-Site: cross-site` POSTs get `403` and create nothing; a non-JSON body gets `400`; a 70 KB body gets `413`; security headers present and `X-Powered-By` absent; error bodies carry no stack or path; `/health` reveals nothing.

## Test totals

`npx vitest run`: 22 files, 313 passed, 1 skipped (a Windows symlink test that cannot run without privileges), no Kane, no credits. `npm run lint` and `npm run typecheck` clean. `npm run build` succeeds. `node scripts/ui-e2e.mjs layout` (Phase 5) passed 14 of 14 at 360 px with keyboard flow. `node scripts/ui-e2e.mjs demo` checks the report, clipboard, downloads, evidence and compare screens on the real recorded runs (`docs/phase6-evidence/`).

Test labels: every file under `tests/` states whether it is a ProofLoop application test, a parser fixture or a fake-process test. None of them counts as Kane verification. The real Kane runs are only those named in the Phase 4, 5 and 6 reports.

## Clean install

`node scripts/clean-install-check.mjs` cloned the committed repository (commit `4e3dd41`, which contains phases 0 to 9 apart from the report text and this result file) into a temporary folder and ran, on Node v26.12.1:

| Step | Result | Time |
|---|---|---|
| `git clone` (committed files only) | passed | 1 s |
| `npm ci` | passed, 196 packages, 0 vulnerabilities | 47 s |
| `npm run lint` | passed | 8 s |
| `npm run typecheck` | passed | 9 s |
| `npm test` | passed, 313 tests, 1 skipped, no Kane, no credits | 20 s |
| `npm run build` | passed | 23 s |

The result is `docs/phase8-clean-install.json` (local folder names replaced by `<repo>` and `<temp folder>`). It proves the committed files are enough to install and pass. It did not start Kane, and it does not prove a fresh machine has `kane-cli` and Chrome; the README lists those prerequisites and the app reports a missing Kane as `PREREQUISITE_FAILED`.

## Gaps

- **Windows only, one machine.** The scripts assume `cmd`, Chrome in its default folder and `taskkill`. Nothing was run on Linux or macOS.
- **No CSP beyond `frame-ancestors`.** A script-source policy would need nonces for Next.js and the animation libraries; not attempted.
- **The Host guard allows any port** on a loopback name by design. Another local program can still talk to ProofLoop; that is outside the threat model (single-user, local).
- **Test files run as trusted code.** Anyone who can write a test file through the dashboard can make Kane do what the file says on this machine. The write endpoint is protected by the origin and host checks only; there is no login.
- **No load test.** Nothing was measured for 1,000 records (the plan's p95 target); SQLite queries are indexed but unmeasured at that size.
- **Live Kane re-runs of every failure mode** (no auth, no Chrome) were not repeated against the real CLI in this phase; they are covered by the Phase 3 and 4 fake-process tests and Phase 0 observations.
- **No CI** (optional in the plan).
