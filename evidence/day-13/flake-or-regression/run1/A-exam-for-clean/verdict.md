# flake-or-regression: already flaky

- Signature: `await until(B, () => window.__t.files.size === 4, null, 90000);`
- Mode: direct, K = 10 runs per side, alternating (main first)
- main: `origin/main` = 6e994c3 · hit 1, pass 9, other failure 0, couldn't run 0 · first hit: run-13-main.txt
- branch: `exam-for-clean` = 1c07e60 · hit 0, pass 10, other failure 0, couldn't run 0

**Verdict: already flaky.** main hit it 1 of 10, the branch 0 of 10 (no more than double).

The rule (scripts/flake-lib.mjs, fixed before any run): already flaky if main hit it at least once and the branch no more than twice as often; the branch broke it if main never did and the branch did at least 3 times; made worse if both did and the branch at least 3 times as often; anything else is inconclusive.
