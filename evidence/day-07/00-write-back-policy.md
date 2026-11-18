# Day 7: write-back policy for Qodo findings

This policy was set in the builder's first Day 7 prompt, before any finding was read. It's written down now.

## When a finding counts as fixed
All three must hold:
1. The finding is reproduced.
2. The fix is checked, with a test or a rerun.
3. Qodo's re-review on the new head re-attributes it.

## Resolver writes
- **`mark-implemented`:** If Qodo hasn't marked a reproduced, tested fix as implemented within 10 minutes of reviewing the head, I mark it myself.
- **`dismiss`:** the types are `intentional`, `false_positive` and `deferred`. Each needs its reason on the PR and the builder's OK.
- **So far:** nothing has been dismissed or marked implemented.

## Stopping rule
Stop and hand back to the builder in either case:
- a re-review adds a finding caused by the previous round's fix, **twice in a row**;
- **3 rounds** have passed.

A review of an evidence-only push isn't a fix round. If it raises anything, record it as unresolved and hand back to me, without fixing.

## Round count so far
- **Round 1:** 1 Qodo finding, `69808cf1` (consent: `qodo-review` uploads code without being asked). Fixed and cleared: Qodo re-attributed it at `cc26e6e` (`01-resolution.md`).
- **Round 2:** 1 Qodo finding, `24cbc11a` (the timer). It was caused by our second-pass change `cdf98d0`, which introduced the device's own timer text in #68 (`02-finding-2.md`).
- **After round 2:** the blind review showed the round-2 fix was wrong too, through blind 2 and blind 3 (`03-blind-repro.md`).

**Findings caused by our own fixes: 2.**
