# Phase 3 Report: Kane CLI Integration

**Status: PASS with documented gaps.** The adapter exists and is tested at three levels. It is not yet wired to criteria or the database (Phase 4), so "a real run yields an immutable record" is **not yet demonstrated end to end**.

## Scope delivered

Requirements: FR-006, FR-008 to FR-013, KANE-001 to KANE-007, PROC-001 to PROC-006, SEC-002, SEC-004, SEC-010. Part of FR-014 (immutable run record) is Phase 4.

| Module (`src/server/`) | Purpose |
|---|---|
| `kane/command.ts` | Finds the Kane entry without a shell and builds the single fixed argv `testmd run <file> --agent --headless`. Rejects `.cmd`/`.bat` launchers, relative paths, wrong suffix, missing files. |
| `kane/runner.ts` | `spawn` with `shell:false`, stdin closed, an environment allowlist, concurrent stdout/stderr capture with a byte cap and truncation marker, line reassembly across chunks and multibyte characters, wall-clock timeout, cancel, tree-kill. A result is produced only after the process closes (or termination is unconfirmed). |
| `kane/parser.ts` | Line-by-line NDJSON parser. Reads only fields observed on 0.10.9, tolerates unknown events and wrongly typed fields, bounds strings and counts, never throws. |
| `kane/outcome.ts` | Maps process facts to a run status. `PASSED` needs exit 0 and a terminal `passed` event. Anything inconsistent is `UNKNOWN`. ProofLoop's own timeout/cancel flags win over the exit code. |
| `kane/evidence.ts` | Finds and verifies the sealed evidence pack (event id, then stderr hint id, then the single pack in a per-run directory). Copies into the evidence root without overwriting and re-checks size. |
| `kane/preflight.ts` | Finds Kane and compares its version with the validated 0.10.9. Does not check auth, Chrome or credits. |
| `security/redact.ts` | Removes secrets, home paths (plain, forward-slash, JSON-escaped and double-escaped forms), share tokens, bearer tokens and credential flags. Applied to every stdout line, the captured streams and the displayed command. |

Also changed: `config.ts` gains `kaneWorkDir`; `errors.ts` gains `TEST_MAPPING_INVALID` and `PREREQUISITE_FAILED`; `package.json` gains `test:live-kane`.

## Tests executed (agent-run, Windows, Node v26.12.1)

| Command | Result | Label |
|---|---|---|
| `npm run lint` | passed | |
| `npm run typecheck` | passed | |
| `npx vitest run` (normal suite) | 10 files, **123 passed, 1 skipped** | ProofLoop application tests, parser fixture tests, fake-process supervision tests |
| `npm run test:live-kane` | **4 passed** in 115 s | **Live Kane verification** |

The one skipped test is the Windows file-symlink case (needs privilege). Live tests are excluded from `npm test`.

What the live run asserted: preflight finds Kane 0.10.9; the passing file gives exit 0 and `PASSED` with no malformed lines and no home path in output; the failing file gives exit 1, `FAILED` and an `assertion_error.*` reason; evidence is found and verified for both runs; an imported copy exists on disk; a missing file is rejected before any process starts.

What the live run did **not** capture: its per-run console output (exit codes, durations, which evidence source was used) was not saved, so the report does not state them. An earlier partial live run did record exit 1 and a 56–74 s duration for the failing file.

## What the live runs found (details in `docs/phase0-findings.md`, addendum)

1. `test_md_evidence_ingest` was **absent** in one failing run although the pack was written. The adapter now falls back to the stderr hint and then to the single pack in a per-run directory.
2. The same failing test returned two different Kane failure codes (`final_verification` 710, `step_not_achievable` 750) and different reason text. The verdict (exit 1, `failed`) was stable.
3. With `cwd` set to a temporary directory, Kane wrote its evidence there, so per-run isolation works.
4. My redactor missed a double-escaped home path in a unit test. Fixed and covered by a test.

## Definition of Done

| Item | Status |
|---|---|
| Real run yields an immutable record and raw outputs | **Partial.** Raw stdout/stderr, events, exit code, timing and outcome are returned by the runner. Persisting them as an immutable run is Phase 4. |
| Artifact references exist or are explicitly unavailable | **Yes.** Evidence is verified on disk (regular file, zip signature, expected path) or returned with a reason. |
| Never uses a shell | **Yes.** `shell:false` everywhere, including `taskkill`. Covered by tests. |
| Unknown output does not crash | **Yes.** Covered by parser and runner tests. |
| Only an actual run can produce verification | **Yes at the adapter level.** `PASSED` needs exit 0 plus a terminal `passed` event. `VERIFIED` is a Phase 4 decision. |

## Limitations and risks

- **POSIX tree-kill is untested.** It uses a process group (`detached` plus `kill(-pid)`), but only the Windows `taskkill /T /F` path was run.
- **Unconfirmed termination** (a process that ignores the kill) is classified correctly in a unit table but was not reproduced with a real stuck process.
- **Not observed live:** exit code 3, upload failure, auth failure, no credits, Chrome missing, `--timeout` behavior. Those map to `UNKNOWN`/`NOT_STARTED` conservatively.
- **Preflight is shallow.** No machine-readable `whoami`/`balance` output was validated, so auth, Chrome and credits are not checked before a run.
- **Replay after a code change is still untested.** The fail, fix and re-run loop (Phase 6 demo) depends on it.
- **The environment allowlist may be too narrow** for unusual setups (proxies are included; other variables are not). The live runs worked with it.
- **Evidence content is not inspected.** The adapter checks the file and zip signature. It does not run `kane-cli evidence validate` (that worked manually in Phase 0).
- **Account side effects:** every live run uploads to Test Manager and creates test cases. The Phase 3 live runs added about four more runs to the account.

## Decisions needed before Phase 4

1. Per-run working directories must be created by the verification service. Is `data/kane-work/<run-id>/` acceptable, and should old ones be deleted after evidence is imported?
2. Should ProofLoop run `kane-cli evidence validate` on each imported pack (a second process per run), or rely on the signature check?
3. Phase 4 is where `VERIFIED` is decided. I propose a criterion becomes `VERIFIED` only when the newest run is `PASSED` and its test-file snapshot hash equals the current mapped file. Do you want that rule?
