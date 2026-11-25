# Phase 6 report: Agent feedback and closed loop

**Result: PASS.** A person can go from a real failure, to a copied report, to a fix, to a new real run, and ProofLoop never talks to the agent. The failure and the pass below were produced by the real Kane CLI, not by fixtures.

## What was built

- `src/server/reports/agent-feedback.ts`: a pure function from one stored run record to a Markdown report. Same record, same text.
- `src/server/reports/common.ts`: output tail excerpt, safe code fences, command reduced to `kane-cli testmd run <file name> ...`, and `scrubDataDir` (hides ProofLoop's own data folder in every path spelling saved output uses).
- `GET /runs/:id/report?format=markdown|json` (INT-013). The run must be finished (`409` while active). Output is redacted again before it is returned.
- Dashboard: for a finished run, a "Report for your coding agent" section shows the report, **Copy report** (with a select-and-Ctrl+C fallback when the browser blocks the clipboard), **Download Markdown**, **Download JSON**, and a separate disclosure for **JSON with raw output**.
- Redaction now also hides Test Manager project and test-case ids (account identifiers, not credentials) in links and summaries.

## What the report contains (FR-017)

Project, target URL, criterion title, expected behavior, step label, notes and test file as they were when the run started; run id; status in words; exit code, signal, timed-out and canceled flags, duration, timestamps, ProofLoop error code and summary; Kane's final result event and version; Kane's steps and assertions; Kane's own failure diagnosis, labelled as Kane's and unchecked; the last 25 non-empty lines of stdout and stderr (each cut at 500 characters); evidence references; the command; status-specific instructions; and a "Not recorded" list. Anything missing is written as `Not available (reason)` and listed. The instructions tell the reader to propose the smallest fix, not to edit the Kane test unless the criterion is wrong, and not to claim the criterion is verified. For `TIMED_OUT`, `CANCELED`, `UNKNOWN` and `NOT_STARTED` runs the report says no pass or fail was established and not to treat it as an application defect. For a pass it asks for no fix.

## Real closed loop (live Kane, kane-cli 0.10.9, Windows)

Demo shop in `demo/shop/` with one planted defect: after login it redirects to `/products`, but the page is served at `/inventory`. Procedure and files: `demo/README.md`, `scripts/demo-loop.mjs`, output in `docs/demo/closed-loop/`.

| Step | What happened |
|---|---|
| Preflight (no Kane) | Login redirected to `/products`, which answered 404. The script refuses to run the failing phase unless the defect is present. |
| Run 1, real Kane | `1bd8a628-1c27-40eb-be93-d0df043b0b7c`: **FAILED**, exit 1, 135.2 s, Kane's final event `failed`, step 1 passed and step 2 failed, evidence pack saved and verified. Criterion status: `FAILED`. |
| Kane's diagnosis (quoted in the report as Kane's) | "Login navigated to /products, but the page shows only Page not found instead of Products." Its suggestion: fix the post-login route or restore the page at /products. |
| Report | `01-fail-report.md` and `.json` generated from the stored record. |
| Fix | I read the report and made a one-line change in `demo/shop/server.mjs`: the redirect target became `INVENTORY_PATH`. This was done by hand in this session, acting as the coding agent. ProofLoop did not make or trigger it. |
| Preflight again | Login redirects to `/inventory`, which answers 200 with the Products heading. |
| Run 2, real Kane | `70333158-c2c5-47c1-bf5c-82ac883e53d0`: **PASSED**, exit 0, 94.4 s, Kane's final event `passed`, both steps passed, evidence pack saved. Criterion status: `VERIFIED`, because the newest run passed and the test file and expected behavior were unchanged. |
| Comparison | `03-compare.json`: status, exit code, error code, summary, timings, Kane's final result and step counts differ. Expected behavior and test file are identical in both runs, so both runs checked the same thing. |
| History | Run 1 still reads back `FAILED` unchanged; both runs are listed. |

Not measured: credits used by the two runs (the balance was not read). Both runs were uploaded to your TestMu Test Manager.

## Tests

| Check | Result |
|---|---|
| `tests/reports.test.ts` (fixture records) | Deterministic output; every section; null and missing fields labelled and never printed as `null`; no absolute paths; fence breakout; tail excerpt; failed, passed and non-result statuses; JSON schema 1, no raw output by default; comparison lists only recorded differences and no causal words; data-folder scrubbing |
| `tests/reports-api.test.ts` (routes, fake Kane process) | Markdown and JSON reports, attachment headers, `includeOutput` rules and `400`s, `409` while running, `404`, redaction of a known secret and the home folder in every format, missing saved output, immutability after the criterion is edited |
| `tests/ui-report-compare.test.tsx` (component) | Report shown read-only, copy on request only, clipboard-denied and no-clipboard fallbacks, download links (raw output only behind its own link), retry after an error, report absent while a run is active |
| `tests/redact.test.ts` | Test Manager ids hidden, including JSON-escaped; ordinary text untouched |

One real defect found while testing: the report text box and its section had the same accessible name, which would confuse screen-reader users. The text box is now named "Report text".

## Gaps

- **Agent correction was done by me, by hand.** The handoff to an agent is manual by design. This proves the report is usable by an agent, not that any particular agent fixes it. No third-party coding agent was driven.
- **One planted defect on one local demo app.** It shows the loop works end to end. It is not evidence about real applications. Kane reached `127.0.0.1` fine here, but this was one machine.
- **"Relevant" output excerpt is the last 25 lines, unfiltered.** That rule is deterministic and honest, and it is long on a busy Kane stream. A smarter selection would be a guess, so it was not done. The full output is in the JSON export on request.
- **No official coding-agent skill** (optional in the plan). Not built.
- **Credits** for the two real runs are not measured.
