# Day 7 part 2: the final state of PR #87 (no more fixes)

The stopping rule fired in round 3 (`05-blind2-fixes.md`), and this was the last fix round. What Qodo's re-review of the new head says is recorded here as the final state. Nothing was fixed after it.

## The push and the review
- **Pushed:** `8ddeaf8..d660eb6` to `s1-5-rate-limit-resends`. The PR head is `d660eb69e5bcae8213a6fa1d8f88189ecb0495e7` (`raw/27-pr-87-meta.json`).
- **Qodo's re-review:** run `2045052`, started 00:48:39Z and first seen `completed` at 00:52:03Z. Its `commit_sha` is `d660eb6`, which equals the head. **`review_complete: true`**. No truncation was reported (`raw/25`, `raw/26`).
- **Review history:** `2045052` at `d660eb6` and `2043787` at `8ddeaf8`, both completed.

## Findings at `d660eb6`
| Finding | Category / level | Status | Note |
|---|---|---|---|
| `cbfbb88c` Recovered transfers still fail | Reliability / action_required | **`implemented`**, re-attributed by the review itself | **Fixed** under the policy: reproduced, tested, and re-attributed by Qodo |
| `7e800d93` Busy rooms can reset a device's send limit | Security / remediation_recommended | **`implemented`**, re-attributed by the review itself | **Fixed** under the policy |
| `feeaf5d4` **Stalled sends can exceed the byte limit** | Security / **action_required** | **`pending` (new, unresolved)** | Recorded, **not fixed** |

## The new finding, recorded as unresolved
- **Where:** `web/index.html:83` (`refund`), with `check.js:153-210` and `peers.js:197-209`.
- **Qodo's claim:** `refund` gives back the *share of pieces* that didn't leave, but the budget is in *bytes*, and the last piece can be much shorter. For a 65,537-byte file, if the 65,536-byte first piece leaves and the 1-byte tail fails, half the charge is refunded. So a device can be sent almost the whole file again and again.
- **Checked [V]** with the real limiter at `d660eb6`, using `index.html`'s refund formula (`raw/28-qodo-new-finding-check.txt`): **5** whole-file asks were allowed in one window, 0.31 MB sent against a 0.19 MB budget. That's 5 files' worth against a limit of 3.
  - [A] In practice, the tail has to fail after the first piece leaves, for example on a stalled link.
- **Caused by our own fix:** yes. The piece-share refund came in `64e2044` (round 2, our 7a fix for the first blind review).
- **Not caught by either blind review:** the second one read this refund code and called partial refunds "the exact share".
- **Outcome:** **reported without changes.** The fix round has ended, and the stopping rule had already fired. [A] A likely fix is to refund the unsent *bytes*: `sendFile` reports bytes sent, or the refund adds up the sizes of the pieces that didn't leave.

## Totals for part 2
- **Rounds:** 3 fix rounds, plus this final review.
- **Findings caused by our own fixes:** **5 (+1 in part)**:
  - first blind review 2 and 6, plus 7 in part (from round 1's fix);
  - second blind review 1 and 2 (from round 2's fix);
  - Qodo `feeaf5d4` (from round 2's fix, found after round 3).
- **Qodo's original findings:** both re-attributed as `implemented` by Qodo itself.
- **Resolver writes:** none. No `mark-implemented` and no `dismiss`.

## Still open, not done (needing your go for any GitHub write)
- **Qodo `feeaf5d4`:** open on #87.
- **Drafts:** #20's acceptance wording (`04-blind-fixes.md`) and the follow-up ticket (`05-blind2-fixes.md`). They're not posted. [A] `feeaf5d4` could be added to the follow-up ticket if you want it there.
- **The S1.5 docs:** `docs/ARCHITECTURE.md`, `TESTING.md` and `THREAT-MODEL.md` aren't updated to the new budget.
- **Evidence:** this file and `raw/25`–`28` are committed locally in the toolbox worktree. The evidence commits for part 2 aren't pushed.
