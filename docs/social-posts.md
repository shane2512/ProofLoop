# ProofLoop: the two public posts

Two different posts for two different readers. The X thread is short and shows the loop. The dev.to article explains how it works and what it does not do. Neither repeats the other.

Fill in before posting:
- `https://youtu.be/6n5tAeZ54p4`: the YouTube link (check it while logged out).
- `EVENT_TAG`: the event's official hashtag or tag, from the event page. I could not confirm it, so none is invented here.
- Everything else (site, repo) is already real and public.

Links: site https://proofloop-kane.shinc.tech · repo https://github.com/shane2512/ProofLoop

All numbers below come from the recorded runs: the first real Kane run failed (exit 1, about 2 min 31 s), the second passed (exit 0, about 1 min 38 s). The video says the waits are cut and the one-line fix was made by hand.

---

## Post 1: X (a thread of 4)

Attach the video to the first post. Keep the link in the last post so the first one is not downranked for carrying a link.

**1/4**
> Your coding agent says "done." The test process exits 0.
>
> Log in anyway and you land on "Page not found."
>
> I built ProofLoop to close that gap: a real Kane browser run, a factual report for your agent, then a re-run. Both runs stay on record.
>
> 🎬 (video)

**2/4**
> How it works:
>
> 1. Write one criterion in plain words
> 2. Map it to a Kane test file
> 3. ProofLoop runs the real Kane CLI in your Chrome
> 4. Copy the report to your agent
> 5. Review the fix, run again, compare

**3/4**
> What it refuses to do:
>
> - "Exit 0" alone is never a pass. Kane's final event has to agree.
> - It never edits your code.
> - It never sends anything anywhere. You copy the report yourself.
> - Kane's diagnosis is shown as Kane's, not as ProofLoop's.

**4/4**
> The demo: a planted bug, a real Kane FAIL, the report, a one-line fix, a real Kane PASS, then a before/after compare. The fix in the video was made by hand, and the Kane waits are cut and labeled.
>
> Local-first, runs on your machine.
> Site: https://proofloop-kane.shinc.tech
> Code: https://github.com/shane2512/ProofLoop
> EVENT_TAG

Short single-post version (if you only post one):

> Coding agents ship fast. Proof is slower.
>
> ProofLoop: write what the app should do, run it as a real Kane browser test, hand your agent a factual report, re-run, compare. "Verified" only after a real pass.
>
> https://youtu.be/6n5tAeZ54p4
> https://github.com/shane2512/ProofLoop EVENT_TAG

---

## Post 2: dev.to article

Paste into a new dev.to post (Markdown). Add a cover image (a frame from the video, such as the closing card or the compare table). Tags: dev.to allows four. Suggested: `testing`, `ai`, `webdev`, `opensource`.

````markdown
---
title: "ProofLoop: proving what your AI coding agent built, with real browser runs"
published: true
description: "A local-first tool that maps human acceptance criteria to real Kane CLI browser runs, keeps the evidence, and hands your agent a factual report."
tags: testing, ai, webdev, opensource
cover_image:
---

An AI coding agent can write a login flow in a minute. Knowing the login flow works is a different job, and it is still yours.

Here is the gap I kept hitting:

- The requirement lives in a chat, tied to no test.
- When a browser test does run, the logs and screenshots are gone by the next run.
- The agent gets "test failed," with no expected or observed behavior, so it guesses.
- After the fix, the old failure disappears, so there is nothing to compare.

I built **ProofLoop** to close it.

{% embed https://youtu.be/6n5tAeZ54p4 %}

## The loop

1. **Write one criterion** in plain words: "Login reaches the products page."
2. **Map it to one Kane test file.** The test is plain sentences in a file you can read and commit.
3. **Run it for real.** ProofLoop starts `kane-cli testmd run` with one fixed argument list and no shell, in your own Chrome.
4. **Keep the evidence.** Raw stdout and stderr, parsed events, Kane's evidence pack, a snapshot of the criterion, and the exact command (redacted).
5. **Hand off the facts.** ProofLoop builds a Markdown report from the stored run: expected behavior, what Kane observed, the exit code, evidence references. You copy it to your own agent.
6. **Re-verify.** After you review the fix, a new run is a new record. The old failure stays, and you can compare any two runs.

## A real example

The repo includes a tiny demo shop with one planted bug: after login it redirects to `/products`, a page that does not exist.

- Run 1: Kane reported **FAILED**, exit code 1. Kane's own diagnosis was that login landed on a Page not found screen. ProofLoop shows that text labeled as Kane's, not as its own conclusion.
- The report went to my coding agent. The fix is one line: the redirect now points at the page that exists. (In the video I made that line change by hand, and the video says so.)
- Run 2, same test: **PASSED**, exit code 0. Only now does the criterion show **Verified**.
- The compare view lists the recorded differences between the two runs and claims no cause.

Each real Kane run took roughly two minutes. The video cuts the waits and labels each cut with the real time.

## What counts as a pass

This is the part I care about most. A process exiting 0 proves nothing on its own.

- **PASSED** needs exit 0 *and* Kane's final event reporting passed. Both must agree.
- A timeout, a cancel, a missing final event, or a test edited mid-run is never a pass. There are six outcomes, and only one is a pass.
- **Verified** is derived, never set. It requires that the newest run passed *and* that the test file, its mapping and the expected behavior are unchanged since that run.

## What it does not do

- It does not call your coding agent. You copy the report.
- It does not edit your code.
- It does not turn natural language into tests. You write the Kane test.
- It is not a hosted service. It binds to `127.0.0.1` and runs on your machine. The public site only describes it and explains how to run it locally.
- Verified means *one criterion passed a real run*. It does not mean the whole app works.

It overlaps with Kane's own Test Manager, where every run is also uploaded. What ProofLoop adds is the connection from a human criterion to evidence to an agent handoff, plus local history and compare.

## Try it

Needs Node, Chrome, and a Kane CLI login.

```bash
git clone https://github.com/shane2512/ProofLoop.git
cd ProofLoop
npm ci
npm run build
npm start
```

Then open the workspace on localhost. Step-by-step setup, including installing and logging in to Kane, is at https://proofloop-kane.shinc.tech/run-locally, and there are real test files to copy at https://proofloop-kane.shinc.tech/test-examples.

I tested this on one Windows machine with Node 26, kane-cli 0.10.9 and Chrome, so treat other setups as untested.

- Site: https://proofloop-kane.shinc.tech
- Code: https://github.com/shane2512/ProofLoop

EVENT_TAG
````

---

## Before you post

- Replace `https://youtu.be/6n5tAeZ54p4` and `EVENT_TAG`. Remove `EVENT_TAG` if the event has none.
- Open both posts logged out and confirm they are visible.
- In the YouTube description, credit the two CC BY sound effects: "2 Impact Wet" by original_sound (CC BY 3.0) and "Deep Cinematic Impact" by MeijstroAudio (CC BY 4.0). Details are in `vids/showreel/credits.json`.
- Check the Fish Audio terms for the voice you chose before publishing the video publicly.
- If the dev.to embed tag does not render, paste the plain YouTube link on its own line.
- Check the clone steps against the README once, so the first reader doesn't hit a wrong command.

---

## Post 3: Hacker News (Show HN)

HN readers want something they can run, plain language, and honest limits. No emoji, no hype words, no asking for upvotes or sharing the link for votes (it is against the rules and can get the post penalized).

**Submit this link:** the GitHub repo, https://github.com/shane2512/ProofLoop. The public site is read-only and cannot run the app, so the repo is the thing a reader can actually try. Put the site and video in your first comment.

**Title (80 characters max, pick one):**
1. `Show HN: ProofLoop – Check AI-written code with real Kane browser runs`
2. `Show HN: ProofLoop – Criteria, real browser runs and a report for your agent`
3. `Show HN: ProofLoop – Don't trust "exit 0" from your coding agent's tests`

Option 1 is the safest: it says what it is. Do not add "Show HN" a second time or capitalize words for effect.

**Leave the text field empty** (HN ignores the text when a URL is given) and post this as your first comment right after submitting:

```
Hi HN. I built ProofLoop because I kept asking my coding agent whether a change worked and getting "done, tests pass" for something that, when I logged in, landed on a 404.

ProofLoop is a small local web app (Next.js, SQLite) around the Kane CLI, which runs plain-sentence browser tests in Chrome:

1. You write one acceptance criterion in plain words.
2. You map it to one Kane test file (a Markdown file you can read and commit).
3. ProofLoop runs `kane-cli testmd run` with a fixed argument list, no shell, and stores stdout, stderr, the parsed events, Kane's evidence pack, a snapshot of the criterion, and the exact (redacted) command.
4. You copy a factual report (expected behavior, what Kane observed, exit code, evidence references) to your own agent.
5. After you review the fix, you run it again. The old failure stays in history and you can compare two runs.

The rule I cared about: exit code 0 alone is never a pass. A run passes only if Kane exited 0 and its final event says passed. Timeouts, cancels, a missing final event, or a test file edited mid-run are never passes. A criterion shows "Verified" only if the newest run passed and the test file, mapping and expected behavior are unchanged since then.

The demo in the video is a tiny shop with one planted bug (login redirects to a page that does not exist). Real Kane run 1 failed with exit 1 and Kane's own diagnosis, which ProofLoop shows labeled as Kane's. The one-line fix in the video was made by hand, and run 2 passed. Each real run took about two minutes; the video cuts the waits and says so.

What it does not do: it does not call your agent (you copy the report), does not edit your code, does not generate tests from natural language, and is not a hosted service. It binds to 127.0.0.1. The public site only describes it and shows how to run it locally. "Verified" means one criterion passed one real run, not that the app works.

Limits: I have only tested it on one Windows machine with Node 26, kane-cli 0.10.9 and Chrome. Each run uses Kane credits and uploads to your own Test Manager account, which overlaps with what Test Manager already shows; ProofLoop's part is tying a human criterion to the evidence and the agent handoff, with local history.

Repo: https://github.com/shane2512/ProofLoop
Setup (including installing and logging in to Kane): https://proofloop-kane.shinc.tech/run-locally
Video: https://youtu.be/6n5tAeZ54p4

I would most like to hear whether the "pass needs two signals to agree" rule matches how you decide a test result can be trusted, and what you would want in the report before handing it to an agent.
```

**Posting tips**
- Post on a weekday morning US time if you can; do not repost if it sinks.
- Stay around for the first hour and answer plainly. If someone points out a real weakness, agree with it and say what you will change. Do not argue.
- Do not ask friends to upvote. Share the link with people only if you want feedback, not votes.
- If the repo is the link, make sure `README.md` opens with what it does and how to run it in a few lines. Check it while logged out.
- Likely questions, with honest answers ready: "Why not Playwright/Cypress?" (those need you to write code selectors; Kane tests are plain sentences, and ProofLoop does not replace them); "How is this different from Test Manager?" (see the limits paragraph); "Does it work with Claude/Cursor/etc.?" (you copy a Markdown report, so any agent, with no integration); "Is the pass rule too strict?" (it is meant to be; it also means flaky Kane runs show as Failed or Unknown rather than hidden).
