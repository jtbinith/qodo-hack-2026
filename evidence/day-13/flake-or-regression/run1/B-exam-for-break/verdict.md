# flake-or-regression: branch broke it

- Signature: `FAIL tapping a print on your screen says`
- Mode: direct, K = 5 runs per side, alternating (main first)
- main: `origin/main` = 6e994c3 · hit 0, pass 5, other failure 0, couldn't run 0
- branch: `exam-for-break` = 9e72433 · hit 5, pass 0, other failure 0, couldn't run 0 · first hit: run-02-branch.txt

**Verdict: branch broke it.** main never hit it in 5 runs, the branch hit it 5 of 5.

The rule (scripts/flake-lib.mjs, fixed before any run): already flaky if main hit it at least once and the branch no more than twice as often; the branch broke it if main never did and the branch did at least 3 times; made worse if both did and the branch at least 3 times as often; anything else is inconclusive.
