# Phase 0 Findings: Kane CLI validation

**Date:** 2026-11-25. **Status: PASS with caveats. Decision: GO** for Phase 3 using `kane-cli testmd run <file> --agent --headless`.

Phase 0 was first skipped at the owner's request and then run as the first step of Phase 3 after the owner approved it. Everything below is observed on one machine unless it is marked "documented".

## Environment

| Item | Value |
|---|---|
| OS | Windows (build and architecture not recorded) |
| Node.js / npm | v26.12.1 / 11.11.0 |
| kane-cli | 0.10.9 (`@testmuai/kane-cli`, installed under `%APPDATA%\npm`) |
| Chrome | installed and launched headless by Kane; version **not recorded** |
| Auth | OAuth profile, token valid (`kane-cli whoami`) |
| Credits | 11,200 before, 11,132.1 after all smoke runs (about 68 consumed) |
| Target | `https://www.saucedemo.com/` (public demo app) |

## Commands run (exact)

All runs used a fixed argv, `stdio: ['ignore','pipe','pipe']`, `shell:false`, started from the repository root as the working directory.

```
node <APPDATA>\npm\node_modules\@testmuai\kane-cli\bin\kane-cli.cjs testmd run <file> --agent --headless
```

The probe is `scripts/kane-probe.mjs`. The first pass-run used `scripts/kane-smoke.cmd`, which did not capture an exit code (see "Gaps").

## Results

| Case | Exit | Wall time | Terminal events | Notes |
|---|---|---|---|---|
| `login_pass_test.md`, first run (authored) | **not captured** | 129 s per `test_md_done.duration_s` | `test_md_done` `passed` | Kane's own process was gone afterward. Exit code unknown. |
| `login_fail_test.md` (authored) | **1** | 90.8 s | `test_md_done` `failed`; `run_end` `failed`, `result_code` 710, `reason_code` `assertion_error.final_verification` | Includes a Kane `verdict` and `test_md_bug_verdict`. |
| `login_pass_test.md`, repeat (replayed) | **0** | 63.1 s | `test_md_done` `passed`; `replay_decisions: 2` | No `credits_consumed`, empty `summary`. |
| `invalid_test.md` (unknown frontmatter key) | **2** | 2.1 s | none (only `stream_start`) | stderr: `error: [<path>:1] unknown config key: not_a_real_key` |
| missing file | **2** | 2.4 s | none (no stdout) | stderr: `error: file not found: <path>` |
| forced kill mid-run | **1** | n/a | none | See "Cancellation". |

Pass and fail are distinguishable by exit code (0 vs 1), by `test_md_done.overall_status`, and by `run_end.reason_code`.

## Facts established

1. `--agent` works on `testmd run`. stdout is NDJSON, one object per line, each with `type`, `v:1` and `ts`. stderr is human text only (a skill-update notice, an evidence hint, advisory lines, and fatal parse/file errors).
2. Exit codes observed match `running.md`: 0 passed, 1 a non-optional step failed, 2 error before the run (parse error, missing file). Code 3 (cancelled/timed out) was not observed.
3. The stream ends with `test_md_done` (file-level `overall_status`, `duration_s`, `session_id`, optional `share_url`). The documented rule holds: do not treat `run_end` as completion. The process closed about 2 s after `test_md_done` in the failing run.
4. Event types seen: `stream_start`, `test_md_step_start`, `bifurcation`, `run_start`, `step_start`, `step_event` (subtypes `screenshot`, `action`, `reasoning`, `cm_init`, `evaluation`, `page_manager`, `assertion`, `replay_started`), `describe_trigger`, `step_end`, `run_end`, `test_md_step_end`, `test_md_bug_verdict`, `test_md_evidence_ingest`, `test_md_bundle_sync`, `test_md_summary`, `coverage`, `test_md_done`.
5. **Inner `step_end` and `step_event.action.success` are not the verdict.** In the passing authoring run an inner `action` had `success:false` and its `step_end` had `status:"passed"`, and the run recovered. The verdict is `test_md_done.overall_status` plus the exit code.
6. `run_end` has two shapes. Authoring: `summary`, `one_liner`, `credits_consumed`, `session_dir`, `context`. Replay: `summary:""`, `reason:"replay completed"`, `actions_executed`, no credits. The parser must tolerate both.
7. For a failure, `run_end.reason` and `reason_code`/`result_code` name the failed assertion text. `run_end.verdict` carries Kane's own diagnosis (`root_cause`, `suggestion`, `confidence`, `family`). It must be labeled "Kane's diagnosis" in reports and not presented as ProofLoop's finding.
8. Evidence: every `testmd run` wrote one sealed pack `<cwd>/.testmuai/evidence/<evidence_id>.evidence` (a zip). `test_md_evidence_ingest.evidence_id` equals the pack filename stem. This ties a run to its pack without guessing. `kane-cli evidence validate <pack> --json` returned `{"valid":true,"status":"finalized"}` (exit 0) for the passing pack and for the failing pack (one warning, `l1.failure.status_disagrees`).
9. The failing pack contains `run.yaml`, `failure.yaml`, per-test `result.yaml`, `test.md`, per-step `screenshot.jpg` and `step.json`, `steps/<n>/failure.yaml` for the failed step, console/network/action logs and trajectory files. **No video was found.** (The pack's contents were listed, not opened in the viewer.)
10. `output-<stem>/Result.md` and `output-<stem>/.internal/` are written next to the test file. `Result.md` has frontmatter `status`, `started`, `duration_s`, `session_id`, then one `## <step> ✓ passed|✗ failed` entry per step.
11. A `.cmd` shim cannot be spawned with `shell:false` on current Node, so the runner spawns `process.execPath` with the package's `bin/kane-cli.cjs` as the first argument. This worked and is the same no-shell guarantee.

## Cancellation (PROC-004)

`taskkill /PID <kane-pid> /T /F` terminated Kane and both new headless Chrome processes. None survived (`newHeadlessChromeStillAliveAfterKill: 0`). Kane's recorded exit code after the forced kill was **1**, with `signal: null`. Exit 1 therefore cannot identify a cancellation. The runner must record its own cancel and timeout flags and classify from them first. The probe filtered to headless Chrome only, so the developer's normal Chrome windows were not counted or touched. Tested once, on one machine. A timeout path and a cancel before Chrome starts were not tested.

## Side effects the owner should know about

- Every run uploaded to the owner's TestMu Test Manager account (`upload.performed: true`) and created a test case there (`testcase_id`, `share_url`). The first passing run also committed (`commit.committed: true`). Local files were written: `tests/kane-smoke/output-*/`, `.testmuai/evidence/`, and sessions under `%USERPROFILE%\.testmuai\kaneai\sessions\`.
- Authoring consumed credits (roughly 14 + 21 credits for the passing test, 5 + 12 + 2 for the failing one, as reported by `run_end`). Replays reported none. The balance fell by about 68 in total, which is slightly more than the sum of per-run figures, so per-run figures are not a complete accounting.
- `run_end.session_dir`, `screenshot_path` and `test_md_bundle_sync.path` are absolute local paths. They must be redacted in reports and exports.

## Documentation conflicts and updates needed

| Document | Statement | Observed or documented fact | Proposed update |
|---|---|---|---|
| `requirements.md` FR-011, KANE-005 | exit codes defined for `run`; "map `testrun run` separately" | `testmd run` has its own documented codes (0, 1, 2, 3) | Add the `testmd` mapping; keep exit 1 as "a non-optional step failed" and not as upload failure |
| `requirements.md` FR-008, KANE-004 | "do not assume a `testmd run --agent` flag" | `--agent` and `--headless` work on `testmd run` in 0.10.9 | Record `--agent --headless` as the validated argv, pinned to 0.10.9 |
| `requirements.md` PROC-001 | spawn fixed executable | `kane-cli` is a `.cmd` shim on Windows | Spawn `process.execPath` with the `.cjs` entry on Windows |
| `requirements.md` PROC-004 | process-tree kill is a risk | `taskkill /T /F` worked once; exit code after kill is 1 | Classify cancel/timeout from ProofLoop flags, not exit code |
| `database.md` | `evidence.relative_path` under the evidence root | Kane writes to `<cwd>/.testmuai/evidence/` | Runner sets `cwd` to a ProofLoop-controlled directory and copies the pack into `PROOFLOOP_EVIDENCE_DIR` after verifying it |
| `database.md` and `api-spec.md` | test path layout differed (`<criterion-id>_test.md` vs `<id>/login_test.md`) | Kane writes `output-<stem>/` next to the test file. The criterion ID does not exist when `testFile` is supplied, so `<criterion-id>_test.md` cannot work. Two tests cannot share a stem in one directory, since that would be the same file | **Resolved:** layout is `tests/<project-id>/<name>_test.md`, `database.md` updated to match `api-spec.md` |

The owner approved these updates. `requirements.md` (FR-008, FR-011, KANE-004/005, PROC-001, PROC-004, new section 14), `database.md`, `architecture.md` and `api-spec.md` were edited to match.

## Risks carried into Phase 3

1. **Replay cache.** After the first successful authoring, later runs replay recorded actions and still re-evaluate assertions, but recordings can go stale when the app changes. The closed-loop demo (fail, fix, re-run) should be validated for replay behavior. `--author` forces re-authoring. Not tested here.
2. **Upload and commit side effects.** `--push` and commits write to the owner's cloud account. The help text mentions a `--local` option that is not listed in `testmd run --help`, so it is unverified and must not be used.
3. **AI-authored steps are not deterministic.** The authored passing test took 129 s and the first run recovered from a failed inner action. A flaky authoring run is possible. The demo should rely on cached replays once a step is authored.
4. **Credits.** Authoring a two-step test cost about 35 credits. Replays reported none.
5. **Exit-code gaps.** Exit 3 (timeout/cancel), an upload failure, an auth failure and a Chrome-launch failure were not observed.

## Gaps (not verified)

- The exit code of the first passing run was not captured (wrapper bug). The repeat run exited 0.
- Chrome and Windows build versions are not recorded.
- Auth failure, no-credit, Chrome-missing and network-down behavior were not triggered.
- `--timeout` behavior was not exercised. Per the docs it is a per-step kill timer, not a whole-run limit, so ProofLoop still needs its own run timeout.
- Evidence screenshots were not viewed, and `kane-cli evidence serve` was not run.
- Non-TTY behavior is covered because stdin was closed in every probe run. Headless is documented as an option.
- Whether a failing `testmd run` with upload failure also returns exit 1 is unverified.

## Go/no-go

**GO.** The documented command is reproducible, the pass and fail outcomes are distinguishable, evidence packs are discoverable and valid, and the spawn path works without a shell. The "evidence cannot be found" gate in `phases.md` does not apply, so manual evidence import is not required. The owner approved the documentation updates and accepted that live runs create test cases in the owner's Test Manager account.

## Addendum from Phase 3 (live runs through the ProofLoop adapter)

Two further live failing runs, driven by `src/server/kane/runner.ts` in an isolated working directory, changed three conclusions above.

1. **Evidence isolation works.** With the child's `cwd` set to a temporary directory, Kane wrote `.testmuai/evidence/<id>.evidence` under that directory and not under the repository. Setting `cwd` per run is therefore a valid way to isolate packs.
2. **`test_md_evidence_ingest` is not always emitted.** In one failing run the stream ended `test_md_summary`, `coverage`, `test_md_done` with no ingest event, yet the pack was written and its id appeared on stderr in `evidence: view locally with kane-cli evidence serve <path>\<id>.evidence`. Fact 8 above ("the id ties a run to its pack") is only true when the event is present. The adapter now tries, in order: the event id, the stderr hint id, then the single pack in a per-run directory. Each candidate is verified on disk. Several packs in one directory are treated as ambiguous and none is chosen. This is sound only if every run gets its own working directory.
3. **Kane's failure code is not deterministic.** The same failing test reported `assertion_error.final_verification` (result 710) in one run and `assertion_error.step_not_achievable` (result 750) in another, with a different `reason` text and, in the second run, no failed `assertion` event. Reports must quote Kane's reason as observed and must not rely on one specific code. The FAILED verdict itself was stable: exit 1 and `test_md_done.overall_status: failed` both times.
