# flake-or-regression, fresh run 1 (session 55af0fb3, 25 Nov)

A fresh `claude -p` session in a new worktree of `flake-or-regression` at `770569b`, asked in plain words to use the skill on three failures (the inputs are in this folder). Its first tool call was `Skill`. Answer key hashed beforehand in `ddd2db9`.

| Case | Branch | K | main | branch | Verdict | Key |
|---|---|---|---|---|---|---|
| A | `exam-for-clean` 1c07e60 (empty commit) | 10 | 1 hit (`run-13-main.txt`, the #100 timeout) | 0 | already flaky | ✅ |
| B | `exam-for-break` 9e72433 (toast `Receiving…` → `Receiving...`) | 5 | 0 | 5 | branch broke it | ✅ |
| C | `exam-for-delay` 2f9032e (first `want` delayed 1.5 s) | 10 | 0 | 1 hit, 1 other | inconclusive | ✅ (never "already flaky") |

The session also stopped where the skill says to. It didn't post to #100 and didn't fix B.

**What it found:** in C's run 16 the laptop slept (1724 s for an ~85 s run). Node's timers stop during sleep, so the 10-minute timeout never fired and the run counted as an "other failure". It was fixed test first in `5de2516` (red) and `2b16259` (green) on #146: a slept-through run is now "paused", run again and never counted.

`transcript.jsonl` is rebuilt from the session's stream: messages, tool calls and results only, with neutral ids and paths shown as `~`. One tool result that printed this machine's settings is replaced with a note.
