# Phase 9 report: Packaging and demo

**Result: INCOMPLETE, by necessity.** Everything that can be prepared and checked from this repository is done. The items that need your accounts, your voice or your confirmation of facts I cannot see are not done, and nothing here claims they are. The plan's Phase 9 Definition of Done ("all user-provided submission items complete") is therefore not met.

## Done and checked

| Item | Evidence |
|---|---|
| Local runtime documented | `README.md` (setup, ports, loopback, limits, security boundary), `/docs` page of the app |
| A real failure, a report, a fix and a real pass of one criterion | `docs/phase6-report.md`, `docs/demo/closed-loop/` (two real Kane runs, both reports, the comparison) |
| Demo can be repeated from the README | `demo/README.md`, `scripts/demo-loop.mjs fail` then `pass`. The script refuses to run a phase if the shop is in the wrong state, so a stale demo cannot produce a misleading result. |
| The report screens work on the recorded real runs | `docs/phase6-evidence/` (Chrome at 1280 px and 360 px: report, copy, downloads, evidence download, comparison) |
| Clean clone installs and passes | `docs/phase8-clean-install.json` |
| Security and network boundary | `docs/phase8-network-check.json` |
| Submission kit: a timed 4 minute demo script, two post drafts, claims to avoid | `docs/phase9-submission-kit.md` |
| No unsupported claims | The README states the one tested setup, what `Verified` means, that credits are used, and the overlap with TestMu's Test Manager. Unfinished or unmeasured things are in the "Gaps" sections of each phase report. |

## Not done, and why

1. **Public GitHub repository.** Creating it needs your GitHub account. The repo is committed locally with a readable history. See "Before you publish".
2. **The 3 to 5 minute demo video.** It needs a screen recording with real runs and your narration, uploaded to YouTube. A script with timings is in the kit.
3. **Two public posts.** They need your accounts. Drafts are in the kit, written to avoid claims the project does not support.
4. **Confirming the event.** I did not look up or verify any event, deadline, eligibility rule or form. The product documents say these can change and must be confirmed from the current official page. If the event requires that the code was started during the event, only you can attest to that. Git history shows when each part was written.
5. **Logged-out checks** of the repository, video and posts. They depend on 1 to 3.

## Before you publish

- Run `git status` and `git ls-files`. The tree should contain no `.env`, no `data/`, no Kane profile files, no `.testmuai/`, no `vids/`, and no logs. `.gitignore` excludes them. I did not find any in the tracked files; check once more before pushing.
- The tracked demo output (`docs/demo/closed-loop/`, `docs/phase5-evidence/`, `docs/phase6-evidence/`) comes from your real runs. I checked it for your username, your data-folder path and your Test Manager ids; none are present (home appears as `<HOME>` and the data folder as `<DATA>`). The screenshots show the dashboard and demo data only. Look at them yourself before publishing.
- `docs/phase0-samples/` holds sanitized samples from your Kane runs in Phase 0. Re-read them for anything you do not want public.
- The video and posts should show a real run, not a fixture. Do not present anything from `tests/` as a Kane result.

## What the product honestly is, for the video and posts

It is a local tool that turns a human acceptance criterion and a Kane test into a recorded, comparable, evidence-linked result, and a factual report you hand to your own coding agent. It does not call an agent, edit code, or claim more than one real run showed. It overlaps with the TestMu Test Manager dashboard (every run is uploaded there), and it was built and tested on one Windows machine.
