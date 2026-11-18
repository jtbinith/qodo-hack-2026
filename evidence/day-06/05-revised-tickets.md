# Revised #68 and the new "Pending join and Undo" ticket

This applies the decisions made after Q4 (`q4-answer.md`):

1. **The join tab is a strip along the whole edge.** Where it's tapped is the position along the edge, so `joinOffset` and stacked phones keep working.
2. **Undo moves to a new ticket, "Pending join and Undo".** #68's Undo, #69's Accept and #70's settle window all depend on it.

#68 keeps the tap strip, reuses the push pipeline and adds feedback when a join fails.

Evidence is from `jtbinith/qodo-hack-2026` at **`96f0bbe`** (`main`), read with Qodo. Raw outputs are in `raw/explore/`. **[V]** means verified in the code, docs or history; **[A]** means an assumption or inference.

---

## #68 C15 · Join screens by tapping a join strip (revised)

**PRD ID:** C15 · **Threat IDs:** T-S7 · **Labels:** `type: feature`, `area: sharing`
**Depends on:** none. **Blocks:** "Pending join and Undo" (it needs the tap join to exist).

### Summary
Replaces the orb push (C2 withdrawn): orbs dragged to the edge clash with the phone's edge gestures and are awkward on a trackpad. Each screen has a join strip along each of its four edges. Where a person taps the strip is the position along that edge.

The tap goes through today's push pipeline unchanged: `net.push(edge, along)`, then the time keeper's `validPush` and `matchPushes`, then `addJoins`. Because of that, screens line up where the two taps were, as the orb does today, and two phones can still stack along one laptop edge.

### Acceptance (Given / When / Then)
- Given two devices in a room, when each taps the join strip on facing edges within 2 s, then both show "Joined with <name>, on your right" (naming the other device and the side) and behave as one space.
- The two screens line up where the taps were: the point tapped on A's strip meets the point tapped on B's.
- Given a laptop and two phones, when the laptop taps its right strip **once for each phone**, at the point facing that phone, and each phone taps its left strip at the same moment, then both phones join, stacked down that edge.
- When a set of joins would leave screens overlapping (for example, both phones tapped the middle of their edge), the time keeper doesn't keep them and every device involved shows "Couldn't tell who to join. Try again".
- When only one device taps, or its tap is rejected (for example, sent just as the phone rotated), then it shows "No match. Tap again together".
  - If the time keeper sends a `nomatch`, it shows straight away.
  - The device that tapped also starts its own timer, so this works even when the time keeper drops the tap without a `nomatch`. That timer has to outlast the time keeper's latest decision, not just the 2 s window: a second tap just inside the window is paired up to 900 ms later (`resolve` runs up to 900 ms after the latest push, `web/net.js:100`), so `joined` can come about 2.9 s after the first tap, plus network delay. The timer is a named limit covering `WINDOW` + that 900 ms + a network margin (for example 4 s). It's cancelled when `joined` or `nomatch` arrives.
  - A `joined` always wins: if it arrives after "No match" has been shown, it replaces it with "Joined with…".
- When taps can't be paired (for example, three at once), then every device involved shows "Couldn't tell who to join. Try again" (the `retry` result).

### Edge cases
- Strips that don't face each other (not opposite edges), or taps 3 s apart, don't join.
- The strip sits inset from the bezel, so a tap never starts where the phone's own edge gestures do (see #83). A tap maps linearly onto the whole edge: the strip's start is `along = 0` and its end is `along = edge length`. So every position can be reached and stays inside the range `validPush` accepts.
- By keyboard, the strip is focusable and has a spoken label ("Join on the right"). The arrow keys move a marker along it. Activating it joins at the marker, which starts at the centre of the edge.
- `nomatch` is shown only on the device it names. `retry` is shown only on devices in its list.
- `joined`, `retry` and `nomatch` are accepted only from the time keeper, as layouts are. Today any device in the room can send them (`web/net.js:134-136`), so without this check anyone with the room code could make "Joined with…" or "No match" appear.
- No Undo in this ticket. Undo, and "settled", come with "Pending join and Undo".

### Must not break
- `npm run test:browsers`, direct and relay: every check passes. The existing join steps still pass (`tests/two-browser.mjs:52-55,287-288`).
- The time keeper is the only device that pairs taps, and layouts are accepted only from it (`web/net.js:93,130`).

### How to test
- In the two-browser test, A and B **click the strips** (not `net.push`) at known points. Check that they join, and that the layout puts the two tapped points together.
- Clicks at the two ends of a strip send `along = 0` and `along = edge length`. Keyboard activation with no arrow-key moves sends the centre.
- Taps on non-facing strips, and taps 3 s apart, don't join.
- Two phones on a laptop edge: two laptop taps join both. One laptop tap gives "try again" on all three. Both phones tapped mid-edge gives "try again", not overlapping screens.
- A `joined`, `retry` or `nomatch` sent by a device that isn't the time keeper is ignored.
- A lone tap shows the no-match message after the window.
- A second tap 1.9 s after the first shows "Joined" on both devices, and never "No match" first. Run on the real `net.js`, `joined` fires at 2.80 s (`evidence/day-07/timing-check.mjs`).
- A tap the time keeper drops without a reply (for example, its position is off the screen) shows "No match" once the device's own limit runs out.
- Unit tests for `layout.js` cover the strip positions, including two phones stacked on one edge (`docs/TESTING.md:53`, `:69`).

<details>
<summary>Original wording of #68 (before revision)</summary>

**Title:** C15 · Join screens by tapping join tabs

**PRD ID:** C15 · **Threat IDs:** T-S7
### Summary
Replaces the orb push (C2 withdrawn): orbs dragged to the edge clash with the phone's edge gestures and are awkward on a trackpad.
### Acceptance (Given / When / Then)
Given two devices in a room, when each clicks the join tab on facing edges within 2 s, then both show "Joined with <name>, on your right" with Undo and behave as one space. Edge: tabs that don't face each other, or taps 3 s apart, don't join. Undo splits them. Tabs sit inset from the bezel, work by keyboard and have spoken labels.

Labels: `type: feature`, `area: sharing`
</details>

### What changed and why
| Change | Why | Evidence |
|---|---|---|
| A "tab" becomes a strip along the whole edge, and the tap's position on it is `along` | The ticket and the design didn't say how screens line up. A tap was defined as "(edge, time)" with no position. Today screens line up on the two `along` points, so without one the stacking that the code plans for is lost. | [V] `docs/ARCHITECTURE.md:77`, `docs/PRD.md:99,206`, `web/layout.js:11-17,125-126,138`, `web/net.js:88-90`, `web/index.html:316-320` |
| It reuses the push pipeline, and `net.push(edge, along)` stays the entry point | A tap with a position is the same input as an orb push, so pairing, checks, limits and layouts work unchanged. | [V] `net.js:84-142`, `layout.js:131-174`; the two-browser join steps call `net.push` (`two-browser.mjs:53,287`) |
| A new acceptance check: two phones stack on one laptop edge | This is what the strip decision protects. `addJoins` drops older joins that overlap a new one, so the check stops a later change silently breaking stacking. | [V] `layout.js:57-60,125-126,149` |
| Feedback for `nomatch` and `retry` added | The time keeper already sends both, and devices already accept them, but nothing in the page shows them. PRD UC2 flows 2a and 3a call for these messages. | [V] `net.js:113-119,135-136`, `check.js:118-119`, `index.html:351` (the only join message), `PRD.md:100` |
| Undo removed: "with Undo" and "Undo splits them" | Undo needs a new message and its check, a way to remove a join, a time on each join, and the "settled" state that #69 and #70 also need. It moves to its own ticket. | [V] `layout.js:48-62,138`; `PRD.md:222`; `THREAT-MODEL.md:60,131`; Q4 section 3 |
| "Clicks the join tab" becomes "taps the join strip" | It matches PRD C15's "tap" and covers touch, mouse and keyboard. | [V] `PRD.md:206` |
| An inset strip maps linearly onto the whole edge; keyboard joins at the centre unless the arrow keys move a marker | Decided after review. The inset keeps taps clear of edge gestures, the mapping keeps every position reachable and in range, and keyboard users can still choose a position. | [V] `PRD.md:206` (inset, keyboard, spoken label), `net.js:88-90` (accepted range) |
| "How to test" added; the test clicks the strip | Today's join tests call `net.push` directly and skip the UI. Rule 5 requires the two-browser test for joining changes. `layout.js` has no unit tests. | [V] `two-browser.mjs:52-55`, `TESTING.md:53,69`, AGENTS.md Rule 5 |
| Second pass with the brief's prompt (`q5`): stacking needs a laptop tap per phone, overlapping joins are refused, the tapping device times out by itself, results only from the time keeper | A fresh read of the revised ticket found that one laptop tap gives `retry`, mid-edge phone taps keep both joins and overlap, a rejected tap gets no reply, and `joined`/`retry`/`nomatch` are accepted from anyone | [V] `net.js:93,134-136`, `layout.js:57-58,125,131-174`; local run in `q5-brief-prompt.md` |
| The tapping device's "No match" timer outlasts the time keeper's latest decision, and `joined` always wins (Qodo on #86, finding `24cbc11a`) | A 2 s timer fired before a valid join: run on the real `net.js` and `matchPushes`, a second tap at 1.9 s gives `joined` at 2.80 s, because `resolve` waits up to 900 ms after the latest push | [V] `net.js:10,92-121`, `layout.js:133`; `evidence/day-07/02-finding-2.md`, `raw/23-timing-check.txt` |

### Decided after review
- **After the second pass (`q5-brief-prompt.md`):** the laptop taps once per phone; joins that would overlap are refused with "try again"; the tapping device times out by itself; join results are accepted only from the time keeper. [V] all four by reading `net.js:93,134-136` and `layout.js:57-58,125`, and by running `matchPushes`/`addJoins` with the test's screen sizes.
- **Inset strip and the ends of an edge:** a tap on the inset strip maps **linearly onto the whole edge**. The strip's start is `along = 0` and its end is `along = edge length`. So every position along the edge can be reached, and it always passes `validPush` (`net.js:88-90`). [V] that `validPush` accepts exactly that range.
- **Keyboard and screen readers:** activating the strip by keyboard joins at the **centre of the edge** by default. Before activating, the arrow keys move a marker along the strip to choose another position. This feeds #73 and #74.

### Open questions for #68
1. **How deep the inset is.** Should it match #83's 24 px? Does a strip along the whole edge clash with #81's "a print always keeps 40 px on screen", since prints and the strip would share that band? [A]
2. **The orb.** Is it removed in this ticket, as the original summary says, or kept as a fallback until the real-device checks pass (#36, #83)?
3. **Message wording.** Exact text for "joined", "no match" and "try again", and whether "on your right" is worked out from `edgeA` or `edgeB` for each device. [V] that the `joined` payload has both (`layout.js:138`).
4. **#32 (F10) "tap both within 3 s".** Does F10 use the same strip and window, or a separate path? (`PRD.md:100`, flow 1b, conflicts with the 2 s `WINDOW` at `net.js:10`.) [V]
5. **Snap instead of retry.** When joins would overlap, should a phone snap to the nearest free spot along the edge instead of everyone trying again?

---

## New ticket: Pending join and Undo

**PRD ID:** none of its own. It spans C15 (Undo), C16 (Accept/No) and F11 (the settle window), and UC2 flow 4a. **Threat IDs:** T-S7 · **Misuse case:** MUC10 · **Suggested labels:** `type: feature`, `area: sharing`, `area: trust`
**Depends on:** #68 (the tap join). **Blocks:** #69 (C16's Accept and No), #70 (F11's "settled" state). #24 is needed for full protection (see edge cases).

### Summary
A new join is *pending* until it settles. It settles after `UNDO_WINDOW` (10 s) with no Undo for a tap join, or when the other device taps Accept for a mini-map join. While a join is pending, either device can Undo it and the screens split. Nothing is fetched by itself until a join has settled.

Today a join is applied the moment the time keeper solves it, with no time and no way to remove it. This ticket adds that state, so #68's Undo, #69's Accept and #70's settle window all use one definition of "settled".

### Acceptance (Given / When / Then)
- Given two screens just joined with the strip, then both show "Joined with <name>, on your right" with **Undo** and a 10 s countdown.
- When either device taps Undo within the window, then both screens split back to how they were, and nothing was fetched by itself.
- When 10 s pass with no Undo, then the join is settled on every device. It's the same join, with the same time keeper's timestamp.
- A join's state (pending or settled, and when it started) travels with the layout. Every device agrees on it, including a device that arrives late.
- Only the time keeper changes a join's state. Undo is a request to the time keeper, which removes the join and sends the new layout.

### Edge cases
- An Undo after the join has settled is ignored, or treated as a normal split, depending on open question 3.
- An Undo for a join the device isn't part of is dropped.
- The time keeper leaves while a join is pending: the new time keeper's layout carries the same state (see #61).
- A join that replaced or pushed out an older join: what Undo restores is open question 2.
- Prints dragged across during the window are handled as open question 4 decides, and never disappear silently.
- Until #24, room messages don't prove who sent them. Anyone in the room could forge an Undo, which is a nuisance rather than a leak. Full protection waits on #24.

### Must not break
- `npm run test:browsers`, direct and relay.
- Layouts are still accepted only from the time keeper, and pass the layout check, which now also checks the state fields (Rule 1).
- `UNDO_WINDOW` is a named constant (Rule 3).

### How to test
- In the two-browser test, A and B join with the strip, then B taps Undo within 10 s. Both split, and a print dropped during the window isn't fetched by itself.
- A second run waits 10 s: the join settles on both devices.
- A third device's forged Undo for the A–B join is dropped. If that can't be tested before #24, the PR says so.

### Why this ticket exists (evidence)
| Needed | Today | Evidence |
|---|---|---|
| A time on each join | A join is `{a, edgeA, alongA, b, edgeB, alongB}`, with no time or id. The shared clock exists to stamp it. | [V] `layout.js:138`, `net.js:26` |
| A way to remove a join | `addJoins` only adds or replaces joins. Joins disappear only when a device leaves the room. | [V] `layout.js:48-62`, `net.js:48` |
| An Undo message and its check | No such message exists. Rule 1 requires a check in `check.js`. | [V] `index.html:166-195,330`, `net.js:127-136` |
| The state checked when it arrives | `isValidJoins` checks only the fields it knows, so new fields would pass unchecked. | [V] `layout.js:38-43` |
| One meaning of "settled" | F11, T-S7 and MUC10 all rely on "accepted, or 10 s with no Undo". | [V] `PRD.md:222`, `THREAT-MODEL.md:60,131`, issue #70 |
| C16's Accept and No | The mini-map needs a join that waits for the other device. Today only the time keeper decides, instantly. | [V] `PRD.md:100,207`, `net.js:93,103-111`, issue #69 |
| Knowing who sent the Undo | Room broadcasts don't say who sent them, and device ids aren't bound to keys until #24. | [V] issue #19, issue #24 |

### Open questions for the new ticket
1. **Where the state lives.** Is it a field on each join (for example `state` and `since` on the time keeper's clock), or a separate pending list in the layout?
2. **What Undo restores.** A join that the new one pushed out to avoid an overlap (`layout.js:57-60`): put it back, or nothing? [V] that it's dropped today.
3. **Undo after settling.** Is it disabled once settled, or does it stay available as a plain "split" (`PRD.md:100`, flow 4a: "either person taps Undo or moves their tile")?
4. **Prints during the window.** A print dragged onto the other screen re-anchors there and is hidden after a split (`index.html:85,93,100`). Should Undo send it back, or leave it? Should a fetch already started by a drag be cancelled? [A] about the consequence.
5. **Before #24.** Ship with forgeable Undo and say so in the PR, or block on #24?
6. **The time keeper changing mid-window.** Does the window keep running, or restart? This depends on how #61 is fixed. [A]
7. **Mini-map placement.** Does C16's "No" go through this ticket's removal path, or a separate "decline" before any join exists?
8. **Constant name and home.** Should `UNDO_WINDOW` live in `net.js` next to `WINDOW`, `MAX_BATCH`, `PER_DEV` and `DEADLINE` (`net.js:10,84`)?

---

## Docs to update with this plan
| Doc | Says today (at `96f0bbe`) | Change to |
|---|---|---|
| `docs/PRD.md:206` (C15) | "Screens join by tapping join tabs on facing edges at the same moment … Each screen has a tab on every edge, inset from the bezel … After a join both screens show who they joined and on which side, with Undo" [V] | A **join strip** along every edge, inset from the bezel. **Where it's tapped is the position along the edge** (mapped linearly onto the whole edge), so screens line up where the taps were. By keyboard, the centre unless a marker is moved with the arrow keys. Undo moves to "Pending join and Undo". |
| `docs/ARCHITECTURE.md:77` (`push` row) | "Planned: replaced by a join tap (edge, time) when C15 ships" [V] | "Planned: replaced by a join tap **(edge, along, time)** when C15 ships." The message keeps today's shape and `validPush`. |
| `docs/PRD.md:99-100` (UC2 main flow and flows) | Main flow step 4: "Both screens show 'Joined with Sam's phone, on your right' with Undo". Flow 4a: "The join is wrong or unwanted: either person taps Undo or moves their tile". [V] | Step 1 says each person taps the join strip at the point facing the other device. Step 4 and flow 4a note that **Undo, and when a join settles, come from "Pending join and Undo"**. Flows 2a and 3a (no match, try again) stay as written and are delivered by #68. |

Also seen in the same docs (not asked for; listed so nothing is missed) [V]:
- `ARCHITECTURE.md:32,60` still say "orb pushes today" and "until C15 ships".
- PR #50 noted that `AGENTS.md` still says "push orbs".
- `docs/TESTING.md:69` (the C15 test row) still includes "Undo splits them", which now belongs to the new ticket.

### Tickets to update if this is filed
- **#69 (C16)** and **#70 (F11):** add "Depends on: Pending join and Undo".
- **#70:** it never states its own limit. Its 30 MB edge case is an example of a file that's too big, but the limit itself, 20 MB per `PRD.md:222` and PR #50, isn't written in the ticket. It should be, since #71 refers to "the 20 MB limit from F11". [V]
- **#74 and #73 (N4):** the Undo button needs focus and a spoken label.
