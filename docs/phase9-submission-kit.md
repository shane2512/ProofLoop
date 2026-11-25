# Phase 9: submission kit

This file prepares the submission. Everything under "You must do" needs your accounts, your face or voice, or facts only you can confirm, so it is not done and no claim below says it is. The repository state, the real runs and the demo steps are done and checked.

## What is ready (checked in this repository)

| Item | State | Where |
|---|---|---|
| Local app, runs on loopback only | Built and tested | `README.md` |
| A real Kane failure and a real Kane pass of the same criterion, with the report between them | Recorded | `docs/demo/closed-loop/`, `docs/phase6-report.md` |
| Clean-clone install, lint, typecheck, tests and build | Passed | `docs/phase8-clean-install.json` |
| Network and security boundary checks | Passed | `docs/phase8-network-check.json` |
| Repeatable demo from the README | Written | `demo/README.md` |
| Honest limits and what is not built | Written | `README.md`, `docs/phase9-report.md` |

## You must do

1. **Confirm the event.** Check the current official event page for the deadline, dates, eligibility and rules. This work cannot confirm any of them, and the product documents warn that they can change. If the event requires that project code was started during the event, that is a fact only you can attest; the git history in this repository shows when the code was written.
2. **Publish the repository publicly** (GitHub). Before you do, read `docs/phase9-report.md` "Before you publish": check that no credentials, `.env` file, `data/` folder or Kane profile files are in the tree. `.gitignore` already excludes `data/`, `.testmuai/`, `vids/` and logs.
3. **Record the 3 to 5 minute video** using the script below, with real runs, and upload it (the brief names YouTube). Check the link while logged out.
4. **Publish two distinct public posts** about the project (drafts below). Check they are visible while logged out.
5. **Submit** through the official form before the deadline.

## Demo script (about 4 minutes)

Prepare first: `npm ci`, `npm run build`, `kane-cli whoami` shows you are logged in, Chrome installed. Delete `data/demo-loop` and make sure the defect is in `demo/shop/server.mjs` (redirect to `/products`). Real runs take 2 to 3 minutes each, so record them and cut the waiting, or narrate over a time-lapse, and say so on screen.

| Time | Show | Say |
|---|---|---|
| 0:00 | The ProofLoop home page | A coding agent can write an app fast. ProofLoop answers one question: does the app do what a person asked, shown by a real browser run? |
| 0:25 | `demo/shop` in the browser: log in, land on "Page not found" | This shop has one planted defect. Login goes to a page that does not exist. |
| 0:45 | Dashboard: project, one criterion with its expected behavior, the Kane test file | The criterion is a human sentence. It is mapped to a Kane test. The status starts Unverified. |
| 1:10 | Click Run with Kane, read the confirmation, start | This is a real Kane run. It uses credits. ProofLoop shows nothing as passed while it runs. |
| 1:30 | Run finishes: Failed, exit code 1, steps, Kane's diagnosis | Failed, from Kane, not from ProofLoop. This is Kane's own explanation, labelled as Kane's. |
| 2:00 | The report panel: scroll the Markdown, click Copy | The report states what was recorded and what was not. I copy it myself. ProofLoop sends it nowhere. |
| 2:20 | Paste into your coding agent; show the one-line change; review it | My agent proposes the smallest fix. I review it. ProofLoop does not edit code. |
| 2:50 | Run again, wait, Passed | A new run, a new record. The old failure stays. |
| 3:20 | Compare the failed and passing runs; open the history | Both runs are kept. The comparison lists recorded differences and claims no cause. |
| 3:45 | Criterion now Verified; say what it means and does not | Verified means the newest real Kane run passed and the test and the criterion are unchanged since. It does not mean the whole app works. |

## Post drafts

Edit these in your own words. Do not add claims the project does not support. Add your video link and repository link.

**Post 1 (the problem and the loop):**
> Coding agents ship fast. Proof is slower. I built ProofLoop: write what the app should do, map it to a real Kane browser test, run it, and get a factual report you can hand to your agent. Then re-run. A criterion only shows Verified after a real passing run. Local-first, runs on your machine. [video link] [repo link]

**Post 2 (what is honest about it):**
> What ProofLoop does not do: it does not call your coding agent, it does not edit your code, and it does not call a run a pass because a process exited 0. It keeps every run, shows Kane's own diagnosis as Kane's, and says what it could not record. Planted bug, real failure, report, fix, real pass: [video link] [repo link]

## Claims to avoid

- Do not say ProofLoop "fixes" bugs or integrates with any coding agent. A person copies the report.
- Do not say a criterion is "proved" or the app is "tested"; say what the run covered.
- Do not present fixture or fake-process test results as Kane results. Only the runs named in `docs/phase6-report.md` and `docs/phase5-report.md` are real Kane runs.
- Do not claim support beyond what was tested: one Windows machine, Node 26.12.1, kane-cli 0.10.9, Chrome.
- The product overlaps with TestMu's own Test Manager (every run is uploaded there). Say what ProofLoop adds (criteria to evidence to handoff, local history) rather than implying it replaces it.
