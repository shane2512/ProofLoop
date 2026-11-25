# Phase 5 report: Frontend and Dashboard

**Result: PASS, with the gaps listed below.** The Definition of Done ("user can configure project and start/view one real run") was met through the browser UI against real Kane, not through the API.

## What was built

Dashboard under `/workspace`, in `src/components/workspace/` with a typed client in `src/lib/`:

- Project list, empty/loading/error states, create form (server validation shown beside the field it names). Project page with edit and archive.
- Criteria: add, edit, delete with confirmation. Statuses come from the server only; the UI has no control that sets a status. A stale pass shows the server's `statusNote` in words.
- Test file authoring: pick an existing file, write a new one (starter template with the project's URL), edit one. A warning says how many criteria use a file before saving over it.
- Run confirmation that states: real Kane browser run, uses credits (not estimated), uploaded to the user's TestMu Test Manager, one run at a time.
- Run panel: polls `GET /runs/:id` every 1.5 s while active, shows "nothing here is a pass until then" while running, offers Cancel (the UI does not claim `CANCELED` until the record says so), and on a failed read keeps the last record, says contact was lost and keeps retrying.
- Result: status, exit code, duration, snapshot of what was run, Kane's steps/assertions, Kane's failure diagnosis labelled "Kane's diagnosis (not ProofLoop's)", evidence available/unavailable with reason, raw stdout and stderr (fetched only when opened), events, redacted command.
- Run history with "Load older runs" (keyset pages of 10).
- Error wording and remedies for NETWORK, RUNNER_BUSY, PREREQUISITE_FAILED, TEST_MAPPING_INVALID, CRITERION_LIMIT, VALIDATION_ERROR, CONFLICT, NOT_FOUND, FORBIDDEN_ORIGIN, PAYLOAD_TOO_LARGE, OUTPUT_UNAVAILABLE, STORAGE_ERROR.

## Scope additions (not in the original INT list)

1. **Test file endpoints**: `GET /projects/:id/test-files`, `GET|PUT /projects/:id/test-files/:name`. Needed because the browser cannot write to disk. The browser sends a name and content, never a path; names are `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`, content is at most 48 KiB, writes use the same traversal/symlink checks as criterion mappings, and cross-origin writes get 403. Test files are trusted code (SEC-010), so this is a local-user feature.
2. **Raw output endpoint** (INT-014, listed in `api-spec.md` but not built until now): `GET /runs/:id/output?stream=stdout|stderr`. Returns the saved, already-redacted text; any stored path outside `data/runs/<run-id>/` is treated as unavailable.

`api-spec.md` documents both. Edits in `../proofloop/` are not in a git repo.

## Evidence

All commands run in `proofloop-app/` on Windows, Node v26.12.1.

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean (includes compile-time check that client API types equal the server's) |
| `npx vitest run` | 17 files, 226 passed, 1 skipped (Windows symlink test, pre-existing) |
| `npm run build` | succeeds; new routes `/workspace/projects/[projectId]`, test-files, output |
| `node scripts/ui-e2e.mjs layout` | 14 of 14 checks passed, no console errors |
| `node scripts/ui-e2e.mjs live` | 20 of 20 checks passed, no console errors |

New tests: `test-files-api` (28: name/path/size/origin/symlink/stale-pass/output containment), `ui-project-list` (5), `ui-project-view` (26: criteria, 5-criterion limit, confirmation, run to terminal, failure labelling, RUNNER_BUSY/424/422, lost contact and recovery, cancel, resume, lazy raw output, history paging, keyboard), `api-types-compat`. Component tests use a fake HTTP API and fixture run records. They test ProofLoop's UI and are not Kane verification.

### Real browser, 360 px and keyboard (headless Chrome 360x800, no Kane started)

No horizontal scroll on the workspace or project page; every `.ws-btn` at least 44 px tall; dialogs inside the viewport; form fields 16 px (no iOS zoom). Enter opens the run dialog, Escape closes it, focus returns to the opening button, and Tab never focuses the page behind the dialog (it cycles the dialog's buttons and the browser's own UI, which is native modal behavior). Cancelling the confirmation started no run.

### Real Kane run through the UI (live)

Driven entirely through the dashboard in headless Chrome: create project, write `login_test.md` in the editor, map a criterion, confirm, run. Kane 0.10.9 against `https://www.saucedemo.com/`.

- While running: criterion showed Running (never Verified), the panel said nothing is a pass yet, Run buttons were disabled.
- Finished about 215 s after the click. Stored record: `PASSED`, exit 0, duration 213,982 ms, `errorCode` null, `evidenceAvailable` true.
- UI status equalled the stored record; criterion became Verified because the newest run passed (the server derives that, not the UI). Panel exit code matched.
- Raw stdout was not requested before it was opened; once opened it matched `GET /runs/:id/output` byte for byte (25,540 characters) and contained `test_md_done`.
- Evidence pack listed as available with its relative path inside ProofLoop's data folder.
- 360 px view of the finished run: no horizontal scroll.

Screenshots and the two JSON result files are in `docs/phase5-evidence/`.

**Credits:** not measured. The balance was not read before or after this run. Earlier phases used about 68 credits across several runs, so do not infer a per-run cost from this report. The run was uploaded to the user's TestMu Test Manager like every Kane run.

## Gaps and limits

- **No "open/reveal evidence" action.** The UI shows the evidence file's relative path inside the data folder, and nothing opens it. The spec asks for a separate explicit flow with canonical path validation; not built.
- **A failing real run was not driven through the UI.** The failure panel (Kane's diagnosis label, `EXIT_NONZERO` wording, no Verified) is covered by component tests with fixture records, and a real failing run was observed through the API in Phase 4. No real failing run was clicked through in the browser this phase.
- **One browser.** Real-browser checks used headless Chrome on Windows only. No Firefox, Safari or real phone; 360 px was emulated.
- **Screen readers not tested.** Labels, roles and live regions are in place and checked in jsdom and by keyboard, but no screen reader was run.
- **Credit cost** of the live run is unmeasured (see above).
- **Project list shows no status summary.** Criterion statuses appear only on the project page, to avoid one request per project.
- **Cosmetic:** on a phone, scrolling a run into view can leave the fixed site logo over the top of the content. It is the site's existing difference-blended logo, not dashboard markup.
- **Lenis smooth scroll** is on the site layout. Scrollable areas inside the dashboard (dialogs, raw output) carry `data-lenis-prevent` so they scroll natively. Verified in a real browser only for dialogs and layout, not by wheel-scrolling a long output.
- Report builder, copy flow, evidence/report download (INT-013, INT-015), run comparison and exports remain Phases 6 and 7.
- Dashboard polls; there is no push channel. A run started from another browser tab is picked up on page load or reload, not live.

## Files

New: `src/lib/{api-types,api-client,status}.ts`, `src/components/workspace/*`, `src/server/test-files.ts`, routes `app/api/v1/projects/[projectId]/test-files/**` and `app/api/v1/runs/[runId]/output`, `app/(site)/workspace/projects/[projectId]/page.tsx`, `scripts/ui-e2e.mjs`, `tests/{test-files-api,ui-project-list,ui-project-view,api-types-compat}.test.*`, `tests/{setup-dom.ts,helpers/fake-api.ts}`. Changed: `app/(site)/workspace/page.tsx`, `app/globals.css`, `src/server/{services,errors,verification}.ts`, `vitest.config.mts`, README, build-status page. Dev dependencies added: `jsdom`, `@testing-library/{react,dom,user-event}`.

## Next

Phase 6 (agent feedback and closed loop) needs your approval. Its prerequisite is at least one real failed and one real passed run. Phase 4 produced both through the API and Phase 5 produced a real pass through the UI, but those runs sit in test data folders, so Phase 6 will need a real failed run in the data folder you actually use.
