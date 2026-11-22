# The runner hides local paths in what it posts

The factory runner posted this machine's home path in two public comments: a crash message on #41
(13 Nov) and a failed-agent-run log path on #61 (21 Nov). The owner deleted both and re-posted them
with the path as `~/…` and a note. Edits would have kept the old text in GitHub's edit history.

Fix at the source: every comment, PR title and PR body the runner posts goes through `publicText`
(`scripts/runner-lib.mjs`), which shows the home path as `~` and hides any other part of it (the
username, a domain folder) as `<redacted>`, as whole words only. Red: `01-red.txt` (3 tests).
