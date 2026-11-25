# Phase 2 Report: Backend and Data Layer

Status: **PASS with documented gaps** (see "Not verified" and "Deviations").

## Scope delivered

Requirements: FR-001 to FR-005, FR-014 (storage side), TR-005, TR-006, INT-001 to INT-008, INT-016, SEC-003, SEC-008, SEC-009.

- SQLite via the built-in `node:sqlite` module (SQLite 3.54.0 on Node v26.12.1, foreign keys verified on). No extra dependency. Node's docs label this API release candidate, so the driver choice is recorded here and in the lockfile-free runtime pin (`engines`, `.nvmrc`).
- Versioned migration `1_initial` (schema from `database.md`), applied in a transaction, idempotent, tracked in `schema_version`.
- Database-level guards: triggers make run identity and snapshot columns immutable, make completed runs append-only, and block run deletion.
- Repositories for projects, criteria, runs and run events. The 5-active-criteria limit is checked and the row inserted in one `BEGIN IMMEDIATE` transaction.
- Validators for project, criterion, URL and managed test paths. Unknown fields are rejected.
- Routes INT-001 to INT-008 and INT-016. Mutations check content type, a 64 KiB body cap and a local-origin rule.
- No route creates runs and nothing executes Kane. Run storage exists only for Phase 3 and 4 and for tests.

## Files

Created: `src/server/{domain/types,domain/status,domain/validation,security/url,security/paths,storage/db,storage/migrations,storage/projects,storage/criteria,storage/runs,services,context,http}.ts`, `app/api/v1/projects/**/route.ts`, `tests/{validation,paths,storage,api}.test.ts`, `docs/phase2-report.md`.
Modified: `src/server/errors.ts`, `app/api/v1/health/route.ts`, `app/page.tsx`, `tests/paths.test.ts` (skip instead of silent pass), `README.md`.

## Tests executed (agent-run, Windows, Node v26.12.1)

All are **ProofLoop application tests**. None is Kane verification, and no stored run is a Kane result.

| Command | Result |
|---|---|
| `npm run lint` | passed, no output |
| `npm run typecheck` | passed, no output |
| `npx vitest run --reporter=verbose` | 5 files, 59 passed, 1 skipped (60) |
| `npm run build` | passed; all 7 routes listed, `node:sqlite` bundles under Turbopack |

Skipped: "rejects a file symlink". Windows refuses to create file symlinks without privilege. The directory-junction escape test ran and passed.

Live HTTP smoke test (built server, `127.0.0.1:3100`, real `fetch`):

- `/health` returned 200 `{"status":"ok","storage":"ready"}`.
- Project create returned 201, and 5 criteria returned 201 each.
- The 6th criterion returned 409.
- A `../x_test.md` path returned 400, and an `ftp://` URL returned 400.
- A cross-origin POST returned 403.
- After stopping and restarting the server, the project, its name and all 5 criteria were returned, and the list had 1 project. The data directory held the SQLite files and `tests/`.
- Smoke data and the temporary script were deleted afterwards.

## Definition of Done check

| Item | Result |
|---|---|
| Records survive restart | Yes (unit test with reopen, plus live server restart) |
| History cannot be overwritten through update APIs | Yes. No API updates runs, and triggers block snapshot edits, completed-run edits and deletes |
| Invalid schemes/paths/count/length reject with stable codes | Yes (`VALIDATION_ERROR` 400, `CRITERION_LIMIT` 409, `CONFLICT` 409, `NOT_FOUND` 404, `PAYLOAD_TOO_LARGE` 413) |
| CRUD API matches `api-spec.md` | Yes, with the deviations below |
| Traversal/symlink test | Traversal and directory-junction pass. File-symlink test skipped (privilege) |

## Deviations from the specification

1. New error code `FORBIDDEN_ORIGIN` (403) for the SEC-008 origin check. `api-spec.md` does not list 403.
2. Added a partial unique index so two active criteria in one project cannot map to the same `test_file`. This enforces the one-criterion-one-test rule from `phases.md` Phase 4 and returns 409 `CONFLICT`.
3. `deriveCriterionStatus` maps a `PASSED` run to `VERIFIED` on the newest run only. No API can create a run yet, so no criterion can become `VERIFIED` through the product. Phase 4 must add the mapping and snapshot checks before that mapping is relied on.
4. The origin check allows requests with no `Origin` and no `Sec-Fetch-Site` header (for example `curl`). It blocks browser cross-site requests, which is the local threat it targets. It is not authentication.
5. `database.md` shows tests at `tests/<project-id>/<criterion-id>_test.md`, while the `api-spec.md` example uses `<id>/login_test.md`. Phase 2 accepts any managed relative path ending in `_test.md`. The conflict is not resolved here.

## Not verified

- Restrictive file permissions (TR-006, SEC-007): the POSIX 0700 check exists but cannot run on Windows. Windows ACLs were not checked.
- The p95 under 1 second at 1,000 runs (TR-008) was not measured.
- Corrupted database and disk-full behavior were not tested.
- The `503 degraded` health response path was not exercised.
- Concurrent writers: only one process is supported, and no multi-process test exists.
- Migration from a prior released schema: only version 1 exists.

## Remaining concerns

- The server on port 3000 (PID 5372, started by the owner earlier) predates the Phase 2 build. Restart it to run the current build.
- `PROOFLOOP_DATA_DIR` defaults to `./data` under the working directory, which is gitignored. TR-006 asks for a directory outside source and build directories. Set it to a path outside the repo for real use.
- Phase 0 is still skipped. Kane behavior remains unvalidated.
