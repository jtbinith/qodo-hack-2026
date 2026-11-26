# flake-or-regression: inconclusive

- Signature: `await until(B, () => window.__t.files.size === 4, null, 90000);`
- Mode: relay, K = 20 runs per side, alternating (main first)
- main: `1b5ee72` = 1b5ee72 · hit 0, pass 20, other failure 0, couldn't run 0
- branch: `4453961` = 4453961 · hit 0, pass 20, other failure 0, couldn't run 0

**Verdict: inconclusive.** main hit it 0 of 20, the branch 0 of 20: the rule doesn't decide this.

The rule (scripts/flake-lib.mjs, fixed before any run): already flaky if main hit it at least once and the branch no more than twice as often; the branch broke it if main never did and the branch did at least 3 times; made worse if both did and the branch at least 3 times as often; anything else is inconclusive.
