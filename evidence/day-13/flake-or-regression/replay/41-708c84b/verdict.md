# flake-or-regression: inconclusive

- Signature: `await until(C, () => window.__t.net.joins.length === 1, null, 30000);`
- Mode: direct, K = 5 runs per side, alternating (main first)
- main: `67aa548` = 67aa548 · hit 0, pass 5, other failure 0, couldn't run 0
- branch: `708c84b` = 708c84b · hit 0, pass 3, other failure 2, couldn't run 0

**Verdict: inconclusive.** main hit it 0 of 5, the branch 0 of 5: the rule doesn't decide this.

The rule (scripts/flake-lib.mjs, fixed before any run): already flaky if main hit it at least once and the branch no more than twice as often; the branch broke it if main never did and the branch did at least 3 times; made worse if both did and the branch at least 3 times as often; anything else is inconclusive.

Other failures (not this signature) were seen: main 0, branch 2. Read them: they may be a different problem. First on the branch: run-08-branch.txt.
