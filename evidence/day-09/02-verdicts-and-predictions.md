# Day 9: verdict table and predictions (written before any gate is written or replayed)

Labels: Qodo's action_level from `qodo read pr-review-session findings` / local `qodo review --json`.
Mapping checked on PR comments #87 and #89: action_required = High, remediation_recommended = Medium,
informational = Low (#87 cbfbb88c "Resolved High", feeaf5d4 "Dismissed High"; #89 b36e79c1 "Medium", 6e7378d4 "Low").
Verdicts: real / partly / wrong / out-of-scope, from my reproductions and records (Day 5 canary key,
Day 7 evidence, Day 8 02-findings-and-verdicts.md). "fix-caused" = the problem came from my own previous fix.

## Design set (Day 8, the data the quick-review rule comes from), 11 findings
| id | where | label | verdict | note |
|---|---|---|---|---|
| e5fa90a2 | local A/B | Medium | real | second push gets no result |
| 07c384af | local A/B | Medium | partly | layout dropped too; "No match" is true; lost join is #61 |
| 4bf90ebe | local B, PR #89 | Medium | out-of-scope | no strip in the slice |
| c7362445 | local B | Medium | real | "No match" over "Joined" |
| 0f2994d4 | local B | Medium | real | "Try again" fades at 2.4 s |
| 4209e603 | local C | Medium | real, fix-caused | stale result hides latest push's message |
| 240d001d | local G | High | real, fix-caused | clock correction (later shown open after the code was gone: wrong as "open") |
| b36e79c1 | PR #89 | Medium | real | inline cap; existed at rerun 2 (quick: only `issue` reviewer ran) |
| 1baf3c69 | PR #89 | Medium | real | same-ms pushes; existed at rerun 2 |
| 6e7378d4 | PR #89 | Low | real | repros couldn't run |
| 98ac0a5b | local J | Low | partly | blind/ on purpose; q2/q3 claim wrong |

## Held-out set (not used to design the gates), 15 findings
| id | PR | label | verdict | note |
|---|---|---|---|---|
| cbfbb88c | #87 | High | real | recovered transfers still fail (fixed) |
| 7e800d93 | #87 | Medium | real | busy rooms reset the limit (fixed) |
| feeaf5d4 | #87 | High | real | stalled sends exceed byte limit (deferred, stopping rule) |
| 69808cf1 | #86 | Medium | real | consent (fixed) |
| 24cbc11a | #86 | Medium | real | 2 s timer (fixed) |
| d99a0cf5 | #86 | Medium | real | "Closes #20" with a known gap (never answered; #86 merged with it open) |
| b76d976d | #86 | Medium | real | my 10-min mark-implemented fallback contradicts my own policy (never answered) |
| 4e32544e | #86 | Low | real | #87 body says refunds work (never answered) |
| 3a9327e3 | #64 | High | real | canary: interrupted post never retried |
| d02efbb5 | #64 | Medium | real | canary: old runs repost (my Day 5 key said "never caught up": I was wrong, Qodo right) |
| c792b4a4 | #64 | Medium | real | canary: removed proofs not restored |
| 9c98a4bd | #65 | High | real | canary: marked posted before landing |
| a29a18e0 | #65 | High | real | canary: duplicate proofs |
| febc39d7 | #65 | High | real | canary: skips the PR's real state |
| edb5d5fd | #67 | Medium | real | unpaged reads pass the check (fixed) |

## Predictions (uncertain, scored after)
1. The gate's own PR (skill + runner change): Qodo's first review raises at least 1 Medium or High
   (80%). My fixes for it cause at least one new finding (60%).
2. #61 unattended with the gate: the runner ends **NOT DONE** at the round cap with at least one
   Medium open (55%), rather than done (45%). If done, it lists at least one Low for me (70%).
3. #61: Qodo's first review of the agent's PR has at least 2 findings, at least 1 of them Medium (75%).
4. At least one review in the #61 run comes back incomplete or partial (review_complete false or
   status skipped) and the runner refuses to count it (40%).
