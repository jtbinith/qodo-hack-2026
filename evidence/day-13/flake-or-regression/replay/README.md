# Replay: the factory's 5 past "not this branch" stops, at K = 5

Each case reruns `tests/two-browser.mjs` 5 times on main as it was when the branch was cut, and 5 times on the commit the agent stopped on, alternating. The runner is `scripts/flake-or-regression.mjs` at `2b16259`. I wrote my predictions (`../01-replay-predictions.md`) after the runs started and before reading any result; the sha256 `33f990a8…` was pushed in `b650330` beforehand.

| Stop | Mode | main | branch | Signature | Verdict | What really happened | Prediction |
|---|---|---|---|---|---|---|---|
| [#41, 08:58 and 09:28, 13 Nov](https://github.com/jtbinith/qodo-hack-2026/issues/41#issuecomment-6848531899) (both on `708c84b`) | direct | `67aa548`: 0/5 | 0/5, plus 2 other failures (the #92 flake, fixed later in #93) | late-guest join wait (`joins.length === 1`, 30 s) | inconclusive | green on rerun, no code change | ✅ |
| [#61, 21:40, 21 Nov](https://github.com/jtbinith/qodo-hack-2026/issues/61#issuecomment-7069633937) | relay | `09b8b2b`: 0/5 | `ca6dbb8`: 1/5 | `FAIL A dropped its print to B while B's key was late` | inconclusive | the #92 flake | ✅ |
| [#61, 22:08, 21 Nov](https://github.com/jtbinith/qodo-hack-2026/issues/61#issuecomment-7069965024) | direct | `09b8b2b`: 0/5 | `4947395`: 0/5 | first-transfer wait (`files.size === 4`, 90 s): #100 | inconclusive | the #100 flake | ✅ |
| [#96, 21:28, 22 Nov](https://github.com/jtbinith/qodo-hack-2026/issues/96#issuecomment-7086082006) | relay | `1b5ee72`: 0/5 | `4453961`: 0/5 | same as above | inconclusive | the #100 flake | ✅ |

**Result:** at K = 5 the skill would have settled 0 of the 5 stops, and got none wrong. It never said "branch broke it" about a failure that went green on a rerun. To call something "already flaky", the rule needs main to hit the flake at least once, and at about 1 in 10 runs, 5 runs a side rarely shows it. The skill's default is K = 10 and its maximum is 30.

One run may have overlapped a 2-minute browser run of mine that I started by mistake while checking a fix (in case 61a, about 23:40Z). It passed.
