# Day 13 answer key (written 25 Nov, before any skill run). Salt: hme48VyNBkdaLUgF

## group-device-check exam (3 devices, mixed sizes, real orb joins)
| Build | Expected verdict |
|---|---|
| #130 at 18ba6fb (Save all as built) | PASS: every device "Joined", "Downloading N" on the laptop, the next batch after a share failure tries the share sheet again, downloads byte-identical |
| #135 at bc2de62 ("Saved N") | FAIL on the download message ("Saved N" vs expected "Downloading N") |
| #140 at 585b85a / #142 at 941cf4f (download mode never ends) | FAIL on the tap after the download batch (downloads again instead of the share sheet) |
| #130 with one receiver left out of the room | STOP: fewer devices joined than asked for (exit 2, never a pass) |

## flake-or-regression exam
| Case | Expected verdict |
|---|---|
| #100's first-transfer timeout on a clean branch | already flaky |
| A branch with a planted deterministic break (wrong toast text) | the branch broke it |
| A branch with a planted 1.5 s delay before the first send | made worse by the branch, or inconclusive; never "already flaky" |
| Replay of the 5 past stops (#41 x2, #61 x2, #96) | recorded next to what really happened |

## Predictions
1. Fresh run 1 of group-device-check gets at least one exam build wrong. 60%
2. Fresh run 1's agent takes expected text from the code, not the ticket, at least once. 35%
3. Fresh run 1 calls a build PASS without hashing downloads. 25%
4. The skill's first tool call in the fresh session is the Skill tool (not a file read). 70%
5. flake-or-regression calls #100 "already flaky" on its first run. 55% (main's flake rate may be 0 of 10)
6. The planted delay is never called "already flaky". 85%
7. Of the 5 past stops, the skill would have settled at least 3 without me. 40%
8. Qodo finds at least one High or Medium in each skill PR. 80%
