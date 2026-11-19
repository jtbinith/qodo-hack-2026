# Q4: Investigating #68 C15 · Join screens by tapping join tabs

Code, docs and history are from `jtbinith/qodo-hack-2026` at **`96f0bbe`** (`main`), read with Qodo. Raw outputs are in `raw/explore/` (`24`–`48`, plus `10`, `11` and `16` from Q2).

**[V]** means verified in the code, docs or history; **[A]** means an assumption or inference.

## The answer

The tap side fits well. A tap can go through the existing pairing pipeline almost unchanged.

Two parts of the ticket don't exist yet:

1. **"Position along the edge".** A tap doesn't produce one, and the ticket doesn't say where it comes from.
2. **Undo.** It needs a new message, a way to remove a join, and a time on each join. None of these exist, and the sender of an Undo can't be verified until #24 lands.

The ticket covers the tap. In practice it is also the first half of the join lifecycle that #70 and #69 build on.

## 1. How well the approach fits

| Ticket asks for | Today's code | Fit |
|---|---|---|
| Taps on facing edges within 2 s join | Pushes pair when they come from different devices, use opposite edges and are within `WINDOW` = 2000 ms (`web/net.js:10`, `web/layout.js:133`). PRD C3 says the same: "within 2 seconds" (`docs/PRD.md:194`). | Fits [V] |
| Non-facing tabs, or taps 3 s apart, don't join | Same check: the edges must be `OPPOSITE` (`layout.js:5,133`), and 3 s is more than 2000 ms. | Fits [V] |
| Pairing done by the time keeper | `onPush` → `resolve` → `matchPushes` → `addJoins` → `sendLayout` and `joined` (`net.js:92-126`). `ARCHITECTURE.md:60` already says "pairs join taps". | Fits [V] |
| "Joined with <name>, on your right" | The `joined` payload carries `a`, `b`, `edgeA` and `edgeB` (`layout.js:138`, `net.js:111`), so the name and side can be worked out. Today it only shows "Screens joined ✨" (`web/index.html:351`). | Partial: the UI is new [V] |
| Undo splits them | Nothing exists (see section 3). | Missing [V] |
| Tabs inset from the bezel, keyboard, spoken labels | The orb is drawn on the canvas and driven only by pointer events (`index.html:264-266,271-291,400-405`). Nothing here can take keyboard focus. | New UI [V] |
| PRD failure flows: "no match" after 2 s, "everyone try again" (`PRD.md:100` flows 2a and 3a) | The time keeper already sends `nomatch` and `retry` (`net.js:113-119`), and `net.js:135-136` passes them on. Nothing in `index.html` shows them (Q2). | The logic exists; no UI [V] |

## 2. Where "position along the edge" comes from with a tab

**Today [V]:**
- `pushOrb` works out where the orb's path would leave the screen (`index.html:316-317`) and sends that point as `along` (`index.html:320`, `net.js:138-140`).
- `validPush` requires `along` to lie inside that edge (`net.js:88-90`).
- `matchPushes` copies each push's `along` into the join (`layout.js:138`).
- `joinOffset` lines the screens up so the two `along` points meet: `d = alongA - alongB` (`layout.js:11-17`).
- So a push's position decides how the two screens line up along their shared edge.

**With a tab [V]:** the design says a join tap carries only "(edge, time)" (`docs/ARCHITECTURE.md:77`). PRD C15 (`PRD.md:206`), UC2 (`PRD.md:99`) and #68 don't say how screens line up. **The plan doesn't cover this.**

**Options (not ranked) [A]:**
- **a. Centre the screens.** The tab sits mid-edge and sends `along = edge length / 2`. `validPush`, `matchPushes` and `joinOffset` are reused unchanged, and `net.push(edge, along)` keeps its signature, so the two-browser join steps (`tests/two-browser.mjs:53,287`) still work.
  - Cost: two screens can't both join one edge of a bigger screen. Two phones on a laptop's right edge would both be centred and overlap. `matchPushes` then prefers the pairing with fewer overlaps (`layout.js:149`), and `addJoins` drops the older join (`layout.js:57-60`).
  - That breaks a case the code comments plan for: "a laptop pushes twice to join two phones stacked down one edge" (`layout.js:125-126`). [V] that the comment exists.
- **b. Align a corner.** Both sides send `along = 0`, so the top or left edges line up. This reuses the same code and has the same stacking limit.
- **c. A long tab strip.** The tab runs along the edge, and the tap's position on it becomes `along`. This keeps today's behaviour and stacking, but a strip near the edge works against "inset from the bezel" and #83 (F18).
- **d. A few tabs per edge** (for example top, middle and bottom), each sending its own `along`. This allows stacking, at the cost of more targets to tap and label.
- **e. Coarse now, fine later.** Use option a or b, then let the mini-map (#69 C16) adjust the alignment. This depends on #69, which has its own fit problems (Q3).

## 3. What Undo needs that doesn't exist yet

1. **A message that asks to undo a join, and a check for it.** No such message type exists. Device-to-device messages are listed at `index.html:166-195,330`, and room events at `net.js:127-136`. Rule 1 means the new message needs a check in `check.js`. [V]
2. **A way to remove a join.** `addJoins` only adds or replaces joins (`layout.js:48-62`). Joins disappear only when a device leaves the room (`net.js:48`). The time keeper would need a "remove join" step followed by `sendLayout()`, which can be reused (`net.js:122-126`). [V]
3. **A time on each join.** A join is just `{a, edgeA, alongA, b, edgeB, alongB}` (`layout.js:138`), with no time or id, so the 10-second window can't be measured. The shared clock `s.now()` exists to stamp it (`net.js:26`). [V]
   - `isValidJoins` checks only the fields it knows and ignores others (`layout.js:38-43`), so a time field would pass, but nothing would check it. [V] [A] The layout check should then validate that field too.
   - F11 and the threat model depend on this "settled after 10 s with no Undo" state: `PRD.md:222`, `THREAT-MODEL.md:60` (T-S7) and `THREAT-MODEL.md:131` (MUC10). [V]
4. **Knowing who sent the Undo.** Room broadcasts don't say who sent them (#19's text). Device ids aren't bound to keys until #24. [V] [A] So anyone in the room could forge an Undo and split other people's screens. That's a nuisance rather than a privacy leak, but it's a new way for a stranger to disrupt the room.
5. **Deciding what Undo restores.** If the new join pushed out an older one to avoid an overlap (`layout.js:57-60`), the older join is gone. [V] [A] Undo would either restore it or leave both screens alone; that needs a decision.
6. **Prints dragged across during the window.** A print dragged onto the other screen re-anchors there (`index.html:100`). After a split, prints anchored to a screen outside my group are hidden (`index.html:85`), and `rehome` only moves prints whose screen has left the room (`index.html:93`). [V] [A] So a print I dragged across in the first 10 s would vanish from my screen after Undo, and its fetch may already have started (`index.html:252-261`).
7. **Undo while the time keeper changes.** #61 shows that a device can drop the new time keeper's layout (`net.js:130`). [V] [A] An Undo, or the layout that applies it, could be lost the same way.
8. **The UI.** A toast saying who you joined and on which side, with an Undo button and a 10 s timer. Today's toasts disappear after 2.4 s and have no buttons (`index.html:65`). [V]

**Two models (not ranked) [A]:**
- **Join now, remove on Undo.** Smallest change: add a removal step and a time on each join.
- **Pending join, committed after 10 s.** This matches F11's "settled" state and C16's accept step. #70 and #69 could reuse it, but it means building a new join state now.

## 4. Code we can reuse
- **Time keeper pairing and its checks:** `validPush`, `onPush`, `resolve`, `PER_DEV`, `MAX_BATCH`, `DEADLINE`, `sendLayout` and the layout check (`net.js:84-133`). [V]
- **Layout functions:** `matchPushes` (pairing, ambiguity → retry), `addJoins` (replace and resolve overlaps) and `solveLayout`/`joinOffset` (`layout.js:5-174`). [V]
- **The shared clock and time keeper election:** (`net.js:31-75`). [V]
- **Join results:** the `joined`, `retry` and `nomatch` events (`net.js:111-119,134-136`) for the "Joined with…", "no match" and "try again" messages. [V]
- **The tap entry point:** `net.push(edge, along)` (`net.js:138-142`). [V]
- **Glow and ghost drawing** for tap feedback (`index.html:402-405`). [V] The orb drag itself goes.

## 5. What would be affected
- **`web/index.html`:** the orb's input handling (`264-266`, `274`, `283`, `291`, `312-321`), its drawing and the `ghosts` trail (`400-405`), the HUD hint "drag the orb to an edge to join screens" (`410`), and the `joined` toast (`351`). [V]
- **`web/net.js` and `web/layout.js`:** changes depend on the alignment option (section 2) and the Undo model (section 3). [V]
- **`web/check.js`:** a check for the Undo message, and possibly for the join time. [V]
- **Docs:**
  - the `push` row in `ARCHITECTURE.md:77` and the "orb pushes today" note at `ARCHITECTURE.md:32,60`;
  - PR #50's note that "AGENTS.md still says push orbs" (`35-get-pr-50.json`);
  - the C15 test row in `TESTING.md:69`, still "to write". [V]
- **Tests:**
  - [V] The two-browser join steps call `net.push` directly (`two-browser.mjs:52-55,287-288`), so they skip the UI.
  - [A] A tab test should click the actual tab.
  - [V] `layout.js` and `net.js` have no unit tests (`TESTING.md:53`, "to write").
- **Related tickets:**
  - [V] #70 (F11), #73 and #74 (N4a, N4b) and #83 (F18) refer to join tabs or the Undo window.
  - [V] #69 (C16) shares Undo/"No".
  - [V] #61, #16 and #24 affect how trustworthy the time keeper and the Undo sender are.
  - [V] #32 (F10) "phone below" needs the same alignment decision. [A] F10's alternative of tapping both screens within 3 s (`PRD.md:100`, flow 1b) conflicts with the 2 s window unless it's a separate path.

## 6. History and where the PR tools failed
- **Qodo pull-request tools: failed.** I tried `stats`, `similar`, `by-file` (for `layout.js` and `net.js`), `review-history` (for `net.js` and `layout.js`) and `similar-suggestions`. Every call returned `MT-UPSTREAM-DOWN: context-retriever unreachable: ConnectError` (`25`–`31`). A retry of `stats`, `similar` and `review-history` failed the same way (`46`–`48`). **So I have no past Qodo review findings for this area.** I didn't try other ways to reach that data.
- **What I used instead: Qodo codebase tools.** [V]
  - **PR #50** "docs: plan join tabs, group sharing and device identity", merged 2026-11-13 with head `82e9533` (`35-get-pr-50.json`). It's the design source: it withdraws the orbs (C2) and adds tabs and the mini-map, "Both have Undo or 'No'". It says auto-receive is "up to 20 MB", which matches `PRD.md:222`; #70 says 30 MB.
    Checked 18 Nov: #70's 30 MB is an example of a file that's too big, not a limit. #70 never states its 20 MB limit (PRD.md:222), so there's no contradiction, only a gap.
  - **`web/layout.js`** has only two commits: `916e906` (start) and `37daf6b` "Validate layout broadcasts from the current leader" (`32-commits-layout.json`).
  - **`web/net.js`** commits (`33-commits-net.json`):
    - `37daf6b`;
    - `e6050da` "send the layout sender";
    - `2682569` and `c9c8235` (checks for every message type);
    - `e4fd23c` "prune stale joins…", whose message says it fixes findings from Qodo's re-review of PR #8 (`44-get-commit-e4fd23c.json`).
  - **PR list** (`34-list-prs-all.json`): no PR after PR #8 changed joining. [A] This is from titles only.

## 7. Alternatives worth considering (not ranked)
1. **Tabs through the existing pipeline**, with a fixed `along` (centre or corner) and the join-now-remove-on-Undo model. This is the smallest change and loses stacking on one edge.
2. **Tabs with a real `along`** (a strip or several tabs). This keeps stacking and costs more UI.
3. **A pending-join model built now**, shared with #69 and #70 so "settled" means one thing everywhere.
4. **Split the ticket:** tabs and the "Joined with…" message first, Undo as its own ticket. Undo is the part that needs a new message, a check and #24.
5. **Keep the orb as a fallback until tabs work on real devices.** PRD C2 withdrew it, so this is a scope decision.

## 8. Questions that need a decision
1. **Alignment:** how do two screens line up along a shared edge (centre, corner, strip or several tabs)? Must two phones still be able to stack on one laptop edge?
2. **Undo model:** join now and remove later, or a pending join that commits after 10 s? Should it be shared with #69 and #70?
3. **Who can Undo:** only the two joined devices? Is it acceptable before #24 that anyone could forge an Undo?
4. **What Undo restores:** a join that the new one pushed out, or nothing?
5. **Prints during the window:** what happens to prints dragged across in the first 10 s, and to fetches already started, after Undo?
6. **Undo window:** 10 s from when, measured by whose clock? Named in which constant (Rule 3)?
7. **Failure messages:** this ticket now adds the "no match" and "try again" messages from `PRD.md:100`, or does that go elsewhere?
8. **The orb:** removed in this ticket, or kept until the real-device check passes (#36, #83)?
9. **#68 and #32 (F10):** does F10's "tap both within 3 s" share the tab path or stay separate?
