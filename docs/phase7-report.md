# Phase 7 report: Verification history and reporting

**Result: PASS.** Every run is kept and readable, two runs of a criterion can be compared without any claim about cause, and reports and exports match the written API contract.

## What was built

- **Comparison**: `GET /runs/compare?a=&b=` (FR-020). Two different finished runs of the same criterion. It returns each run's recorded facts and a list of the fields that differ. Rejected: the same run twice, runs of different criteria, a missing parameter (`400`); unknown run (`404`); a run still active (`409`). The dashboard's "Compare with another run" puts the earlier run first and warns when the expected behavior or the test file differed between the two runs.
- **Evidence references** (INT-015): `GET /runs/:id/evidence`, plus `GET /runs/:id/evidence/:evidenceId` to download one file. Every evidence entry is re-checked against the disk on each read, including inside run detail, reports and comparisons, so nothing links to a file that has gone. A stored path that escapes the evidence folder, a symlink, or an id that belongs to another run all give `404`.
- **History**: a "Show runs for" filter by criterion, keyset pagination ("Load older runs"), and the run panel reached from the history or from the criterion.
- **Exports**: Markdown and JSON (`schemaVersion: 1`, `kind: "proofloop.run-report"`). Raw stdout and stderr are in the JSON only with `includeOutput=true`. The contract is in `../proofloop/api-spec.md`.
- The Phase 5 gap "no way to open evidence" is closed as a local download link, not as a "reveal in folder" action, because that would mean starting a helper process.

## Tests

| Check | Result |
|---|---|
| `tests/reports-api.test.ts` | Evidence listing without absolute paths; download bytes; a deleted file is unavailable everywhere and cannot be downloaded; another run's id, an unknown id, a traversal id and a tampered stored path all refused; a failed run compared with a later pass leaves both records unchanged; bad comparisons refused |
| `tests/hardening.test.ts` | After closing and reopening the database: both runs, both reports (byte for byte), the criterion's `VERIFIED` status, saved output and a comparison are still there |
| `tests/ui-report-compare.test.tsx` | Compare: only other finished runs are offered, earlier run goes first, differences marked, no causal wording, warning when the checked thing changed, failure shown; evidence download link only for available evidence; history filter |
| `tests/api-types-compat.test.ts` | Compile-time check that the client's API types match the server's |

Real data: `docs/demo/closed-loop/03-compare.json` is a comparison of the real failed and passed runs from Phase 6.

## Decisions

1. **"Open/reveal" became "download".** The spec asks for an explicit local flow with canonical path validation. A download link meets that without spawning a process.
2. **Evidence is re-verified on read, not at write time only.** It costs one file check per entry and removes a whole class of stale links.
3. **The comparison reports differences and nothing else.** It will not say a fix "caused" a pass.

## Gaps

- **Bounded history, not retention settings.** Nothing is ever deleted, so the data folder grows. The optional "retention settings" were not built. Per-run output is capped (10 MiB per stream by default) and events at 2,000 per run.
- **`evidenceAvailable` in a history list** still comes from the stored record, not a fresh disk check, so a row can say "evidence saved" for a file deleted since. Run detail, reports and exports do re-check.
- **Comparison is per criterion and two runs.** No multi-run timeline chart; the history list is the timeline.
- **No evidence viewer.** ProofLoop confirms and serves the `.evidence` file. It does not open or validate its contents, and Kane's own viewer (`kane-cli evidence serve`) is the way to look inside it.
