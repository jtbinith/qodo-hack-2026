# Day 7 part 2: the blind review of #87 and our fix, reproduced (before any change)

## Inputs
- **The review:** `blind/blind-review.md` and `blind/probe.mjs`, committed as received (`6f692f7`). The reviewer read only #20's ticket, both diffs and the code, with no Qodo access.
- **Which code it tested:** its `/tmp` copy of `check.js` differs from our fix (`2c28d31`) **in comments only**, so its probe tested our fix.
- **How I reran it:** against the **real `web/check.js`** in the #87 worktree (`<c5>`), both at `2c28d31` (our fix, local, not pushed) and at `8ddeaf8` (before our fix). That shows which findings our diff caused. Output: `raw/14-blind-probe-on-real-code.txt`.
- **Two runs of my own:**
  - blind 7 with the real `peers.js` (`blind7-relay-false.mjs`, `raw/15`);
  - a test of the "evict the busiest device" variant (`raw/16`).
- **Push:** still held. Nothing is changed in `<c5>`.

**[V]** means verified by a run or in the code; **[A]** means an assumption or inference.

## Reproduction and labels
| # | Blind finding | At `8ddeaf8` | At `2c28d31` (our fix) | Label | Caused by our fix? |
|---|---|---|---|---|---|
| 1 | Alternating half-file lists count as "pieces", so 30 whole files a minute | 30 file-equivalents | 30 | **Real** [V] | No, the first build |
| 2 | A full table refuses everyone, so 20 ids lock out every honest first ask | honest ask allowed | **refused**, at 30 s and again after a keep-alive at 61 s | **Real** [V] | **Yes** |
| 3 | Leaving and rejoining resets the limit (`forget` deletes live counters) | 30 sends in 20 s | 30 | **Partly right** [V]: the same-id rejoin is real and fixable here. A new id resets the limit no matter what we do (#21/#24) | No |
| 4 | 300-piece lists on a 200 MB file are always "pieces" | 1,125 MB/min vs a 600 MB limit | 1,125 MB/min | **Real** [V] | No |
| 5 | The honest receiver's own re-asks are "whole" and locked out for about 50 s | `YY.................YY` | the same | **Real** [V] for the limiter. [A] The real impact needs sends that *moved* bytes and were then lost: our `undo` already covers sends that moved nothing (`02-fixes.md`, `raw/09`) | No |
| 6 | `undo` refunds whichever counter exists now, not the send that failed | n/a (no `undo`) | **6** sends after forget and rejoin, against 3. 5b: it pops the newest stamp, so the window ends early | **Real** [V] | **Yes** |
| 7 | `undo` relies on a mutable `e.sent`; relay-dropped frames resolve `false` | relay drop: counted, nothing sent | the same. A send of 3 pieces with a bad key **resolves** with 0 frames sent, so `undo` never runs (`raw/15`). A non-object, frozen or shared error would refund a send that moved data | **Partly right** [V]: the relay-drop half is real and pre-dates the fix. The mutable-error half is real by reading, but no current throw path produces such an error [A] | **In part**: the `e.sent` shape is ours |
| 8 | Tests that would pass with wrong behaviour | `wantSends <= 3` / `needSends <= 3` with no lower bound (`two-browser.mjs:210-211`) | the same, plus our `undo` tests call `lim.undo` directly | **Real** [V] by reading | In part: our tests skip the `index.html` path |
| 9 | When full, each refused new-file ask scans the whole table | n/a | 10,000 refused asks took 655 ms (about 0.07 ms each) | **Real, low** [V] | Yes, the full-table path is ours |
| 10 | `n / 2` isn't a named limit; the 100-per-device cap can catch honest devices | `n / 2` at `check.js:151` | the same; the cap is ours | **Partly right** [V] by reading. [A] For an honest device to reach 100 live counters it must fetch about 100 files in a minute | In part: the cap is ours |

## Did "evict the busiest device" (your blind 2 leaning) hold? No [V]
I tested a variant of our fix that pushes out the busiest device's oldest counter instead of refusing (`raw/16`):
- An honest ask is then allowed.
- But one device that keeps its big file's counter as its oldest, and lets its own or other ids push it out, got **63 sends of that file in 3 s**. The limit is 3, and the current fix holds it at 3.
- So eviction of any **live** counter reopens Qodo's finding 2.

**[A] What that means:** while device ids are free (#21/#24), any (device, file) limit can be multiplied by using more ids. Eviction attacks cost more than just using fresh ids, but they also reach the "evict a counter" path from fewer ids.

## Options for you to choose

### Problems our fix caused (before any push)
**Blind 2, a full table refusing everyone:**
- **2a. Size the table so it can't fill (recommended).**
  - Per-device cap = 2 × `LIMITS.prints` (1,000). An honest device can't exceed it: it can only ask for files we hold, one photo and one thumbnail per print. That also settles blind 10's cap.
  - Count only devices in the room's presence.
  - Table = per-device cap × `LIMITS.devices` = 20 (PRD S7: "A room holds at most 20 devices"). That's 20,000 records, about 2 MB [A].
  - Asks from devices beyond the 20th are refused, which matches S7's "further presences are ignored".
  - **Trade-off [A]:** it relies on S7's room cap, which isn't enforced yet (fake presences). Filling the table then needs 20 presences each holding 1,000 counters.
- **2b. Evict the busiest device:** **not recommended.** It reopens finding 2 (63 vs 3, above).
- **2c. Go back to evicting, and defer Qodo's finding 2 to #21/#24.** Eviction gains an attacker little more than fresh ids already give. A dismiss with reason `deferred` needs your OK.

**Blind 6, undo refunding the wrong send:**
- **6a. A token from `allow` (recommended).** `allow` returns a token naming the counter and its own stamp. `undo(token)` removes exactly that stamp, and does nothing if the counter has been replaced (after `forget`) or the stamp has expired.
- **Tests:** blind 6's "forget, rejoin, old sends fail" case gives 3, not 6, and its 5b window case.

**Blind 7, the mutable `e.sent` and relay-dropped frames:**
- **7a, with 6a (recommended).**
  - `sendFile` **resolves** with the number of pieces actually sent, and rejects with a typed error that carries `sent`.
  - `index.html` refunds only when the count is known and is 0. An unknown error shape counts as "sent", so it fails safe.
  - A send that resolved with 0 pieces (a relay drop) is refunded too.
- **Test:** the bad-key relay send from `raw/15` gives the allowance back.

### Bypasses in the first build
**Blind 1 and 4. Proposal: one budget per device per file, counted in pieces sent. It fixes both [A], by working through the numbers below.**
- **The rule:** every allowed ask debits the pieces it asks for.
  - A `want` or a `need` with no list debits every piece (`n`).
  - A `need` with a list debits the list's length.
  - The total over any 60 s must stay ≤ `wholeSends × n` (3 whole files).
  - Pieces that never left are given back through the 6a token.
- **Blind 1:** 6 halves equal 3 files, so the 7th is refused, against 30 today.
- **Blind 4:** 300-piece lists for a 3,200-piece file stop at 9,600 pieces a minute, which is 600 MB, against 1,125 MB today.
- **Also:** the `whole`/`pieces` split and `n / 2` (blind 10) go away. `pieceGap` stays as a rate limit on list asks.
- **How #20's acceptance changes:**
  - **Bullet 1 today:** "Per device and per file, whole-file sends are allowed at most 3 times in any 60 seconds. A whole-file send is a `want`, a `need` with no list of pieces, or a `need` whose list covers more than half the file's pieces."
  - **Bullet 1 becomes:** "Per device and per file, the pieces sent in answer to its requests add up to at most 3 whole files in any 60 seconds. A `want` or a `need` with no list counts every piece, and a `need` with a list counts the pieces it lists. Pieces that were never sent are given back."
  - **Bullet 2 today:** "Requests for a few missing pieces (a `need` listing half the pieces or fewer) are allowed at most once a second per device per file."
  - **Bullet 2 becomes:** "A `need` with a list is allowed at most once a second per device per file."
  - **"How to test the attack" gains:** "B sends `need`s for alternating halves every second for a minute, then 300-piece lists for a 200 MB file every second: each time A sends at most 3 files' worth of pieces."
  - The edge cases ("a real transfer that loses pieces still finishes", "per device", "after 60 s") stay as they are.

### Leave and rejoin
**Blind 3:**
- **3a. Let counters go stale instead of deleting them (recommended).** Remove the `forget` on leave (`index.html:352-353`) and keep `forget` for nothing else. The table stays bounded by stale-first cleanup and 2a's per-device cap.
  - [A] A rejoin with a **new** id still starts fresh. That's the #21/#24 identity gap, which this ticket can't close.
  - #20's "counters are cleared when a device leaves" bullet would change to "…go stale and are cleared once their window ends, whether or not the device is still here".

### The honest receiver's re-asks
**Blind 5:**
- **5a. Fix it here.** The receiver backs off after its 3rd whole-file re-ask until the window allows another, and its give-up rule counts time rather than asks (C12). That changes the receiver's retry behaviour, a C12 change, so it's out of #20's scope.
- **5b. Defer it with a new ticket (recommended).** For example: "Receiver re-asks fit the resend budget (C12 × S1.5): when nothing has arrived, a receiver doesn't give up while the holder's window is still closed."
  - Our `undo` already covers sends that moved nothing. What's left is sends that moved bytes which were then lost.

### Blind 7–10 (my call; for 7, see above)
| # | Proposed outcome |
|---|---|
| 7 | **Fixed** with 6a/7a |
| 8 | **Fixed** with the changes above: lower bounds (`wantSends >= 1`, `needSends >= 1`), tests for halves (1), big-file lists (4), forget then rejoin then refund (6), a relay drop refunded (7) and the `index.html` refund path, plus a LIMITS test for the new constants |
| 9 | **Fixed** cheaply: when the table is full, sweep stale counters at most once a second instead of on every refused ask. That matters more if 2a makes the table 10× bigger |
| 10 | **Fixed** by 1/4 (`n / 2` goes away) and 2a (the per-device cap becomes 2 × prints, which no honest device can reach). If you don't pick 1/4: name `n / 2` in `LIMITS` instead |

## Rounds, findings from our own fixes, and the stopping rule
- **Part 2 rounds:**
  - Round 1 was Qodo's review of `8ddeaf8`, which raised 2 findings.
  - Our fixes for them (`2c28d31`) are local and haven't been re-reviewed by Qodo. The blind review is the first review of those fixes.
  - Applying fixes for this review would make **round 2**.
- **Findings caused by our own fixes in part 2:** **2** (blind 2 and blind 6), **plus 1 in part** (blind 7, the `e.sent` shape). Blind 9 and blind 10's cap also come from our diff, but they're low-severity side effects of the same change.
- **Running total across Day 7:** part 1 had 2, part 2 has 2 (+1 in part).
- **Stopping rule** (`00-write-back-policy.md`): stop if a re-review adds a finding caused by the previous round's fix twice in a row, or after 3 rounds.
  - **Not fired.** This is the first review of part 2's fixes to find problems they caused (once, not twice in a row), and we're at round 1 of 3.
  - [A] If the next review of round-2 fixes again finds problems caused by them, the rule fires and I hand back.

I'm stopping here for your choice. Nothing is changed in `<c5>`, and nothing is pushed.
