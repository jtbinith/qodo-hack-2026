# Day 7: the blind reviewer and Qodo, compared

**What each reviewer saw:**
- **Qodo** reviewed PR #86 as pushed: run `2022925` at `3498511`, with `review_complete: false` (`raw/20`). That doesn't include our unpushed A+B and C fix (`21b2dfe`).
- **The blind reviewer** read only the ticket, the unpushed diff and the code, with no Qodo access (`blind/blind-review.md`).

So they didn't review the same text, and the comparison below keeps that in mind.

## Which bugs each one found
| Bug | Qodo | Blind | Reproduced on the real code | Where it went in #68 |
|---|---|---|---|---|
| `qodo-review` uploads code without consent (`69808cf1`) | Yes (Security) | No: outside its inputs | Fixed earlier; Qodo re-attributed it (`01-resolution.md`) | n/a (a skill, not #68) |
| The "No match" timer fires before a valid join (2 s timer; `24cbc11a`) | **Yes**, on the original 2 s text | Yes, as part of #2 | [V] `joined` at 2.80 s (`raw/23`) | Fixed in A+B (`21b2dfe`) |
| **Our fix's 4 s limit is too short:** busy rooms decide at up to about `WINDOW + DEADLINE` (blind 2) | No (it didn't see the fix) | **Yes** | [V] 4450 ms (`raw/26`) | Proposed fix pending your choice (`03-blind-repro.md`) |
| **A `retry` sends no `nomatch`, so "No match" covers "Try again"; cancelling doesn't require a result naming this device** (blind 3) | No | **Yes** | [V] `retry@900`, no `nomatch` (`raw/26`) | Proposed fix pending your choice |
| The time-keeper check can be forged until #24 (blind 1) | No | **Yes**, put first | [V] by reading `net.js:124,130` | Proposed wording pending your choice |
| A `retry` goes to the whole batch, bystanders included (blind 4) | No | Yes | [V] `retry {"devs":["L","A","B","C"]}` | Edge case + open question 7 |
| "Pipeline unchanged", yet overlap refusal and the time-keeper check change it; how to refuse isn't defined (blind 5) | No | Yes | [V] overlapping `joined` ×2 at 900 ms | Open question 6 |
| Stacking depends on CSS-px sizes the tests don't fix (blind 6) | No | Yes | [V] by reading `layout.js:1-3,22,31` | Open question 8 |
| Stacked phones pair by time, not position, and can swap (blind 7) | No | Yes | [V] `B@200<->L@200, A@200<->L@650` | Edge case |
| The dropped-tap example can't happen through the strip; the real silent drops aren't named (blind 8) | No | Yes | [V] `PER_DEV`: 3 taps give 2 `nomatch` | Edge case; the How to test line now points to it |
| The exact 2.80 s holds only on the time keeper with no delay; the window uses the sender's clock (blind 9) | No | Yes | [V] by reading `net.js:23,66,90,139` | Edge case; the How to test line now checks a range |
| "Joined" should show only on the two named devices (blind 10) | No | Yes | [V] by reading `net.js:111` | Edge case |

## Which each put first
- **Qodo:** it didn't rank its findings. Both are `remediation_recommended`, one Security and one Correctness, with no "fix first". Its open finding at head was the timer (`24cbc11a`).
- **Blind:** it put **#1 first**, the forgeable time-keeper check. Its reason: it's the ticket's only threat item (T-S7), and the planned test would pass while forged results still get through. Of its other findings, it rated #2 High and #3 Medium-high, both in our changed lines.

## What this round shows
- **Findings caused by our own fixes: 2.** Blind 2 and blind 3 are both in the lines our A+B fix added for Qodo's `24cbc11a`. [A] Qodo would only have seen them after a push.
- Qodo found the timer bug on the pushed text. The blind reviewer, reading the fix itself, found that the fix was still wrong in two ways, plus 8 issues neither our earlier passes nor Qodo raised.
- [A] Neither reviewer saw everything: Qodo read the skills and the PR as pushed, while the blind reviewer read only the ticket, the diff and the code.
