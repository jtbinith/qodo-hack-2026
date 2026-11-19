# Day 7 part 2: the second blind review (round 2 diff), and the last fix round

**Input:** the second blind review is in `blind-round2/blind-review.md` and `v1.mjs`, committed as received (`9c6861e`). The reviewer read only round 2's diff (`64e2044`).

**Reproduced** on the real `web/check.js` in `<c5>` at `64e2044` (`raw/22-blind2-repro.txt`). **[V]** means verified by a run or in the code; **[A]** means an assumption.

## Findings 1 and 2: reproduced and labelled
| # | Finding | Reproduced | Label | Caused by our fix? |
|---|---|---|---|---|
| 1 | A zero-byte file can be resent without limit | 20,000 of 20,000 zero-byte asks allowed, and 2,000 more took 357 ms; `validPrint` accepts a size-0 print [V] | **Real** | **Yes** (round 2: counting bytes made a 0-byte budget) |
| 2 | The counter table can be filled for free | `validNeed` accepts `missing: []` at a cost of 0 bytes; 20 ids × 1,000 empty-list asks fill the table; an honest new ask is refused at 30 s and at 59.999 s; 12 prototype names (`constructor`, `toString`, `__proto__` …) pass `net.peers[from]`, since `net.peers` is a plain object (`net.js:41`) [V]. The leave-and-rejoin-with-a-new-id path was checked by reading. | **Real** | **Yes** (round 2: the presence check and keeping counters on leave) |

## The fixes (only those you named)
| Commit | What |
|---|---|
| `917e4a2` | **test first.** In `tests/asks.test.mjs`:<ul><li>every ask is charged at least one piece;</li><li>a 0-byte file gets at most 3 sends a minute;</li><li>a size-0 print is refused;</li><li>a `need` with an empty list is dropped;</li><li>12 prototype names don't count as in the room.</li></ul>The old rejoin unit test, which never left (blind 5), is replaced by a plain window test. In `tests/two-browser.mjs`: **B really leaves and comes back** in A's presence, through the page's own presence handling (`net.listeners`, the path that used to clear counters), then sends 20 wants. At `64e2044` the unit file fails to load, because `inRoom` doesn't exist yet. |
| `d660eb6` | **fix:**<ul><li>`askBytes` charges at least one piece (and at least one byte) per ask, and the budget is at least one byte (`check.js`);</li><li>`want` goes through `askBytes` too (`index.html:181`);</li><li>`validPrint` requires `size ≥ 1`;</li><li>`validNeed` refuses `missing: []`;</li><li>a new `inRoom(peers, id)` uses `Object.hasOwn`, and both handlers use it (`index.html:181,195`).</li></ul> |

- **Blind 2's draft #20 wording** about leaving is updated in `04-blind-fixes.md`. It now says counters are *not* cleared when a device leaves, replacing today's "cleared when a device leaves".
- **One change beyond the list:** `want` now goes through `askBytes` as well. Without it, the owner's own zero-byte file could still be asked for without limit, because `want` passed `file.size` directly and skipped the one-piece minimum. That's in the scope of "charge at least one piece per ask".

## Checks [V]
- **`npm test`** (unit, then two-browser direct, then relay): **94/94** unit tests; **76 PASS, 0 FAIL** in the two-browser test (`raw/23`). That includes, in both modes:
  - "B left and came back, then 20 wants made A send photo-0.jpg 0 more times";
  - the S1.5 checks with lower bounds (2 and 1 sends, each within at least 1 and at most 3);
  - "went direct" / "went relay (encrypted)".
- **The rejoin test really catches a regression:** I temporarily brought back "clear counters when a device leaves" and ran the direct two-browser test. It **FAILED**: "…made A send photo-0.jpg 3 more times" (`raw/24`). Then I put the file back. The `MUTATION` line is gone, and the committed `d660eb6` doesn't contain it.

## Outcomes for 3 and 4
| # | Finding | Outcome | Reason |
|---|---|---|---|
| 3 | After counters go stale, the shared 1 s sweep gap can refuse an honest ask for up to 1 s (reproduced: refused at 60.000 s after a sweep at 59.999 s) | **Skipped (deferred)**, in the follow-up ticket | Low: it delays rather than blocks, since the receiver asks again 3 s later. A fix (sweep per device, or sweep when the oldest counter has gone stale) changes blind 9's cost bound and is out of this round's scope |
| 4 | The budget is per file, not per device: one device asking for every photo is allowed 3 files' worth of each | **Skipped (deferred)**, in the follow-up ticket | Outside #20's per-file wording. [A] Over the relay, about 32 MB a minute caps it in practice; on a direct link it doesn't. That needs a decision about a per-device total |

**Blind 5's other points:**
- **Done:** the rejoin test now really leaves.
- **Reported without changes:** the wall-clock sweep test (`< 200 ms`) can be flaky on a slow machine, and the silent-device check fakes presence.

## Draft follow-up ticket (not filed; asking before any GitHub write)
**S1.5 follow-ups: byte-exact refunds, receiver re-asks, the room's device cap, and limits per device.**
1. **Receiver re-asks fit the resend budget (C12 × S1.5)** (first blind review 5). A receiver whose asks are refused under S1.5 backs off until the holder's window allows another, and doesn't give up while that window is still closed.
2. **A room holds at most 20 devices, enforced (S7)** (both blind reviews). The resend table is sized for `LIMITS.devices` × `askRecordsPerDevice`, but nothing enforces `LIMITS.devices`. Device 21 is told the room is full, its presence is ignored, and its asks aren't counted. Links with #17, #21 and #24.
3. **The full-table sweep doesn't refuse honest asks once counters are stale** (second blind review 3). Sweep when the oldest counter has gone stale, or per device, so a refused ask from one device can't hold the sweep back for everyone.
4. **A total per device across files** (second blind review 4). Decide whether one device asking for every file should have a total budget per minute (for example in bytes) on top of the per-file one, and how that fits direct links.
5. **Refunds give back the unsent bytes, not the share of pieces** (Qodo `feeaf5d4` on #87, Security, action_required).
   - **The problem:** `refund` (`web/index.html:83`) gives back `(of − sent) / of` of a byte charge, but a file's last piece can be much shorter than the rest. When a full piece leaves and a 1-byte tail fails, half the charge comes back. Reproduced at `d660eb6`: 5 whole-file sends allowed against a limit of 3 (`06-final-state.md`).
   - **Fix:** refund the bytes that didn't leave. `sendFile` reports `{ sentBytes, ofBytes }` alongside the piece counts, or the refund adds up the sizes of the unsent pieces, and `undo` takes off exactly those bytes.
   - **Test:** a 65,537-byte file whose tail fails is charged 65,536 bytes, not half the file.

## Rounds, findings from our own fixes, and the stopping rule
- **Part 2 rounds:**
  - Round 1: Qodo's 2 findings, fixed in `2c28d31`.
  - Round 2: the first blind review, fixed in `64e2044`.
  - Round 3: the second blind review, fixed in `d660eb6`.
- **Findings caused by our own fixes in part 2:**
  - round 1's fixes caused 2 (+1 in part): first blind review 2 and 6, plus 7 in part;
  - round 2's fixes caused 2: second blind review 1 and 2.

  **Total: 4 (+1 in part).**
- **Stopping rule:** **fired.**
  - A review added findings caused by the previous round's fix **twice in a row**: the first blind review on round 1's fix, then the second blind review on round 2's fix.
  - This is also **round 3** of 3.
  - As you said, this is the last fix round. After the push, Qodo's re-review is recorded as the final state, with no more fixes.
