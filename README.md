# ProofLoop (application)

Local-first app that connects acceptance criteria to Kane CLI browser verification. Specification documents are in `../proofloop/`.

**Status: Phases 0 to 5 are built. Phase 5 (dashboard) is reported in `docs/phase5-report.md`.** Kane behavior was validated on kane-cli 0.10.9 (`docs/phase0-findings.md`). Projects, criteria and runs have a local SQLite store and a REST API under `/api/v1`. The dashboard at `/workspace` creates projects, writes Kane test files, maps criteria, starts real Kane runs and shows each run's recorded result. Agent handoff (Phase 6), comparison and exports (Phase 7) are not built.

Data lives in `PROOFLOOP_DATA_DIR` (default `./data`, gitignored). For real use, point it outside the repository. Reports: `docs/phase1-report.md`, `docs/phase2-report.md`, `docs/phase3-report.md`, `docs/phase4-report.md`, `docs/phase5-report.md`.

Tests: `npm test` runs application, parser-fixture, fake-process and jsdom component tests (no Kane, no credits). `node scripts/ui-e2e.mjs layout` checks the dashboard at 360 px and by keyboard in headless Chrome without starting Kane. `node scripts/ui-e2e.mjs live` drives the whole dashboard and starts one REAL Kane run (uses credits, uploads to Test Manager); it needs the production build and port 3100 free. `npm run test:live-kane` runs the real Kane CLI through the adapter. It needs an authenticated `kane-cli` 0.10.9, Chrome and credits, uploads each run to your TestMu Test Manager, and is never part of `npm test`.

API (local only): `GET/POST /api/v1/projects`, `GET/PATCH/DELETE /api/v1/projects/:id` (DELETE archives), `POST /api/v1/projects/:id/criteria`, `PATCH/DELETE /api/v1/projects/:id/criteria/:criterionId`, `GET /api/v1/health`. Runs: `POST /api/v1/projects/:id/criteria/:criterionId/runs` (body `{}`, returns `202` and polls), `GET /api/v1/runs/:runId`, `GET /api/v1/projects/:id/runs`, `POST /api/v1/runs/:runId/cancel`, `GET /api/v1/runs/:runId/output?stream=stdout|stderr`. Test files (used by the dashboard editor): `GET /api/v1/projects/:id/test-files`, `GET|PUT /api/v1/projects/:id/test-files/:name`. The report and evidence endpoints are not implemented yet.

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

## Pinned versions

Tested on Node.js 26.12.1 and npm 11.11.0 (Windows). `.nvmrc` and `engines` match. Dependency versions are in `package-lock.json`; see `docs/phase1-report.md` for the full environment table.
