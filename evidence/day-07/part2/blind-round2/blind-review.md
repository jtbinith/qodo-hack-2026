# Blind review: round2.diff (ticket #20 resend limits)

Verification scripts: /tmp/blind20b-work/v1.mjs (imports /tmp/blind20b/check.js).

## 1. A zero-byte file can be resent without limit (high)
- Where: check.js:184/188 (`sum + bytes > LIMITS.wholeSends * size`), used at index.html:181.
- Scenario: for a file of size 0 the budget is 3 × 0 = 0 and every ask costs 0 bytes, so `0 + 0 > 0` is never true and every `want` is allowed. sendFile still sends one frame each time (`n = ceil(0/cs) || 1`). A hostile device can make the holder keep a zero-byte file: it announces a print with `size: 0` and the SHA-256 of nothing, places it on A's screen (`print`/`move`), sends `dropcheck`, and answers A's `want` with one empty chunk. validChunk accepts it (`n = pieceCount(0, cs) = 1`, expected length 0) and so does the hash check. After that, every `want` makes A send a frame, so A's shared relay queue (one frame per 45 ms) fills up and honest transfers slow down. Each record's `sends` list also grows with no cap (`allow` filters and sums it on every call): 20,000 allowed asks, then 2,000 more took 359 ms.
- Round 1 counted sends, not bytes, so this is new in round 2.
- Verified: the limiter part by running code (20,000 of 20,000 zero-byte asks allowed). The steps that plant the file were checked by reading.
- Fix: charge at least one piece per ask (for example `max(bytes, min(size, cs)) || 1` against a budget of `max(size, 1)`), or refuse size-0 prints.

## 2. The counter table can be filled for free, so honest first asks are refused (medium)
- Where: check.js:153 (an empty list costs 0 bytes), check.js:178/187 (a full table refuses), index.html:181/195 (presence check `net.peers[from]`), the removed `forget` (index.html start()), and the unenforced `LIMITS.devices` (check.js:16).
- Scenario: a `need` with `missing: []` passes validNeed. askBytes returns 0 and sendFile sends nothing, but the counter it creates stays live for 60 s. Counters are no longer cleared when a device leaves. A device that joins with id1, opens up to 1,000 counters (2 per print the holder has), leaves, and comes back as id2 keeps all of them live. After 20 ids' worth (20 × 1,000) the table is full and nothing went over the wire. From then on, every honest device's first ask for a file is refused until those counters go stale. The 20-device sizing is only true if the room really holds 20 devices, and nothing in these files enforces `LIMITS.devices`. The presence check uses a plain object, so 12 ids (`constructor`, `toString`, `__proto__`, ...) pass `net.peers[from]` without ever being in the room.
- Ticket: the acceptance criteria say counters are "cleared when a device leaves". This diff stops doing that on purpose, which is a fair choice, but the ticket text should be updated to match.
- Verified by running code: table at 20,000, and an honest new ask refused at 30 s and at 59.999 s; 12 prototype ids pass a plain-object lookup. The leave-and-rejoin path through presence was checked by reading.
- Fix: count an empty list as at least one piece (or drop it, since a real receiver never sends one). Use `Object.hasOwn(net.peers, from)`. Then either enforce the device cap or limit counters per present device rather than for the whole table.

## 3. After counters go stale, the sweep gap keeps refusing (low)
- Where: check.js:186.
- Scenario: `swept` is shared by everyone, and any refused new pair moves it forward, including an attacker sitting at its own per-device cap. Counters that went stale at 60 s are not swept if a sweep ran in the last second, so an honest ask at 60.000 s is refused (my run: a sweep at 59.999 s caused a refusal at 60 s). Receivers ask again 3 s later, so this delays rather than blocks.
- Verified by running code.

## 4. The budget covers each file but not the device as a whole (low, outside the ticket's per-file wording)
- Where: check.js:156-196; index.html:181/195.
- Scenario: 3 files' worth per minute applies to each file separately. One device asking for every photo A holds (say 100 × 5 MB) is allowed 1.5 GB a minute. A's relay sends about 24 KB per 45 ms, roughly 32 MB a minute, so this limit never kicks in over the relay. Sends are also counted when they are asked for, not while they run, so slow sends pile up.
- Verified by reading.

## 5. Some tests pass even when the behaviour is wrong, and some code has no tests (low)
- asks.test.mjs, "a device that leaves and rejoins keeps its counters": no device leaves in this test. It only moves the clock forward, so it would still pass if index.html went back to clearing counters on leave.
- asks.test.mjs, "a full table is swept at most once a sweepGap": it checks wall-clock time (< 200 ms), so it can fail on a slow machine and doesn't prove the gate.
- `refund` and the presence check sit inline in index.html. Only the two-browser test reaches them, and that test now fakes presence for the silent device, so the silent-device timeout check runs a patched path.
- No tests cover a zero-size file, `missing: []`, or prototype-name ids.
- Verified by reading.

## Checked and found sound
- Token refunds: there is no double refund (each token gets one `.then(ok, fail)` handler), and an old token can't refund a replaced counter (`recs.get(key) !== tok.r`). A send that has already left the window gets nothing back (`indexOf < 0`). Partial refunds give back the exact share; floating point allows an exact fill (checked).
- Refunds for relay frames that were dropped (a bad key, a full outbox) can't be abused. A device in that state can't get its own asks to A either: relayed frames are dropped while its key is bad or still on the way, and if its direct link is open A sends over it, so the pieces really leave.
- Window and gap edges are half-open and consistent with the tests. Honest automatic re-asks (at least 3 s apart, lists of at most 300 pieces, `cs` always set) stay within budget.
- The callers changed from `e.sent` (a number) to `{ sent, of }` handle both results and errors. `gaveUp` doesn't read `sent`. The thumbnail push in `announce` is not counted, as before.

Fix first: finding 1 (zero-byte file bypass).
