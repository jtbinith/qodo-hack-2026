---
name: flake-or-regression
description: Decide whether a failing browser test was broken by this branch or was already flaky on main. Reruns tests/two-browser.mjs K times on main and K times on the branch, alternating, counts how often each side hits the same failure and applies a fixed rule. Use when npm test or the two-browser test fails during a ticket, when a new test fails without an assertion failing, or when CI fails on a PR whose change looks unrelated.
---

# Flake or regression

A browser test failed. Before you fix anything or stop, find out whose failure it is: **already flaky** (main fails the same way), **branch broke it**, **made worse** or **inconclusive**. The rule is fixed in `scripts/flake-lib.mjs`. Don't change it, and don't decide by feel.

## Inputs (ask for any that's missing)
- **The failure's output:** at least the line that failed.
- **The branch** (a commit or branch name) and **main** (default `origin/main`; `git fetch origin main` first).
- **K:** runs per side, default 10, 3 to 30. Each direct run takes about 1.5 minutes, so K = 10 is about 30 minutes.
- **Mode:** `direct` or `relay`, whichever the failure came from (relay runs have `--relay`).
- **Evidence folder:** an empty folder.

## Stop and ask, don't guess
- You can't say what failed: there's no failure output.
- The failing check doesn't exist on main. It's a new test, so there's nothing to compare. Check the test's own red-then-green proof instead.
- The script exits 2: the test couldn't run (browser, server or setup), or the machine slept through 3 tries of one run. Fix the setup or keep the machine awake. That's not a verdict.
- A run the machine slept through is marked **paused** in `runs.csv` and run again; it never counts. Report how many there were.
- The script stops because the signature is in one side's `tests/two-browser.mjs` but not the other's: the branch changed that check, so the same failure prints differently on each side. Compare the two failures by hand and report it.
- The script stops because main and the branch declare different dependencies (`package.json` or `package-lock.json`). Report it.
- The script stops because the test **hung** (killed after 10 minutes) twice on one side. If only the branch hangs, the branch may cause it: read that run and report it. Don't call it a setup problem.
- The verdict is **inconclusive** (exit 3). Report the table and stop. Don't call it flaky because you'd like to carry on.
- K over 30.

## Steps
1. **Choose the signature:** a piece of the failure's output that names *this* failure and is the same on both sides.
   - For a timeout (`timed out after 90 s at two-browser.mjs:229: await until(B, …)`), use the quoted code after the line number by itself, for example `await until(B, () => window.__t.files.size === 4, null, 90000);`. The signature is matched as one piece of text, so it can't skip the line number in the middle; and the line number moves when a branch edits the test.
   - If the output you were given is from an **older version of the test** (a different line number, or the code has changed around it), find that wait in the current `tests/two-browser.mjs` on main and use its code as it is now. Say so in the report.
   - For a `FAIL …` line, use the words that don't change between runs (no counts, ids or timings).
   - Check the signature appears in the failure output you were given.
2. **Run it** from the repo root (this checkout):
   ```sh
   node scripts/flake-or-regression.mjs --main origin/main --branch <branch-or-sha> --signature "<signature>" --k 10 --mode direct --out <evidence>
   ```
   It makes two clean worktrees under `/tmp`, runs the test on each in turn (main, branch, main …) and saves every run's output. It writes `runs.csv` and `verdict.md` and removes the worktrees.
3. **Read `verdict.md` and `runs.csv`, not only the last line.** Check that the hits really are this failure: open the first hit on each side. Look at "other failures": they may be a different problem the branch caused.
4. **Act on the verdict:**
   - **already flaky:** link the run table on the flake's ticket (for the first-transfer timeout that's #100), say so in your report and carry on with the ticket.
   - **branch broke it** or **made worse:** it's this branch's bug. Reproduce it and fix it, test first.
   - **inconclusive:** stop. Report the table and what would decide it, for example more runs or the other mode.
5. **Report:** the signature, both commits, K, the counts per side, the verdict with the rule's reason, and the evidence folder.

## Evidence to save
- `runs.csv`: run, side, commit, outcome, seconds and first failure line.
- `verdict.md`: the counts, the verdict and the rule.
- Each run's output, `run-NN-<side>.txt`. The script replaces this checkout's path with `<repo>`.
