# Day 6: claims checked against the code

These are the claims from Wisdom's answers (q1–q5) that changed the plan for #68. Each was checked outside Qodo, by reading the cited lines at `96f0bbe` (the commit Qodo read) and, where a claim was about behaviour, by running `layout.js` locally.

**Held** means the code says exactly that. **Partly** means the point is right but the wording isn't. **Didn't hold** means the code says otherwise.

## What decided the plan

| # | Claim | From | Checked at | Result |
|---|---|---|---|---|
| 1 | A join is `{a, edgeA, alongA, b, edgeB, alongB}`, so screens line up on the two `along` points. There's no time or id. | q2, q4 | `layout.js:11` (`d = alongA - alongB`), `layout.js:136-139` | Held |
| 2 | The planned tap was "(edge, time)", with no position. | q4 | `ARCHITECTURE.md:77` on `main` | Held. It was my own line from #50. |
| 3 | `validPush` accepts `along` from 0 to the edge length, so a strip mapped linearly onto the whole edge always passes. | q4 | `net.js:86-90` | Held |
| 4 | A tap with a position is the same input as today's orb push. `net.push(edge, along)` → `validPush` → `matchPushes` → `addJoins` can be reused unchanged. | q2, q4, q5 | `index.html:314-321`, `net.js:91-112,138-142` | Held |
| 5 | `addJoins` only adds or replaces joins. It can't remove one, which Undo needs. | q4 | `layout.js:45-62` | Held |
| 6 | `isValidJoins` checks only the fields it knows, so new state fields would pass unchecked. | q4 | `layout.js:38-43` | Held |
| 7 | The page shows only "Screens joined ✨". Nothing shows `nomatch` or `retry`, though the time keeper sends both. | q4 | `index.html:350-352`, `net.js:113-119` | Held |
| 8 | Today's join tests call `net.push` directly and skip the UI. `layout.js` has no unit tests. | q4 | `tests/two-browser.mjs:53,287`; `tests/` has no layout test | Held |

## What the second pass found (the brief's prompt, `q5`)

| # | Claim | Checked at | Result |
|---|---|---|---|
| 9 | `joined`, `retry` and `nomatch` are accepted from any device in the room. Layouts are accepted only from the time keeper. | `net.js:127-136` | Held |
| 10 | One laptop tap with two phone taps joins nothing and asks all three to retry. The laptop must tap once for each phone. | Local run of `matchPushes`: 0 joins, `retry` for L, P and Q. The comment at `layout.js:124-125` says "a laptop pushes twice". | Held. My revised #68 implied one laptop tap. |
| 11 | When both phones tap mid-edge, both joins are kept and the screens overlap. | Local run: 2 joins, 1 overlap. Phones tapped at the top and bottom: 2 joins, 0 overlaps. `addJoins` drops only *older* joins (`layout.js:57-58`). | Held |
| 12 | A tap the time keeper rejects gets no reply. | `net.js:93` (`return` when `validPush` fails) | Held |

## What partly held

| # | Claim | Checked at | Result |
|---|---|---|---|
| 13 | "#70's limit is 30 MB, but #71 says 20 MB, so they disagree." | `PRD.md:222` (F11: bigger than 20 MB waits for a tap); issue #70 | Partly. The 30 MB in #70 is an example of a file that's too big. The real gap is that #70 never states 20 MB. The original answers keep their wording, with a "Checked 18 Nov" note. |
| 14 | "`LIMITS.incoming` = 20 for the whole room." | `check.js:10`, `index.html:79,160-162` | Partly. `incoming` is held on each receiving device, so the cap is per receiving device. Every sender in the room shares it, which is what #17 means by room-wide. Noted the same way. |

## Not checked

- q1's claims about `seal.js`, `validChunk` past its first line and `prepareFile`. Wisdom said it hadn't read them (`q1-answer.md:81`), and they don't affect #68.
- Past PR reviews of `net.js` and `layout.js`. Qodo's PR-history tools returned `MT-UPSTREAM-DOWN` "context-retriever unreachable" every time (raw `25`–`31`, `46`–`48`, and again in q5). The history used comes from commits and PR #50 instead.
