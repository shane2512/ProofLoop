# ProofLoop (application)

Local-first app that connects acceptance criteria to Kane CLI browser verification. Specification documents are in `../proofloop/`.

**Status: the planned feature set (phases 0 to 8) is built and tested, and the submission kit (phase 9) is prepared. Publishing, the demo video and the public posts are not done, because they need your accounts.** Kane behavior was validated on kane-cli 0.10.9 (`docs/phase0-findings.md`).

What it does: projects and acceptance criteria live in a local SQLite store. You map each criterion to a Kane test file, start a real Kane run from the dashboard at `/workspace`, and see the recorded result, raw output and verified evidence. A criterion's status comes only from its newest run. From a finished run you can copy or download a factual Markdown report to give to your own coding agent (ProofLoop never contacts an agent), export JSON, compare two runs of a criterion, and keep the full history.

What it does not do: call a coding agent, edit your code, run more than one Kane run at a time, or answer anything but loopback requests. Only one machine setup was tested (Windows, Node 26.12.1, kane-cli 0.10.9, Chrome). See "Limits" below and `docs/phase9-report.md`.

Closed-loop demo with real Kane runs (planted bug, failure, report, fix, pass): `demo/README.md`.

Data lives in `PROOFLOOP_DATA_DIR` (default `./data`, gitignored). For real use, point it outside the repository. Per-phase reports: `docs/phase1-report.md` to `docs/phase9-report.md`; Phase 9 also has `docs/phase9-submission-kit.md`.

Tests: `npm test` runs application, parser-fixture, fake-process and jsdom component tests (no Kane, no credits). `node scripts/ui-e2e.mjs layout` checks the dashboard at 360 px and by keyboard in headless Chrome without starting Kane. `node scripts/ui-e2e.mjs live` drives the whole dashboard and starts one REAL Kane run (uses credits, uploads to Test Manager); it needs the production build and port 3100 free. `npm run test:live-kane` runs the real Kane CLI through the adapter. It needs an authenticated `kane-cli` 0.10.9, Chrome and credits, uploads each run to your TestMu Test Manager, and is never part of `npm test`.

API (local only): `GET/POST /api/v1/projects`, `GET/PATCH/DELETE /api/v1/projects/:id` (DELETE archives), `POST /api/v1/projects/:id/criteria`, `PATCH/DELETE /api/v1/projects/:id/criteria/:criterionId`, `GET /api/v1/health`. Runs: `POST /api/v1/projects/:id/criteria/:criterionId/runs` (body `{}`, returns `202` and polls), `GET /api/v1/runs/:runId`, `GET /api/v1/projects/:id/runs`, `POST /api/v1/runs/:runId/cancel`, `GET /api/v1/runs/:runId/output?stream=stdout|stderr`. Reports and history: `GET /api/v1/runs/:runId/report?format=markdown|json[&includeOutput=true]`, `GET /api/v1/runs/:runId/evidence`, `GET /api/v1/runs/:runId/evidence/:evidenceId` (local file download), `GET /api/v1/runs/compare?a=:runId&b=:runId`. Test files (used by the dashboard editor): `GET /api/v1/projects/:id/test-files`, `GET|PUT /api/v1/projects/:id/test-files/:name`. Full contract: `../proofloop/api-spec.md`.

A criterion is `VERIFIED` only when its newest run passed in real Kane and its test file, mapping and expected behavior are unchanged since. Put test files under `<PROOFLOOP_TESTS_DIR>/<project-id>/<name>_test.md`.

## Setup (Windows, Command Prompt)

```
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

Then open http://127.0.0.1:3000 and http://127.0.0.1:3000/api/v1/health. Copy `.env.example` to `.env` to change settings. Never put Kane credentials in `.env`.

The npm scripts bind to `127.0.0.1` only. Do not expose the app to a network.

## Site

The app now opens on a marketing site that explains the product honestly (unbuilt features are labeled with their phase):

| Route | Content |
|---|---|
| `/` | Landing: halo hero, pinned ink-bloom scene, bento of how a criterion is verified |
| `/workflow` | The six-step loop as a sticky card stack, plus the real build status |
| `/evidence` | What each run records, the six run outcomes, criterion statuses |
| `/faq` | Plain answers, including limits and the TestMu dashboard overlap |
| `/docs` | Setup, Kane connection, test file location, configuration, local API |
| `/workspace` | The dashboard: project list and creation, with the live server readout |
| `/workspace/projects/:id` | One project: criteria, test file editor, run confirmation, live run panel, run history |

Motion uses GSAP ScrollTrigger and Lenis (`src/components/motion/`). Pages stay server-rendered and opt in with `data-*` attributes; everything is reverted on route change. Reduced-motion users get a static page and native scrolling, and content is never left hidden if scripts fail to load. Visuals (`src/components/visual/`) are procedural canvas and CSS, with no image assets.

Visual QA: `node scripts/shoot.mjs <url> <outDir> <label> 1440x900 0,1,2` takes headless Chrome screenshots at scroll positions (viewport multiples).

## Layout

- `app/(site)/`: site pages and the shared nav/footer layout. `app/api/v1/`: the local API.
- `src/components/{site,motion,visual}`: client and server UI components. `src/components/workspace/`: the dashboard. `src/lib/`: typed API client, API types and status wording used by the dashboard.
- `src/server/{domain,storage,kane,reports,security}`: server-only modules, each marked `server-only`.
- `src/server/config.ts`: validated configuration (loopback host required).
- `tests/`: application tests. These are ProofLoop tests, not Kane verification.

## Security boundary

- Loopback only. The npm scripts bind `127.0.0.1`, and a request-level guard (`proxy.ts`) answers `403` to any request whose `Host` is not `127.0.0.1`, `localhost` or `[::1]`, which blocks DNS-rebinding from other web pages. Cross-origin writes get `403`. Bodies are limited to 64 KiB and must be JSON.
- Kane runs without a shell, with an allow-listed environment, in a per-run folder. Output is redacted (known secret values, your home folder, Test Manager share tokens, bearer tokens, credential flags) before it is stored, and again when a report is built. Reports and exports never contain the data folder path, environment values, or absolute command paths.
- Reports carry only the last 25 lines of each stream. Full stdout and stderr are in the JSON export only when you ask for it with `includeOutput=true`.
- Test files are trusted code: Kane runs what they say. The Node child process is not a sandbox. Do not run ProofLoop for other people or against targets you are not allowed to test.
- Checks: `node scripts/network-check.mjs` (host guard, CSRF, headers, not reachable on this machine's LAN address), `node scripts/clean-install-check.mjs` (clone, `npm ci`, lint, typecheck, tests, build from committed files only).

## Hosted showcase (not the app)

The app needs your machine: Kane, Chrome and a local data folder. A hosted copy can only show the marketing pages. Setting `PROOFLOOP_PUBLIC_SITE=1` (done on the Vercel project) switches `proxy.ts` to a read-only mode: GET and HEAD for `/`, `/workflow`, `/evidence`, `/faq` and `/docs` are served, `/workspace` (and anything under it) shows the "Run it on your machine" steps from `/run-locally` at the same address, and the whole API and every other path return 404. No project, run or file can be created there, and no Kane process can start. Without that variable the app answers loopback requests only. The policy is in `src/server/security/request-policy.ts` and tested in `tests/request-policy.test.ts`.

## Limits

- One Kane run at a time. One machine setup tested (Windows, Node 26.12.1, kane-cli 0.10.9, Chrome). No Linux or macOS run, no screen-reader test.
- A Kane run uses credits and is uploaded to your TestMu Test Manager. ProofLoop does not estimate cost. It overlaps with the Test Manager dashboard; what it adds is criteria to evidence to handoff, kept locally.
- `Verified` means the newest real Kane run of that test passed and the test, mapping and expected behavior are unchanged since. It says nothing about the rest of the app.
- Evidence is a Kane `.evidence` pack that ProofLoop confirms exists and downloads on request. It does not open, validate or interpret the pack.
- Output saved per stream is capped (10 MiB by default); a cut stream is marked.

## Pinned versions

Tested on Node.js 26.12.1 and npm 11.11.0 (Windows). `.nvmrc` and `engines` match. Dependency versions are in `package-lock.json`; see `docs/phase1-report.md` for the full environment table.
