# flake-or-regression: inconclusive

- Signature: `await until(B, () => window.__t.files.size === 4, null, 90000);`
- Mode: direct, K = 10 runs per side, alternating (main first)
- main: `origin/main` = 6e994c3 · hit 0, pass 10, other failure 0, couldn't run 0
- branch: `exam-for-delay` = 2f9032e · hit 1, pass 8, other failure 1, couldn't run 0 · first hit: run-06-branch.txt

**Verdict: inconclusive.** main hit it 0 of 10, the branch 1 of 10: the rule doesn't decide this.

The rule (scripts/flake-lib.mjs, fixed before any run): already flaky if main hit it at least once and the branch no more than twice as often; the branch broke it if main never did and the branch did at least 3 times; made worse if both did and the branch at least 3 times as often; anything else is inconclusive.

Other failures (not this signature) were seen: main 0, branch 1. Read them: they may be a different problem. First on the branch: run-16-branch.txt.
