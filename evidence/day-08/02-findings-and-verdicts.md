# Day 8: findings on the uncommitted #68 slice and my verdicts

Reviewed: the uncommitted changes on top of 1306dc9 (5 files changed, tests/net.test.mjs new).
- Review A, no context (control): 11:33:56Z, trace 4de55bea…, 2 findings.
- Review B, ticket + decisions attached (`ctx-with.json`), `--full`: 11:36:22Z, trace 4b511426…, 5 findings.
  B used A as its baseline checkpoint, so it carried A's 2 findings as still open (not found again
  independently). The 3 it introduced are what the context added.
- Blind review: fresh agent, ticket + diff + code only, Qodo scrubbed: 6 findings.

Repros run on the real worktree code (`repro/`, fake room from tests/net.test.mjs, 100 ms lag).

| # | Source | Finding | Verdict | Evidence |
|---|---|---|---|---|
| Q1 | A, B, blind 1 | A second push can receive no result | real | r1: A pairs, second tap dropped, 0 own "No match" in 20 s; r2: late nomatch for push 1 cancels push 2's timer |
| Q2 | A, B | A leader change hides a valid join result | partly right | q2: result discarded, but the layout is discarded too: joins [] on A and B; both show own "No match" at 5500, which is true. Trusting the old leader would show "Joined" for unjoined screens. Lost join = #61. No change |
| Q3 | B | A successful join shows as no match | real | q3: A hears joined@3000, nomatch@3000; page shows "No match" over "Joined" |
| Q4 | B, blind 2 | The retry instruction disappears early | real | index.html:65 hides every toast after 2400 ms; ticket: stays until next tap |
| Q5 | B | Join tests skip non-facing and edge taps | right, out of scope | no strip in this slice; Qodo itself called it a known gap. To the #68 strip work |
| B3 | blind | Clock ahead -> "No match" before a coming join | real | r3 5000: nomatch(own)@5500 then joined@7300. Clock sync, noted for #68. No change |
| B4 | blind | Lone-push browser check passes on the own timer alone | real test gap | 10 s wait > NO_MATCH_AFTER 5.5 s |
| B5 | blind | Deleting clearTimeout in s.push breaks no test | real test gap | mutation, 10/10 pass |
| B6 | blind | Removing the leader self-check breaks no test | real test gap | mutation, 10/10 pass |

Chosen: fix Q1 (results carry push time, one timer per push), Q3 (joined wins until next push),
Q4 (Try again stays, test checks visibility), B4+B5+B6 (tests). Unchanged: Q2 (#61), Q5 (strip), B3 (clock).

## Fix round 1, then rerun 1 (12:19Z, trace 2f33ec76…, same context + recent_work)
Fixes 1–4 by the build agent, each with a test that failed first and a mutation check. Plus a 4-device
browser check (A–B, C–D, then B–D: messages only on named devices, one group of 4, a print from A visible on C).
Qodo: resolved Q1, Q3, Q4. Still open by my decision: Q2, Q5. **New: 4209e603 "A later tap's no-match
message is hidden"**: real, confirmed by reading the page handler. A late retry/joined for an earlier push
sets the page flag again. The blind reviewer had flagged this page side in round 1 (item 1) and I left it out
of the fix brief; fix 2 widened it (a late joined now hid it too). Problems caused by my fixes: 1.

## Fix round 2, then rerun 2 (12:37Z, trace 5c4c4166…, incremental chosen by auto)
net.js marks results `latest` when they answer this device's latest push; the page acts on retry/nomatch only
when latest. Failing tests first, mutation checked. Qodo: resolved 4209e603, **nothing new**, still open Q2 and Q5.

## Committed exactly what was reviewed
Rerun 2's checkpoint `tree_sha` a867c56f… equals `git rev-parse 34cf9de^{tree}`: the commit is the reviewed tree.

## Checks
- `npm run test:unit`: 104 → 110 → 111, all pass.
- `npm run test:browsers`: flakes on unchanged main too (`raw/browsers-main-run1.txt`: timeout at :133;
  `run2`: FAIL "A dropped its print to B while B's key was late"). On the change: run 1 the same late-key FAIL,
  run 2 100 PASS 0 FAIL. The builder once saw a timeout at :412 (late guest joining), not seen again.
