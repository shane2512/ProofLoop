# ProofLoop (application)

Local-first app that connects acceptance criteria to Kane CLI browser verification. Specification documents are in `../proofloop/`.

**Status: Phase 2 complete (backend and data layer). Kane validation (Phase 0) done on kane-cli 0.10.9, see `docs/phase0-findings.md`. Phase 3 (Kane adapter) and Phase 4 (verification engine) complete and live-tested. There is still no UI beyond a status page (Phase 5).** Projects and criteria have a local SQLite store and a REST API under `/api/v1`. There is no UI beyond a status page and no Kane execution yet. Phase 0 (Kane validation) was skipped at the owner's request. Kane version, command behavior, exit codes, and evidence locations are **not validated** and must be checked before Phase 3.

Data lives in `PROOFLOOP_DATA_DIR` (default `./data`, gitignored). For real use, point it outside the repository. Reports: `docs/phase1-report.md`, `docs/phase2-report.md`, `docs/phase3-report.md`, `docs/phase4-report.md`.

Tests: `npm test` runs application, parser-fixture and fake-process tests (no Kane, no credits). `npm run test:live-kane` runs the real Kane CLI through the adapter. It needs an authenticated `kane-cli` 0.10.9, Chrome and credits, uploads each run to your TestMu Test Manager, and is never part of `npm test`.

API (local only): `GET/POST /api/v1/projects`, `GET/PATCH/DELETE /api/v1/projects/:id` (DELETE archives), `POST /api/v1/projects/:id/criteria`, `PATCH/DELETE /api/v1/projects/:id/criteria/:criterionId`, `GET /api/v1/health`. Runs: `POST /api/v1/projects/:id/criteria/:criterionId/runs` (body `{}`, returns `202` and polls), `GET /api/v1/runs/:runId`, `GET /api/v1/projects/:id/runs`, `POST /api/v1/runs/:runId/cancel`. Report, output and evidence download endpoints are not implemented yet.

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
| `/workspace` | Live server readout (moved from the old `/` status page); dashboard arrives in Phase 5 |

Motion uses GSAP ScrollTrigger and Lenis (`src/components/motion/`). Pages stay server-rendered and opt in with `data-*` attributes; everything is reverted on route change. Reduced-motion users get a static page and native scrolling, and content is never left hidden if scripts fail to load. Visuals (`src/components/visual/`) are procedural canvas and CSS, with no image assets.

Visual QA: `node scripts/shoot.mjs <url> <outDir> <label> 1440x900 0,1,2` takes headless Chrome screenshots at scroll positions (viewport multiples).

## Layout

- `app/(site)/`: site pages and the shared nav/footer layout. `app/api/v1/`: the local API.
- `src/components/{site,motion,visual}`: client and server UI components.
- `src/server/{domain,storage,kane,reports,security}`: server-only modules, each marked `server-only`.
- `src/server/config.ts`: validated configuration (loopback host required).
- `tests/`: application tests. These are ProofLoop tests, not Kane verification.

## Pinned versions

Tested on Node.js 26.12.1 and npm 11.11.0 (Windows). `.nvmrc` and `engines` match. Dependency versions are in `package-lock.json`; see `docs/phase1-report.md` for the full environment table.
