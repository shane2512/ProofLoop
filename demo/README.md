# Closed-loop demo: failure, report, fix, new run

This is the loop ProofLoop exists for, run on a small shop in `demo/shop/` that has one deliberate defect. Every Kane run in it is real. Each run uses your Kane (TestMu) credits and is uploaded to your TestMu Test Manager. Expect about two to three minutes per run.

## The defect

The demo shop logs in with `standard_user` / `secret_sauce`, then redirects the browser to a page that does not exist. The products are served at `/inventory`, so a user lands on "Page not found". The criterion says that after signing in the browser shows the Products page with a product list and Add to cart buttons.

## Run it

Needs the setup from the main README (Node, Chrome, an authenticated `kane-cli`) and a production build: `npm run build`.

1. **Reproduce the failure with real Kane.**
   ```
   node scripts\demo-loop.mjs fail
   ```
   The script checks the shop first and refuses to continue if the defect is not there. It starts the shop on port 4100 and ProofLoop on port 3100 (data in `data/demo-loop`), creates the project, writes the Kane test, maps one criterion and starts a run. It then saves ProofLoop's report to `docs/demo/closed-loop/01-fail-report.md` and `.json`.
2. **Hand the report to your coding agent yourself.** ProofLoop never contacts an agent. Open `01-fail-report.md`, copy it into the agent you use, and review the change it proposes. The report asks for the smallest fix and says not to edit the Kane test.
3. **Apply the fix.** The one-line fix is in `demo/shop/server.mjs`: the redirect after login must go to `INVENTORY_PATH`, not `/products`.
4. **Verify with a new real run.**
   ```
   node scripts\demo-loop.mjs pass
   ```
   It refuses to run while the shop is still broken. It saves the second report and `03-compare.json`, which lists the recorded differences between the failed run and the passing one.

To watch it in the dashboard instead, start ProofLoop against the same data folder (`set PROOFLOOP_DATA_DIR=data\demo-loop` then `npm start`) and open the project: both runs are in its history, the failed one unchanged, and the criterion is Verified only because of the later passing run.

## What the recorded run showed

See `docs/phase6-report.md` for the run ids, exit codes, durations, Kane's own diagnosis and the comparison from the real runs made when this was built.

## To run it again from the start

Delete `data/demo-loop` and restore the defect in `demo/shop/server.mjs` (the redirect to `/products`).
