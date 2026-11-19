# Blind review: ticket #20 (resend limits), fix.diff first

Verification scripts: /tmp/blind20-work/probe.mjs (imports /tmp/blind20/check.js; run `node probe.mjs`).

1. **Splitting a whole file into two "few pieces" asks gets round the limit (30 full copies a minute)**. High. check.js:151 (`> n / 2`) and check.js:171 (pieceGap only).
   Scenario: B sends `need {missing: first half}` at t=0, `need {missing: second half}` at t=1 s, and keeps alternating. Both count as 'pieces', which only has the 1 s gap, so A sends the whole file every 2 s. That is 30 full copies in 60 s against the limit of 3, and the 'whole' allowance comes on top. The attack test in the ticket only sends lists that cover every piece, so it never sees this. **Verified** (probe 1: 30 whole-file equivalents in 60 s).

2. **fix.diff: a full table refuses everyone else, so a few hostile ids can block every honest download in the room**. High. check.js:174-176.
   Scenario: 20 hostile ids (ids cost nothing; any string of 40 characters or fewer) each ask for 100 fids A holds. `thumb:<pid>` counts as a separate fid, so 50 prints give 100. That fills the 2000-entry table. Each id then re-asks about once a minute to keep its counters live, and can stall those sends (a full direct buffer or a missing key) so they cost A almost nothing. Any honest device's first `want` or `need` for a file is then refused with nothing sent. The receiver's re-asks are refused too, and it gives up after 20 asks. The new test (`lim.allow('z', ...) === false`) treats this as the intended behaviour. **Verified** (probe 3: honest ask refused at 30 s and again after the keep-alive at 61 s).

3. **Leaving and rejoining resets a device's limit**. High/medium. index.html:352-353, check.js:190.
   Scenario: B asks 3 times, drops out of presence, rejoins with the same id (or a new one) and asks 3 more times, and repeats. `forget` wipes counters that are still live, and the sends already running to B carry on. In 10 cycles over 20 s, B got 30 whole sends. The fix's stale-first eviction already keeps the table bounded, so live counters don't need deleting on leave. They can be left to go stale. **Verified** in the limiter (probe 4). The presence timing was checked by reading only.

4. **300-piece lists on big files are always 'pieces', so they send more than the whole-file limit allows**. Medium. check.js:151 with validMissing's 300 cap (check.js:62).
   Scenario: a 200 MB file at 64 KB is 3200 pieces, so any list (300 at most) is 'pieces'. B asks for 300 different pieces every second. That is about 19 MB/s, the whole file every 11 s, and 1125 MB a minute, against the 600 MB the whole-file limit allows. This applies per file and per device. **Verified** (probe 2).

5. **The receiver's own re-asks get counted as 'whole' and locked out for about 50 s, so lossy honest transfers stall**. Medium. index.html:236-241 and check.js:148/151.
   Scenario: nothing has arrived yet (`missing: null`), or the relay lost more than half the pieces. Every automatic re-ask (at least 3 s apart, not 1.5 s) then counts as 'whole'. The want at 0 s and re-asks at 3 s and 6 s are allowed. The re-asks from 9 s to 57 s are dropped. Only the 20th, at about 60 s, gets through, and the receiver gives up at 20 asks. So the "still finishes" edge case only holds by a few seconds, if at all. **Verified** in the limiter (probe 6: `YY.................YY`). The re-ask timing was checked by reading.

6. **fix.diff: undo gives back whichever counter exists now, not the send that failed**. Medium/low. check.js:185-189, index.html:177/190.
   Scenario: 3 sends to B are stalled. B leaves (`forget`), rejoins and gets 3 real sends on a new record. The old sends then time out with sent=0, and their `undo` pops the new record's stamps, so B gets 3 more. That is 6 real sends inside the window (**verified**, probe 5). `whole.pop()` also takes off the newest stamp rather than the failed send's own, so the window ends early. Fix: have `allow` return a token (its timestamp) and pass that to `undo`, ignoring it if the record has been replaced.

7. **fix.diff: undo relies on a mutable `e.sent`**. Low. peers.js:199-203, index.html:177/190.
   A non-object error, a frozen error, or one error object shared between sends makes `!e?.sent` true after pieces have already gone out, so a send that moved data gets refunded. In the other direction, frames that `relay()` drops come back `false` without throwing (keyFailed, a full outbox). `sendFile` then succeeds having sent 0 pieces, and the honest receiver's slot is used up for nothing. Returning `{ sent }` or a typed error would be safer. **Reading.**

8. **Tests that would pass with wrong behaviour**. Low/medium. two-browser.mjs (feature.diff), asks.test.mjs.
   - `wantSends <= 3` and `needSends <= 3` pass with 0 sends, so a broken want/need handler would pass. There is no lower bound and no bytes check.
   - No test covers the halves split (#1) or big-file lists (#4).
   - "retries 1.5 s apart are never dropped" only tests 'pieces'. Real re-asks are at least 3 s apart and are often 'whole' (#5).
   - The undo tests call `lim.undo` directly. Neither the `!e?.sent` condition in index.html nor the replaced-record case (#6) is tested.
   - The LIMITS test doesn't check `askRecordsPerDevice`.
   **Reading.**

9. **When the table is full, every refused new-file ask scans all 2000 records**. Low. check.js:175.
   Scenario: a device at its 100 live counters (or a full table) floods asks for new fids. Each one costs an O(table) scan plus a `filter` on each record, about 0.07 ms per message, so a fast direct channel can burn CPU. **Verified** (probe 8: 10,000 refused asks took 695 ms).

10. **A limit without a name, and a per-device cap that can catch honest devices**. Low. check.js:151 (`n / 2` is not in LIMITS, against Rule 3), check.js:17.
    A print's photo and its thumbnail take one record each. A device catching up on many prints quickly (each re-ask stays live for 60 s) can reach 100 and have its new files refused without any message. **Reading.**

**Fix first:** #1. One device with no setup gets 10 times the limit through the normal 'pieces' path, which defeats the point of the ticket. Count pieces sent per (device, file) against the whole-file budget, for example in bytes. Then fix #2 before fix.diff is pushed, because it turns the cap into a way to lock out the whole room. Size `askRecords` at or above `askRecordsPerDevice` × the most devices a room can hold, or evict the busiest device's counters rather than refusing everyone.
