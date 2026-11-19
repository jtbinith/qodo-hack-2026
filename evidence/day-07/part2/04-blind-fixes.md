# Day 7 part 2: fixes for the blind review of #87 (local, not pushed)

**Your choices** (on `03-blind-repro.md`):
- 2a (size the table so it can't fill);
- 6a+7a (token undo, and `sendFile` reports what left);
- the pieces budget for blind 1 and 4;
- 3a, with blind 5 deferred.

Blind 7–10 were my call: all **fixed** as proposed.

**Commits** in the #87 worktree (`<c5>`), on top of `2c28d31`. **Not pushed.**

| Commit | What |
|---|---|
| `f8949f3` | **test first:** `tests/asks.test.mjs` rewritten for the new API (31 tests), plus 4 new `peers.test.mjs` tests. Against `2c28d31`, `asks.test.mjs` fails to load (`askBytes` doesn't exist) and 6 of the new or changed `peers.test.mjs` tests fail. |
| `64e2044` | **fix:** `web/check.js`, `web/peers.js`, `web/index.html`, and `tests/two-browser.mjs` (see below) |

Diff stat: `raw/20-diff-stat-blind-fixes.txt`. **[V]** means verified by a test or run; **[A]** means an assumption.

## What changed
| Blind | Change | Where | Tests [V] |
|---|---|---|---|
| 1, 4 | **One byte budget per device per file.** `askBytes(m, size)` returns the bytes an ask asks for: the file for a `want` or a `need` with no list, the listed pieces × piece size for a list (at most the file). `allow` refuses once a (device, file) would pass `wholeSends × size` in any `wholeWindow`. A list ask is still at most once a `pieceGap`. The `whole`/`pieces` split and `n / 2` are gone. | `check.js` | alternating halves stop at 3 files a minute (was 30); 300-piece lists on 200 MB stay ≤ 600 MB (was 1,125); pieces and whole asks share one budget |
| 2 | **A table sized so it can't fill.** New `LIMITS.devices: 20` (S7), `askRecordsPerDevice: 1000` (2 × `prints`) and `askRecords: 20000`. A live counter is still never pushed out. Only devices in the room (`net.peers`) are counted. | `check.js`, `index.html:181,195` | 19 devices at their cap still leave room for the 20th; 25 ids × 1,000 still can't reset B; a full table refuses, then allows once stale; LIMITS sizing |
| 3 | **Counters kept on leave.** The `forget` on presence change is removed, and `forget` is gone. Counters go stale instead. | `index.html`, `check.js` | leave and rejoin with the same id keeps the limit |
| 6 | **Token undo.** `allow` returns a token (counter, send, previous list time) or `null`. `undo(token, share)` takes `share` of exactly that send off, and does nothing if the counter has been replaced or the send is out of the window. | `check.js` | refunds the failed send, not the newest (window case); an old token after the counter is replaced refunds nothing; a partial share; a list ask's slot |
| 7 | **`sendFile` reports what left.** It resolves with `{ sent, of }`. A failure carries the same as `e.sent`, and `null` if another send already marked that error. `index.html` refunds `(of − sent) / of` only for a known count: an unknown error refunds nothing, so it fails safe. A relay send whose frames were all dropped now resolves `{ sent: 0, of }` and is refunded. | `peers.js:186-210`, `index.html:83,182,196` | a relay send with a bad key resolves `{ sent: 0, of: 3 }` with 0 frames (**the relay-drop test you asked for**); a stalled send gives `{ sent: 1, of: 3 }`; a finished one gives `{ sent: 2, of: 2 }`; a shared error gives `null` |
| 8 | **Tests that could pass wrongly:** the two-browser S1.5 checks gain lower bounds (`>= 1`), plus everything in this table and a LIMITS test for the new constants | `two-browser.mjs:217-218`, `asks.test.mjs` | |
| 9 | **The full-table sweep** runs at most once a `sweepGap` (1 s, a new constant) | `check.js` | 10,000 refused asks on a full table finish in < 200 ms (was 655 ms) |
| 10 | `n / 2` is gone (pieces budget), and the per-device cap is 2 × prints, which no honest device can reach | `check.js` | LIMITS test |

## Every caller of `sendFile` [V] (`raw/21-sendFile-callers.txt`)
- **`index.html:158`**, the thumbnail sent with an announce: `.catch(() => {})`. It ignores the resolved value and isn't counted by the limiter. It works unchanged.
- **`index.html:182`** (`want`) and **`:196`** (`need`): changed to `.then((s) => refund(tok, s), (e) => { refund(tok, e?.sent); … gaveUp … })`. `gaveUp` still gets the original error, so `e instanceof SendTimeout` still works: the silent-device check still says "stopped answering" only for a timeout.
- **Tests:**
  - `peers.test.mjs` uses only the promise state, except the tests above.
  - `two-browser.mjs:181,221-222` wraps `sendFile` and returns `real(...a)`, so the value passes through.
  - `two-browser.mjs:187-188,235` call it directly and ignore the value.

## One test change needed by 2a [V]
The S1.3 silent-device step (`two-browser.mjs:155-182`) has A receive a `want` from a ghost id that isn't in presence. With 2a, that ask isn't counted, so it isn't served either.
- A real silent device would be in the room, so the test now shows the ghost in A's presence for those steps and removes it afterwards (`ghostHere`).
- Side effect, seen in the run: the read-error toast now names the device ("Couldn't send photo-1.jpg to silent") instead of "to a device".

## Checks run [V]
- **`node --test tests/peers.test.mjs`:** 16/16 pass (`raw/19`).
- **`npm run test:unit`:** 89/89 pass (`raw/18`).
- **`npm run test:browsers`, direct then relay:** 74 PASS, 0 FAIL (`raw/17`). That includes:
  - "went direct" and "went relay (encrypted)";
  - the silent device giving up after 10.0 s in both;
  - the S1.5 attack checks: 20 wants gave **2** sends and 20 needs gave **1**, each within "at least 1, at most 3".

## Trade-offs [A]
- **Heavy loss refused:** an honest receiver re-asking more than 3 files' worth of pieces in a minute (very heavy loss) is now refused. That's tested ("retries … more than 3 files' worth … are refused"). Normal loss stays well under: 80 pieces of a 100-piece file over 60 s are all allowed.
- **S7 isn't enforced:** 2a relies on it. More than 20 devices each holding 1,000 live counters can still fill the table, and then new (device, file) asks are refused until counters go stale (≤ 60 s). Fake ids are #21/#24.
- **Sweep delay:** while the table is full, a stale counter may wait up to 1 s (`sweepGap`) before it's swept and its slot reused.
- **Docs not updated:** `docs/ARCHITECTURE.md`, `TESTING.md` and `THREAT-MODEL.md` still describe S1.5 in the old whole/pieces terms, and so does #20. The drafts are below. Not done, because GitHub is outward-facing and the docs weren't in scope.

## Draft: #20's acceptance (for when you say go; not posted)
- **Bullet 1:** "Per device and per file, the pieces sent in answer to its requests add up to at most 3 whole files in any 60 seconds. A `want` or a `need` with no list counts every piece, and a `need` with a list counts the pieces it lists. Pieces that were never sent are given back."
- **Bullet 2:** "A `need` with a list is allowed at most once a second per device per file."
- **Bullet on counters** (updated after the second blind review). It replaces today's "The counters are bounded: they're cleared when a device leaves and capped in number":
  - "The counters are bounded: one device has at most 1000, the room's table holds that many for each of the 20 devices a room can have (S7), and a live counter is never pushed out."
  - "Counters are **not** cleared when a device leaves. They're kept until their 60-second window ends, so leaving and coming back with the same id doesn't reset them."
  - "Only devices in the room's presence are counted and served."
  - "Every ask is charged at least one piece, a print of size 0 is refused, and a `need` with an empty list is dropped."
  - "The limits are named constants in `LIMITS` (Rule 3)."
- **"How to test the attack" gains:** "B sends `need`s for alternating halves every second for a minute, then 300-piece lists for a 200 MB file every second: each time A sends at most 3 files' worth of pieces."

## Draft: a new ticket for blind 5 (not filed)
**Receiver re-asks fit the resend budget (C12 × S1.5).**
- **Problem:** when nothing has arrived, or most of the pieces were lost after they left, the receiver's automatic re-asks are whole-file asks. After the holder's budget of 3 files is used, they're refused until the window ends, and the receiver can give up after 20 asks just as the window reopens (blind review 5; `03-blind-repro.md`).
- **Acceptance:** "A receiver whose asks are being refused under S1.5 backs off until the holder's window allows another, and doesn't give up while that window is still closed. A transfer whose sends all failed with nothing sent finishes as soon as the link recovers (already true: refunds, #87)."
- **Links:** C12, S1.5 (#20), #87.

## Rounds, findings caused by our own fixes, and the stopping rule
- **Round 1:** Qodo's two findings on `8ddeaf8`, fixed in `2c28d31`.
- **Round 2:** the blind review of that fix found 2 problems it caused (blind 2 and 6) plus 1 in part (blind 7), all fixed now in `64e2044`, along with the first-build bypasses 1, 3 and 4, and 8–10.
- **Findings caused by our own fixes:** 2 (+1 in part) in part 2. Day 7 overall: 2 in part 1, 2 (+1) in part 2.
- **Stopping rule:** **not fired.** It fires if a review of round 2's fixes again finds problems caused by them (twice in a row), or after round 3. **[A] Next:** a review of `64e2044` (blind or Qodo after a push) is the check. If it finds problems caused by round 2's changes, the rule fires and I hand back.

**Not done:** no push, no Resolver write, nothing posted to GitHub (#20 and the new ticket are drafts above).
