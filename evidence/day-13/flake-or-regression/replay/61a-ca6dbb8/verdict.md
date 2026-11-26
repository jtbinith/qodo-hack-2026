# flake-or-regression: inconclusive

- Signature: `FAIL A dropped its print to B while B's key was late`
- Mode: relay, K = 5 runs per side, alternating (main first)
- main: `09b8b2b` = 09b8b2b · hit 0, pass 5, other failure 0, couldn't run 0
- branch: `ca6dbb8` = ca6dbb8 · hit 1, pass 4, other failure 0, couldn't run 0 · first hit: run-10-branch.txt

**Verdict: inconclusive.** main hit it 0 of 5, the branch 1 of 5: the rule doesn't decide this.

The rule (scripts/flake-lib.mjs, fixed before any run): already flaky if main hit it at least once and the branch no more than twice as often; the branch broke it if main never did and the branch did at least 3 times; made worse if both did and the branch at least 3 times as often; anything else is inconclusive.
