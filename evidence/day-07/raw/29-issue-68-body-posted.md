**PRD ID:** C15 · **Threat IDs:** T-S7 · **Labels:** `type: feature`, `area: sharing`
**Depends on:** none. **Blocks:** #85 (Pending join and Undo), which needs the tap join to exist.

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
  - The device that tapped also starts its own timer, so this works even when the time keeper drops the tap without a `nomatch`. That timer has to outlast the time keeper's latest decision, not just the 2 s window.
    - Each later tap in the room, from any device, can push the decision back. `resolve` waits up to 900 ms after the latest push but no longer than `DEADLINE` from the start of the burst (`web/net.js:98-101`), and re-queuing a lone tap restarts the burst (`:120`).
    - So `joined` can come up to about `WINDOW` + `DEADLINE` = 4.5 s after the first tap in a busy room (about 2.9 s in a quiet one), plus network delay. [V] 4450 ms with the real code (`evidence/day-07/raw/26-blind-repro-on-real-web.txt`).
    - The timer is a named limit derived from `WINDOW` and `DEADLINE`, plus a network margin (for example 5.5 s).
  - The timer is cancelled only by a result that names this device:
    - a `joined` whose `a` or `b` is this device;
    - a `nomatch` whose `dev` is this device;
    - a `retry` whose `devs` includes it.

    Results are broadcast to the whole room (`web/net.js:111,113,118`), so another pair's `joined` doesn't count.
  - "Couldn't tell who to join. Try again" stays until the next tap. It is never replaced by the device's own "No match": a `retry` sends no `nomatch` (`web/layout.js:170-171`).
  - A `joined` that names this device always wins: if it arrives after "No match" or "Try again" has been shown, it replaces it with "Joined with…".
- When taps can't be paired (for example, three at once), then every device involved shows "Couldn't tell who to join. Try again" (the `retry` result).

### Edge cases
- Strips that don't face each other (not opposite edges), or taps 3 s apart, don't join.
- The strip sits inset from the bezel, so a tap never starts where the phone's own edge gestures do (see #83). A tap maps linearly onto the whole edge: the strip's start is `along = 0` and its end is `along = edge length`. So every position can be reached and stays inside the range `validPush` accepts.
- By keyboard, the strip is focusable and has a spoken label ("Join on the right"). The arrow keys move a marker along it. Activating it joins at the marker, which starts at the centre of the edge.
- `nomatch` is shown only on the device it names. `retry` is shown only on devices in its list.
- `joined`, `retry` and `nomatch` are accepted only from the time keeper, as layouts are. Today any device in the room can send them (`web/net.js:134-136`), so without this check anyone with the room code could make "Joined with…" or "No match" appear.
  - **This check isn't real protection until #24 (signed room messages)**, as #85 already says for Undo. The layout check trusts `payload.from` (`web/net.js:124,130`), which the sender sets itself on a channel anyone with the room code can use (`:8,17`). So a device can still send `from: <timeKeeperId>`.
  - `joined`, `retry` and `nomatch` carry no `from` today (`:111,113,118`), so they gain one for the check to work at all.
  - The check stops honest mistakes and stale time keepers, not forgery. T-S7 stays open until #24.
- No Undo in this ticket. Undo, and "settled", come with #85 (Pending join and Undo).
- **A `retry` goes to every device in the batch, not only the ones that clashed** (blind review 4). When any tap is contested, `matchPushes` returns no joins and puts every device in the batch on the `retry` list (`web/layout.js:169-171`). So a bystander tapping an unrelated edge in the same burst, or another pair joining at that moment, is also told to try again. [V] `retry {"devs":["L","A","B","C"]}` (`evidence/day-07/raw/26-blind-repro-on-real-web.txt`). Whether to narrow this is open question 7.
- **Taps pair by edge and time only, not by position** (blind review 7). The pair check uses only edge and time (`web/layout.js:133`), and ties are broken by the time difference (`:148-149`). When stacking two phones, the laptop and each phone tap as a pair, one pair after the other. If all four taps land together, the phones can be swapped with no error. [V] `B@200 <-> L@200, A@200 <-> L@650` (`raw/26`, `swap.mjs`).
- **Taps the time keeper drops with no reply** (blind review 8). This is what the device's own timer is for. A strip tap is always inside the edge, so it can't be dropped for its position. The real silent drops are:
  - a third tap from one device evicts its oldest (`PER_DEV`, `web/net.js:95`);
  - a full batch drops the tap (`MAX_BATCH`, `:96`);
  - the time keeper changes mid-burst, and its pending taps are lost (`:93`);
  - presence still has the old screen size just after a rotation (`:89,143`).

  [V] for the first: 3 laptop taps give 2 `nomatch` (`raw/26`).
- **The 2 s window uses each device's own synced clock** (blind review 9). The tap carries the sender's `s.now()` (`web/net.js:139`), which `matchPushes` compares (`layout.js:133`). Until a device's first clock reply, its offset is 0 (`net.js:23,66`), so it can be paired or refused wrongly. A tap more than 10 s off is dropped silently (`net.js:90`). Times in tests are ranges, not exact values.
- **"Joined with…" shows only on the two devices the join names** (blind review 10). Every `joined` is broadcast to the whole room (`web/net.js:111`). A device shows it only when the join's `a` or `b` is this device, and works out "on your right" from its own edge (`edgeA` if it's `a`, `edgeB` if it's `b`).

### Must not break
- `npm run test:browsers`, direct and relay: every check passes. The existing join steps still pass (`tests/two-browser.mjs:52-55,287-288`).
- The time keeper is the only device that pairs taps, and layouts are accepted only from it (`web/net.js:93,130`).

### How to test
- In the two-browser test, A and B **click the strips** (not `net.push`) at known points. Check that they join, and that the layout puts the two tapped points together.
- Clicks at the two ends of a strip send `along = 0` and `along = edge length`. Keyboard activation with no arrow-key moves sends the centre.
- Taps on non-facing strips, and taps 3 s apart, don't join.
- Two phones on a laptop edge: two laptop taps join both. One laptop tap gives "try again" on all three. Both phones tapped mid-edge gives "try again", not overlapping screens.
- A `joined`, `retry` or `nomatch` sent by a device that isn't the time keeper is ignored. This proves the rule, not protection against forgery: a forged `from` still passes until #24, and the PR says so.
- In a busy room, a pair whose decision comes near 4.5 s (a third device keeps tapping, as in `evidence/day-07/blind/worst.mjs`) shows "Joined", never "No match" first.
- After a `retry`, the devices in its list keep "Try again". Their own timers never replace it with "No match". Another pair's `joined` doesn't cancel this device's timer.
- A lone tap shows the no-match message after the window.
- A second tap 1.9 s after the first shows "Joined" on both devices, and never "No match" first. Run on the real `net.js`, `joined` fires at 2.80 s on the time keeper with no network delay (`evidence/day-07/timing-check.mjs`). On other devices, the test checks a range rather than an exact time.
- A tap the time keeper drops without a reply (one of the silent drops in Edge cases, sent with `net.push` since a strip tap is always in range) shows "No match" once the device's own limit runs out.
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
| Blind review on the A+B fix: the limit covers `WINDOW` + `DEADLINE`; only results naming this device cancel its timer, and "Try again" isn't overwritten; the time-keeper check is no protection until #24 | Our 4 s limit was too short in a busy room (4450 ms), a `retry` sends no `nomatch`, and `from` can be forged | [V] `net.js:98-101,111-120,124,130`, `layout.js:170-171`; `evidence/day-07/03-blind-repro.md`, `raw/26` |

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
6. **How overlap is refused, and the "unchanged" summary** (blind review 5). Today overlapping joins are kept:
   - `matchPushes` ranks the number of joins above overlaps (`web/layout.js:149`), and `addJoins` never drops fresh joins (`:57-59`).
   - [V] Two phones tapped mid-edge, with the laptop tapping at 200 and 700, give two `joined` at 900 ms with the phones overlapping (`raw/26`).

   Should an overlapping set refuse the whole batch (`retry`), or keep a smaller set that doesn't overlap? Either way `matchPushes` changes. With the time-keeper-only check, that's two changes, so the Summary's "goes through today's push pipeline unchanged" must be reworded once this is decided.
7. **Narrow `retry` to the devices that clashed?** Today it goes to the whole batch, bystanders included (see Edge cases).
8. **Screen sizes for the stacking tests** (blind review 6). Layout is in CSS px (`web/layout.js:1-3`), with 6 px of overlap allowed (`:22,31`).
   - Two portrait phones (about 800 px each) can't both fit on a 900 px laptop edge, so with overlap refused they would always get "try again".
   - Whether "mid-edge" overlaps depends on how far apart the laptop's two taps are, not only on where the phones tap.

   Which sizes and laptop tap points do the stacking tests use (for example landscape phones, 400 px tall)?

---
_Revised on 18 Nov after asking the codebase with Qodo Codebase Wisdom, then revised again after a second pass with the challenge prompt, Qodo's review on PR #86 (finding `24cbc11a`) and a blind review. Evidence on PR #86: `evidence/day-06/` (`q4-answer.md`, `q5-brief-prompt.md`, `05-revised-tickets.md`, `06-claims-checked.md`) and `evidence/day-07/` (`02-finding-2.md`, `03-blind-repro.md`, `04-blind-vs-qodo.md`)._
