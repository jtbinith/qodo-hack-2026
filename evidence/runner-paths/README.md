# The runner hides local paths in what it posts

The factory runner posted this machine's home path in two public comments: a crash message on #41
(13 Nov) and a failed-agent-run log path on #61 (21 Nov). The owner deleted both and re-posted them
with the path as `~/…` and a note. Edits would have kept the old text in GitHub's edit history.

Fix at the source: every comment, PR title and PR body the runner posts goes through `publicText`
(`scripts/runner-lib.mjs`), which shows the home path as `~` and hides any other part of it (the
username, a domain folder) as `<redacted>`, as whole words only. Red: `01-red.txt` (3 tests).

## The gate on this PR (#97)
Review 1 (ad0aa47): complete, covers the head. 2 Mediums.
| Finding | Verdict | Evidence | Action |
|---|---|---|---|
| bc54c3e8 PR proof comments repeat on every run | real | test: redacted proofs weren't found on the PR (`02-red-round1.txt`) | fixed: `publishPlan` looks for each proof as it was posted; mutation `03-mutation.txt` |
| 5d2b2594 Short account names leak in comments | **disputed** | the path case already passes before any change (`#97 5d2b2594` test: `/home/al/x` → `~/x`). The rest is the bare word: hiding every 1–2 letter word that equals the username would rewrite ordinary text | not changed; stays open until the owner decides |
