# Q5: Investigating revised #68 C15 · Join screens by tapping a join strip

> Read issue #68 in jtbinith/qodo-hack-2026 with Qodo (qodo read codebase get-issue).
>
> Use Qodo Codebase Wisdom to investigate this ticket before implementation. How well does the proposed approach fit the current project? Identify existing code we could reuse, dependencies and components that would be affected, and any alternative approaches worth considering. Reference the relevant files, pull requests, or commits. Distinguish verified facts from assumptions and list questions that still need a decision.

The ticket is the **revised** #68, read with `qodo read codebase get-issue` (`raw/explore/49-issue-68.json`, updated 2026-11-18 01:28 UTC). The code is `jtbinith/qodo-hack-2026` at **`96f0bbe`** (`main`), read with Qodo codebase tools (`50`–`63`). Raw outputs are in `raw/explore/` (`49`–`66`). Where it still applies, I reuse evidence from Q4 (`q4-answer.md`, raw `24`–`48`), which read the same commit.

**[V]** means verified in the code, docs, history or a local run; **[A]** means an assumption or inference.

## The answer

The revised approach fits well. A tap on a strip with a position *is* an orb push. `net.push(edge, along)`, `validPush`, `matchPushes`, `addJoins` and the layout broadcast are all reused unchanged. **`net.js` and `layout.js` don't need to change for the main flow.** The work is in `web/index.html` (strips instead of the orb, plus three messages) and in the tests.

Four things in the ticket don't match the code yet:

1. **The new messages would show events any device can forge.** `joined`, `retry` and `nomatch` are accepted from anyone in the room, not only the time keeper (`net.js:134-136`). Today only `joined` is shown, and only as "Screens joined ✨". Once #68 shows "Joined with <name>" and "No match", a stranger can make those appear on any device without changing the real layout.
2. **The stacking check is under-specified.** Two phones stack only if the **laptop taps twice**. With one laptop tap the time keeper asks everyone to retry. And "no overlap" isn't guaranteed: if the taps line up badly, the joins are kept even though the screens overlap. I checked this locally with `layout.js` (section 3).
3. **A tap that fails `validPush` is dropped silently.** It gets no "No match", so the ticket's "lone tap shows no-match" doesn't hold in every case.
4. **The docs on `main` still describe a tap as "(edge, time)"** (`ARCHITECTURE.md:77`). The fix is on this branch (`b41eb40`) but not merged yet.

## 1. How well the approach fits

| Ticket asks for | Today's code | Fit |
|---|---|---|
| Tap → `net.push(edge, along)` → `validPush` → `matchPushes` → `addJoins` | `s.push` builds `{dev, edge, along, t: s.now()}`, broadcasts it and feeds it to the time keeper (`net.js:138-142`). The time keeper does `onPush` → `resolve` → `matchPushes` → `addJoins` → `sendLayout` (`net.js:92-126`). | Fits, no change [V] |
| Screens line up where the two taps were | `joinOffset` puts the two `along` points together: `d = alongA - alongB` (`layout.js:11-17`). `matchPushes` copies each push's `along` into the join (`layout.js:138`). | Fits [V] |
| Linear map: strip start → `along = 0`, end → edge length | `validPush` accepts `0 ≤ along ≤ len`, where `len` is the presence `h` for L/R and `w` for T/B (`net.js:88-90`). Presence size is `{w: W, h: H}` = `innerWidth`/`innerHeight` (`index.html:64,67,327`), the same `W`/`H` the orb clamps to (`index.html:316-317`). | Fits if the strip maps to `W`/`H` [V] |
| Facing edges within 2 s; not facing or 3 s apart don't join | `OPPOSITE[p.edge] === q.edge` and `|p.t - q.t| ≤ WINDOW` with `WINDOW = 2000` (`layout.js:133`, `net.js:10,107`). | Fits [V] |
| Two phones stack down one laptop edge, no overlap | Possible: `PER_DEV = 2` lets the laptop have two pending pushes (`net.js:84,94-95`), and `matchPushes` prefers pairings with fewer overlaps (`layout.js:149`). **But it needs two laptop taps, and overlap isn't prevented.** | Partial (section 3) [V] |
| "No match. Tap again together" | The time keeper sends `nomatch {dev}` once a lone push's window is over (`net.js:114-118`), and `net.js:136` passes it on. **Nothing in `index.html` listens for it**: the only join UI is `index.html:350-352`. | Logic exists; UI is new [V] |
| "Couldn't tell who to join. Try again" | `matchPushes` returns `retry` with every device in the batch when a pairable push is left over (`layout.js:169-171`); it's sent at `net.js:113` and received at `:135`. No UI. | Logic exists; UI is new [V] |
| `nomatch` only on the device it names, `retry` only on listed devices | Events reach every device in the room. `net.id` is exposed (`net.js:20`), so the page can filter on `payload.dev === net.id` and `payload.devs.includes(net.id)`. | Easy, in the page [V] |
| "Joined with <name>, on your right" | The `joined` payload has `a, edgeA, b, edgeB` (`layout.js:138`). Names come from `net.peers[x].name` (`net.js:45`). For device `a` the side is `edgeA`, for `b` it is `edgeB`. Today **every** device in the room toasts "Screens joined ✨", including devices not in the join (`index.html:351`). | Partial: filter and wording are new [V] |
| Strip focusable, spoken label, arrow-key marker | The orb is drawn on the canvas and handled only by `pointerdown/move/up` on `cv` (`index.html:264-298,400-405`). Nothing can take keyboard focus. | New UI [V] |
| Only the time keeper pairs; layouts only from it | `onPush` returns unless `s.leader === id` (`net.js:93`). Layouts from anyone except the leader are dropped (`net.js:130`). | Fits [V]. **But see section 2: this doesn't cover `joined`, `retry` or `nomatch`.** |
| No new message types | The tap reuses `push`, so Rule 1 needs no new check. | Fits [V] |

## 2. The new messages show events anyone can forge

- **[V]** The room handlers for `joined`, `retry` and `nomatch` (`net.js:134-136`) check only the shape (`isValidJoins`, `validDevList`, `validDev`). They don't check that the sender is the time keeper. The `layout` handler does check this (`payload.from !== s.leader`, `net.js:130`).
- **[V]** The `joined`, `retry` and `nomatch` payloads have no `from` field (`net.js:111,113,118`), so a device can't tell who sent them.
- **[V]** Today this is mostly harmless. `retry` and `nomatch` aren't shown, and `joined` only shows a generic toast.
- **[A]** After #68, a stranger with the room code can make any device show "Joined with Sam's phone, on your right" while the layout stays the same. They can also show "No match" or "Try again" in a loop. That is the misleading-join problem T-S7 is about, and it breaks the spirit of the ticket's "Must not break": "layouts are accepted only from" the time keeper.
- **Options [A]:**
  - **a.** Add `from` to the three payloads and drop them unless `from === s.leader`, the same check as `layout`. That is as strong as the layout check: before #24 a device can still claim to be the leader's id (AGENTS.md known gaps; Q4 section 3 item 4).
  - **b.** Work out "Joined with…" from the layout change (a new join in `net.joins` that includes me), not from the `joined` event. Then a forged `joined` shows nothing. `retry` and `nomatch` still need option a.
- This makes no known gap worse if option a or b is in #68. Without either, it does, so a reviewer would flag it under Rule 1's "used only after its check accepts it".

## 3. Stacking two phones on one laptop edge

I ran today's `web/layout.js` locally (identical to `main`), with the two-browser test's sizes: a 900×600 laptop and 390×700 phones. Script: `/tmp/q5/stack.mjs`, not committed. [V]

| Taps | Result |
|---|---|
| A. Laptop taps its right strip twice (`along` 100 and 500); each phone taps its left strip at the centre (350) | 2 joins, **1 overlap**. The phones are at y = −250 and y = 150, and both joins are kept. |
| B. Laptop taps twice (0 and 600); the phones tap at their own ends (700 and 0) | 2 joins, no overlap. The phones are at y = −700 and y = 600. |
| C. Laptop taps once; both phones tap | No joins. `retry` for all three devices. |

What this shows [V]:
- Each phone needs its **own** laptop tap. The ticket says "each phone taps the laptop's right strip … together with the laptop". A phone can't tap the laptop's strip, and one laptop tap with two phones is case C, which gives `retry`.
- "No overlap" depends on where people tap. `matchPushes` only prefers the pairing with fewer overlaps (`layout.js:149`). `addJoins` drops only *older* joins to fix an overlap (`layout.js:57-60`), so with two fresh joins it keeps both and the screens overlap (`layout.js:59`). Nothing tells the user.
- With phones taller than the laptop edge (700 > 600), no overlap needs taps close to the strip ends.

## 4. Smaller gaps

- **A silently dropped tap [V].** If `validPush` fails, `onPush` just returns (`net.js:93`): wrong edge, `along` out of range, `t` more than 10 s off, or a device not in `s.peers`. It sends no `nomatch`. **[A]** This can happen when a phone rotates and taps before its new presence size arrives (`index.html:66-69` → `net.resize` → `ch.track`, `net.js:143`): the old `h` is the limit for the new `along`. It can also happen in the first seconds after joining, before the time keeper has seen the device's presence. The user then sees nothing.
- **Strip corners [A].** Four strips along four edges meet at the corners. The ticket doesn't say which strip owns a corner tap, or whether the strips stop short of the corners. The linear map (strip start → 0) is what keeps the corners reachable.
- **The 2 s timing [V].** A lone push is re-checked every 400 ms after its 2 s window (`net.js:115-120`), so "No match" arrives about 2–2.4 s after the tap. The ticket's "after the 2 s window" is right.
- **Batch limits [V].** `MAX_BATCH = 8`, `PER_DEV = 2` and `DEADLINE = 2500` stay as they are (`net.js:84`). Rule 3 needs no new constant unless the strip adds one (inset depth or marker step): **[A]** name it.
- **The `joined` event can disagree with the layout [V].** `joined` is sent for each fresh join (`net.js:111`). This doesn't depend on `addJoins` keeping it, but today `addJoins` always keeps fresh joins, so they agree.

## 5. Code we can reuse
- **Pairing and its checks:** `validPush`, `onPush`, `resolve`, `sendLayout`, `MAX_BATCH`, `PER_DEV`, `DEADLINE` and `WINDOW` (`net.js:10,84-126`). [V]
- **Layout:** `matchPushes` (pairing, overlap preference, `retry`), `addJoins`, `joinOffset` and `solveLayout` (`layout.js:8-174`). [V]
- **The entry point:** `net.push(edge, along)` (`net.js:138-142`). The orb's last step is exactly this call (`index.html:320`). [V]
- **Join results:** the `joined`, `retry` and `nomatch` events and `net.id` for filtering (`net.js:20,111-119,134-136`). [V]
- **Tap feedback:** the `ghosts` trail drawn where a push left the screen (`index.html:318-319`) can mark the tap point. [V]
- **Toasts** for the three messages. Today's toasts disappear after 2.4 s and have no buttons, which is enough now that Undo is in #85 (Q4, `index.html:65`). [V]

## 6. What would be affected
- **`web/index.html`** [V]:
  - The orb's input: `ORB`, `home`, `orbDrag` (`264-266`), the `pointerdown/move/up` branches (`274`, `283`, `291`) and `pushOrb` (`312-321`).
  - Its drawing (`400-405`) and the hint "drag the orb to an edge to join screens" (`410`).
  - The `joined` toast (`350-352`).
  - The strips are new DOM controls (focus, label, arrow keys). **[A]** They have to sit above the canvas without blocking print drags that start near an edge (#81, #83).
- **`web/net.js`** [V]: no change for the main flow. If section 2 option a is chosen, add `from` at `111,113,118` and a leader check at `134-136`. Update the comments that say "orb pushes" (`3`, `77`).
- **`web/layout.js`** [V]: no logic change. Update the comment at `124` ("orb pushes").
- **`web/check.js`** [V]: no new message, so no new check. Only if option a adds `from`.
- **Docs** [V]:
  - `ARCHITECTURE.md:77` on `main` still says "(edge, time)". It's fixed on this branch (`b41eb40`) but not merged.
  - `ARCHITECTURE.md:32,60` ("orb pushes today", "until C15 ships") need updating when it ships, and so does `AGENTS.md:4` ("push orbs").
  - The C15 row in `TESTING.md:69` is still "to write" (Q4).
- **Tests** [V]:
  - The two-browser join steps call `net.push` directly at `two-browser.mjs:53` (A `R,300` + B `L,350`, then `joins.length === 1` at `:54-55`) and `:287-288` (B + late guest C).
  - Playwright can click a strip in a 900×600 page (A) and a 390×700 page (B).
  - `layout.js` has no unit tests yet (`TESTING.md:53`, Q4). Section 3's three cases are ready-made unit tests.
- **Related tickets** [V]:
  - **#85** (Pending join and Undo) depends on #68.
  - **#83** (F18) gives the 24 px inset.
  - **#81** (F16) says "a print always keeps 40 px on screen", so prints share the band where the strips sit.
  - **#32** (F10) is about QR joining; its body doesn't mention taps. The "tap both within 3 s" is in `PRD.md:100` flow 1b.
  - **#24** limits what any sender check can prove.
- **Cross-repo [V]:** `cross-repo relations` returned no edges (`63`). That only covers this repo's indexed scope.

## 7. History and where the PR tools failed
- **Qodo pull-request tools: still down.** I retried `stats`, `similar` ("join screens push edge along time keeper pairing") and `by-file web/index.html`. All three returned `MT-UPSTREAM-DOWN: context-retriever unreachable: ConnectError` (`64`–`66`), the same error as Q4 (`25`–`31`, `46`–`48`). **So I have no past review findings for this area.**
- **Reused from Q4 (same commit `96f0bbe`) [V]:**
  - **PR #50** (head `82e9533`) is the design source. It withdrew the orbs and added tabs.
  - **`37daf6b`** "Validate layout broadcasts from the current leader" added the leader check that `joined`, `retry` and `nomatch` don't have (section 2).
  - **`e4fd23c`** fixed Qodo's re-review findings on PR #8.
  - No PR after PR #8 changed joining. **[A]** This is from titles only.
- **New this run [V]:** `main` is still at `96f0bbe` (Merge PR #67, `50-list-commits-main.json`). This branch differs from `main` only in `docs/` (`b41eb40`), not `web/`.

## 8. Alternatives worth considering (not ranked) [A]
1. **As revised: strips through the push pipeline,** plus a sender check on `joined`, `retry` and `nomatch` (section 2 option a). This is the smallest safe version.
2. **"Joined with…" from the layout, not the event** (section 2 option b). The message can then never disagree with the layout, and a forged `joined` shows nothing.
3. **Stop overlaps rather than prefer fewer.** If a fresh batch would overlap, return `retry` (or a new "won't fit" result) instead of keeping overlapping joins. This changes `layout.js` and needs a decision on the message.
4. **Snap the stacking.** When a second screen joins the same edge, place it next to the first instead of at the tapped point. This is more forgiving for people, but it's no longer "line up where the taps were".
5. **Keep the orb behind a flag** until the real-device checks (#36, #83) pass. That's a scope decision, since PRD C2 is withdrawn.

## 9. Questions that need a decision
1. **Sender check:** should #68 drop `joined`, `retry` and `nomatch` unless they come from the time keeper (option a)? Should "Joined with…" come from the layout (option b)? Or is this a separate ticket?
2. **Stacking wording:** should the acceptance say the **laptop taps twice**, once for each phone? And what happens when the taps would make screens overlap: allow it (today), retry, or snap (alternatives 3 and 4)?
3. **A dropped tap:** should a tap the time keeper rejects get feedback? For example, the page could show "No match" itself if no result arrives within `WINDOW` plus a margin, named as a constant (Rule 3).
4. **Strip geometry:** inset depth (24 px, as in #83?), who owns the corners, and how the strip and #81's 40 px print band share the edge.
5. **Keyboard marker:** step size for the arrow keys, and whether the marker resets to the centre after each join.
6. **The orb:** removed in this ticket or kept as a fallback (#36, #83)? (Still open from the ticket.)
7. **Wording:** exact text for the three messages. Who sees "joined": only `a` and `b`, or everyone? Today everyone does (`index.html:351`).
8. **Merging the doc fix:** should `b41eb40` (`ARCHITECTURE.md:77`, `PRD.md:99-100,206`) be merged before #68 is worked? Builders read `main`.
