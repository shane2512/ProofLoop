# ProofLoop (application)

Local-first app that connects acceptance criteria to Kane CLI browser verification. Specification documents are in `../proofloop/`.

**Status: Phase 2 complete (backend and data layer). Kane validation (Phase 0) done on kane-cli 0.10.9, see `docs/phase0-findings.md`. Phase 3 (Kane adapter) complete and live-tested; it is not wired to the API yet (Phase 4).** Projects and criteria have a local SQLite store and a REST API under `/api/v1`. There is no UI beyond a status page and no Kane execution yet. Phase 0 (Kane validation) was skipped at the owner's request. Kane version, command behavior, exit codes, and evidence locations are **not validated** and must be checked before Phase 3.

Data lives in `PROOFLOOP_DATA_DIR` (default `./data`, gitignored). For real use, point it outside the repository. Reports: `docs/phase1-report.md`, `docs/phase2-report.md`, `docs/phase3-report.md`.

Tests: `npm test` runs application, parser-fixture and fake-process tests (no Kane, no credits). `npm run test:live-kane` runs the real Kane CLI through the adapter. It needs an authenticated `kane-cli` 0.10.9, Chrome and credits, uploads each run to your TestMu Test Manager, and is never part of `npm test`.

API (local only): `GET/POST /api/v1/projects`, `GET/PATCH/DELETE /api/v1/projects/:id` (DELETE archives), `POST /api/v1/projects/:id/criteria`, `PATCH/DELETE /api/v1/projects/:id/criteria/:criterionId`, `GET /api/v1/health`. Run endpoints are not implemented.

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

## Layout

- `app/`: routes and UI (thin).
- `src/server/{domain,storage,kane,reports,security}`: server-only modules, each marked `server-only`.
- `src/server/config.ts`: validated configuration (loopback host required).
- `tests/`: application tests. These are ProofLoop tests, not Kane verification.

## Pinned versions

Tested on Node.js 26.12.1 and npm 11.11.0 (Windows). `.nvmrc` and `engines` match. Dependency versions are in `package-lock.json`; see `docs/phase1-report.md` for the full environment table.
