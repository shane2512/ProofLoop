# Phase 4 Report: Verification Engine

**Status: PASS with documented gaps.** A criterion's status is now derived only from real runs recorded by the verification service. The real Kane CLI was driven through that service and a real SQLite database. The browser UI is Phase 5.

## Scope delivered

Requirements: FR-003 to FR-014, KANE-003 to KANE-006, PROC-003 to PROC-006, INT-009 to INT-012.

| Area | What it does |
|---|---|
| `domain/verification.ts` | Run state machine. `QUEUED → RUNNING \| NOT_STARTED \| CANCELED \| UNKNOWN`; `RUNNING → PASSED \| FAILED \| NOT_STARTED \| TIMED_OUT \| CANCELED \| UNKNOWN`. A completed run never changes. |
| `domain/status.ts` | `VERIFIED` only if the **newest** run is `PASSED` and the test file hash, the mapping and the expected behavior are unchanged since that run. Otherwise `UNVERIFIED` with a `statusNote`. |
| `verification.ts` | The service. Validates, atomically creates the run record **before** spawning, returns `QUEUED` at once, runs Kane in the background, saves raw output, imports verified evidence, and stores events, evidence and the final status in one transaction. One active run. Cancel. Startup recovery. |
| `storage/runs.ts`, `evidence.ts`, `criteria.ts`, `db.ts` | Run and evidence persistence, keyset pagination, nested transactions, freshness-aware criterion status. Migration 2 adds `test_file_sha256` (immutable), `error_code`, `command_json`, `kane_result_json`. |
| `kane/testfile.ts` | Resolves a mapped test file inside the managed root and hashes it. |
| Routes | INT-009 start (`202`), INT-010 detail, INT-011 list, INT-012 cancel. The start body must be exactly `{}`. |

## Decisions I took while you were away (please confirm or change)

1. Per-run Kane working directory is `data/kane-work/<run-id>/`, removed after the evidence import and kept if the import fails.
2. Evidence is checked by existence and zip signature only. No `kane-cli evidence validate` process per run.
3. `VERIFIED` rule as above. I also made the **newest run decide**, so a later cancel, timeout or runner failure stops a criterion being `VERIFIED` until a new pass.
4. If the test file changes while a run is in progress, a `PASSED` or `FAILED` result is recorded as `UNKNOWN`, because it cannot be tied to one version of the test.
5. I added the run routes INT-009 to INT-012 in this phase (the plan listed only the service) because the Phase 5 UI needs them and the live test needs a real entry point.

## Tests executed (agent-run, Windows, Node v26.12.1)

| Command | Result | Label |
|---|---|---|
| `npm run lint`, `npm run typecheck` | passed | |
| `npx vitest run` | 13 files, **165 passed, 1 skipped** | ProofLoop application tests (the skipped one is the Windows file-symlink case) |
| `npm run build` | passed, 11 routes | |
| `npx vitest run --config vitest.live.config.mts tests/live/verification.live.test.ts` | **5 passed** in 270 s | **Live Kane verification through the service** |

New application tests: state machine and status rule (`verification-domain`), the service with the fake Kane process (`verification-service`: pass, fail, later failure with history preserved, stale-pass rules, exit 0 without terminal event, exit 2, evidence fallback, missing evidence, one active run, cancel, timeout, missing Kane, missing test file, test file changed during a run, startup recovery, pagination, immutability, no path leakage), and the routes (`verification-api`).

What the live test asserted against real Kane: the passing file ends `PASSED`, exit 0, terminal event `passed`, verified evidence copied into the evidence directory, raw `stdout.log` saved and containing `test_md_done`, no home path in the run detail, the work directory removed, **the test file unchanged after Kane ran**, and the criterion `VERIFIED`. The failing file ends `FAILED`, exit 1, with a Kane reason and evidence, and the criterion `FAILED` while the earlier pass stays `VERIFIED`. Editing the passing test makes the criterion `UNVERIFIED` with `TEST_FILE_CHANGED`, and restoring the file verifies it again. A repeat run is a new record, and the first run reads back identical.

Not captured: vitest hid the per-run console output for passing tests, so this report has no exit code, duration or credit figures from this run.

## Definition of Done

| Item | Status |
|---|---|
| No false `VERIFIED` transitions | **Yes.** `VERIFIED` needs a `PASSED` newest run plus unchanged test hash, mapping and expected behavior. Every non-pass status, a stale pass and a missing hash are covered by tests. |
| A later failed run cannot erase a historic pass | **Yes.** Runs are append-only (service rules plus triggers). The earlier pass stays readable and unchanged. |
| Valid mapping and an actual successful Kane result required | **Yes.** A fake or unmapped run cannot occur in production: the service runs only the fixed Kane command for a validated, hashed file. |
| Exit 0 without criterion-level evidence stays unverified when association is uncertain | **Partly.** Exit 0 without a terminal `passed` event is `UNKNOWN`. Kane's per-step results are not mapped to individual criteria, so the rule is one criterion per test file (enforced by a unique index). |
| Run record exists before spawn; state changes only on observed completion | **Yes.** Tested, including a missing Kane executable (a `NOT_STARTED` record plus a 424). |

## Limitations and risks

- **The fail, fix, re-run loop is still unproven.** The live "repeat run" replays an unchanged test. After an application change, cached replay behavior is untested and will matter for the Phase 6 demo.
- **Interrupted runs:** startup recovery marks them `UNKNOWN`, but an orphaned Kane process may keep running. Nothing tries to find and stop it.
- **Event log is bounded:** 2,000 events and 16 KiB per line are stored. Beyond that, events are dropped and noted in the run summary. Raw stdout is kept in full (up to 10 MiB).
- **Event writes happen after the process closes**, so the status endpoint shows `RUNNING` with no live events until the run completes.
- **Single process only.** The active-run check is atomic in SQLite, but concurrent ProofLoop processes sharing one database were not tested.
- **Timeout default is 300 s.** An authored two-step test took 129 s in Phase 0, so a longer test could be timed out. `KANE_TIMEOUT_SECONDS` is configurable.
- **Kane's account side effects remain:** each live run uploads to Test Manager. This phase added roughly four more runs there.
- **Untested (carried over):** POSIX process-group kill, a process that ignores termination, exit code 3, auth and no-credit failures, Chrome missing.
- **Public report fields:** `kane` and `command` are additions to INT-010 and `statusNote` and `errorCode` are new fields. `api-spec.md` and `database.md` are updated to match.

## Files

Created: `src/server/{domain/verification,verification,context(rewritten),kane/testfile,storage/evidence}.ts`, run routes under `app/api/v1/`, `tests/{verification-domain,verification-service,verification-api}.test.ts`, `tests/live/verification.live.test.ts`.
Modified: `domain/{types,status}.ts`, `storage/{db,runs,criteria,migrations}.ts`, `services.ts`, `errors.ts`, `tests/helpers/fake-kane.mjs`, `tests/storage.test.ts`, `README.md`, and in the spec folder `api-spec.md` and `database.md`.
