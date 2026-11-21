# The gate on its own PR (#90)

## Review 1: 43ac74f
Checked first, by the gate's own rule: Qodo's review covers 43ac74f, `status: completed`,
`review_complete: true` (`raw/pr-90-review-1.json`). 5 findings: 4 High, 1 Medium, 0 Low.

| Finding | Severity | Valid? | Evidence | Action |
|---|---|---|---|---|
| 38d06043 Missing findings can pass the gate | High | yes | test: `finding_count: 3, findings: null` gave `done` | fixed: count must match, else incomplete |
| bf2430c8 An unreviewed PR head can be marked done | High | yes | test: prHead differs, gate said `done` | fixed: the runner reads the PR head fresh; a moved head stops |
| be76b6d0 Clean reviews can time out | High | yes (by reading `continueRun`: the gate ran only after the rendered comment named the head) | code | fixed: the gate reads Qodo's stored review directly; the comment is only passed to the agent when it matches |
| 6bc5fe96 Low-only reviews skip the gate report | High | partly: Lows were flagged, but by title only | test: no description in the flag | fixed: each Low is flagged with Qodo's first sentence |
| 470fbdf1 Stop comments bury the unfinished status | Medium | yes | test: the stop title didn't start with NOT DONE | fixed: a stopped run's comment starts **NOT DONE.** |

Red before the fix: `raw/02-pr90-round1-red.txt` (4 tests). Mutations: `raw/03-pr90-round1-mutations.txt`.
Found by the new rule on my own tests: two older tests planted a finding without updating
`finding_count`, so the fixed gate called them incomplete. The tests were wrong; fixed.
`npm run test:unit`: 126/126.
