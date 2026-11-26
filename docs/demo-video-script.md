# ProofLoop demo video: script

Target length about 3 minutes: a 50 second pitch, a 2 minute live demo, and a 10 second close. Everything shown is real. Kane runs take about 1.5 to 2.5 minutes, so the waits are cut in editing, and the video says so on screen.

## Part 1. The pitch (0:00 to 0:50)

Screen: the ProofLoop home page (https://proofloop-kane.shinc.tech), slowly scrolling the hero, then the workflow page. Say it calmly; about 125 words.

> Coding agents write code fast. What they can't tell you is whether the app actually does what you asked.
>
> ProofLoop closes that gap. You write the requirement as one plain sentence, like "after login, the user sees the products page." You map it to a Kane browser test. ProofLoop runs it for real, keeps the result and the evidence, and shows "Verified" only after a real passing run.
>
> When a run fails, you get a factual report to hand to your own coding agent. After the fix, you run again, and both runs stay on record.
>
> It runs on your machine. It never edits your code, and it never calls something a pass just because a process exited zero.
>
> Here is the whole loop, live.

## Part 2. The live demo (2:00)

Screen: the ProofLoop workspace on your machine, plus the demo shop and your coding agent for two short moments. Voice lines are short on purpose, so you can stay on time. The right column says what is on screen.

| Time | Do this on screen | Say |
|---|---|---|
| 0:00 to 0:10 | Open the project. Show the criterion "Login reaches the products page" with the status **Unverified**. Click **Edit** on the criterion, then **Edit login** under the test file, to show the plain-sentence test for two seconds. Close both without saving. | "One project, one criterion, and a Kane test written in plain sentences. It starts Unverified." |
| 0:10 to 0:20 | Click **Run with Kane**. Let the confirmation dialog stay up. Click **Start real run**. | "Running is a real Kane run. It uses credits, and ProofLoop says so before it starts." |
| 0:20 to 0:30 | Run panel showing **Running**. Point at "Nothing here is a pass until then". **Cut here** (caption: "Kane run, about 2 minutes, cut"). | "While it runs, nothing counts as a pass." |
| 0:30 to 0:50 | Run finished: **Failed**, exit code 1, Kane's steps, the red "Kane's diagnosis (not ProofLoop's)" box. | "Failed. Exit code 1, and Kane says login went to /products, which shows Page not found. That diagnosis is Kane's, and ProofLoop labels it that way." |
| 0:50 to 1:10 | Scroll to **Report for your coding agent**. Click **Copy report**. | "ProofLoop builds a report from the stored run only. I copy it myself. Nothing is sent anywhere." |
| 1:10 to 1:30 | Switch to your coding agent. Paste. Show its one-line change in `demo/shop/server.mjs` (the redirect now goes to `INVENTORY_PATH`). **Cut the agent's thinking time** if it is long. | "My agent proposes the smallest fix. I review it. ProofLoop never touches my code." |
| 1:30 to 1:40 | Back in ProofLoop, click **Run with Kane** again, **Start real run**. **Cut** (caption: "Kane run, about 1.5 minutes, cut"). | "Same test, new run." |
| 1:40 to 1:52 | Run shows **Passed**, exit code 0. The criterion now shows **Verified**. | "Passed, and only now is the criterion Verified, because the newest real run passed." |
| 1:52 to 2:00 | Open **Compare with another run**, choose the earlier run. Status row shows FAILED then PASSED. Scroll the history so both runs show. | "Both runs are kept. The comparison lists what changed, and claims no cause." |

## Part 3. The close (about 10 seconds)

Screen: back to the home page or the GitHub repository.

> ProofLoop. Run, read, fix, re-run. It runs on your machine, and the steps to try it are on the site.

Put the site address `proofloop-kane.shinc.tech` on screen for the last three seconds. Add the repository address `github.com/shane2512/ProofLoop` only if the repository is public when you publish; check that while logged out first.

## What not to say

- Do not say ProofLoop fixes bugs or connects to an agent. You copy the report yourself.
- Do not say the app is "tested" or "proved". Say what the run covered: one criterion, one real run.
- Do not hide the cuts. Keep the caption on screen whenever you jump over a Kane wait.

## Automated recording (silent)

`node scripts/record-demo.mjs real` records this whole demo as a silent MP4, with no voice, in `vids/demo-recording/` (git-ignored). It uses the real Kane CLI twice, so it uses credits, and Kane uploads both runs to your Test Manager. It checks `kane-cli whoami` first and stops before starting anything if you are logged out.

- It drives the real dashboard in headless Chrome and shows a visible cursor, so it reads as a screen capture.
- The two Kane waits are not recorded. A card says how long each really took ("Real time: 2 min 14 s. Cut from this video."), so the cuts are never hidden.
- The coding agent step is not faked. A card says the report goes to your coding agent, then a page shows the real one-line change made to `demo/shop/server.mjs`. It was made by the script, by hand, between the two runs. If you want a real agent on screen, record that part yourself and splice it in.
- It refuses to continue if the first run does not fail or the second does not pass, because the video would not tell the story.
- `node scripts/record-demo.mjs rehearsal` does the same with a fake Kane process, for checking the recorder without credits. Every frame carries a red "REHEARSAL" banner. Never publish it.
- When it finishes it restores `demo/shop/server.mjs` to the committed fixed version.

Details of each run (run ids, exit codes, real waits) are saved next to the video in `facts-real.json`.

## Before you record yourself

Do a rehearsal first on a throwaway data folder, then record on a fresh one. Each Kane run uses credits; plan for about four runs in total (one rehearsal pair and the recorded pair). Check your balance first with `kane-cli balance`.

1. **Kane ready.** `kane-cli whoami` shows you are logged in.
2. **Put the planted bug back.** The repository holds the fixed shop. From the repository folder:
   ```
   git show 48393bb:demo/shop/server.mjs > demo\shop\server.mjs
   ```
   This restores the version whose login redirects to `/products`. When you finish, `git checkout -- demo/shop/server.mjs` puts the fix back.
3. **Start the shop.** In a terminal: `node demo\shop\server.mjs`. Open http://127.0.0.1:4100/ and check that logging in with `standard_user` / `secret_sauce` ends on a "Page not found" page. That is the bug.
4. **Start ProofLoop on a fresh data folder.**
   ```
   npm run build
   set PROOFLOOP_DATA_DIR=data\video
   npm start
   ```
5. **Set up the project before recording** so you don't spend demo time typing: open http://127.0.0.1:3000/workspace, create a project named "Demo shop" with the address `http://127.0.0.1:4100/`, choose Add criterion, then Write a new test file, name it `login`, paste the "Test an app running on your own computer" example from `/test-examples`, save it, and add the criterion "Login reaches the products page" with the expected behavior "After signing in with the demo account, the browser shows the Products page with a product list and Add to cart buttons."
6. **Screen.** Record at 1280 by 720 or larger. Browser zoom 110 to 125 percent so text is readable. Close other tabs, bookmarks bar and notifications.

## Keep private things off the screen

- Do not show the terminal that ran `kane-cli login`, or any editor with `.env` or `.env.local` open.
- `kane-cli balance` and `whoami` can show your account details; keep them out of frame.
- ProofLoop already hides your home folder, the data folder and Test Manager ids in reports. Still, do not open the raw stdout section on camera.

## If something goes wrong

- **The first run doesn't fail.** The shop has the fix in it. Redo step 2.
- **The agent takes too long or answers differently.** Cut the wait. If it proposes something larger, ask it to change only the redirect in `demo/shop/server.mjs`.
- **A run times out or Kane is slow.** Stop, check `kane-cli whoami` and your balance, and retake. Do not show a timed-out run as a failure.
- **Fallback with no credits and no waiting.** The repository already has a real failed run and a real passing run of this same criterion saved on your machine. `set PROOFLOOP_DATA_DIR=data\demo-loop` then `npm start` shows them. Use it for the report and compare parts only, and say "recorded earlier" on screen. Do not present it as the live run.

## After recording

Send me the raw file. I can look through the frames and the audio transcript for anything private on screen, for cuts that hide a problem, and for lines that claim more than the product does. Keep the original, and do not blur or edit anything out until I have checked it.
