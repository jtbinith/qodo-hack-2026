# Blind review: ticket #68 (join strip), checked against net.js / layout.js / check.js / index-300-360.html

Scripts: `/tmp/blind-work/sim.mjs` (fake clock + fake channel driving the real `net.js` time keeper), `run.mjs`, `worst.mjs`, `swap.mjs`. Copies of the source are in `/tmp/blind-work/src/`. Times are on the time keeper with zero network delay.

1. **"Only from the time keeper, as layouts are" can be faked: the sender ID is just a field in the message.** High.
   - Ticket: Edge cases ("`joined`, `retry` and `nomatch` are accepted only from the time keeper, as layouts are"), Must not break ("layouts are accepted only from it (`net.js:93,130`)"), How to test ("sent by a device that isn't the time keeper is ignored").
   - Code: `net.js:124` the layout carries `from: id` inside the payload. `net.js:130` checks `payload.from !== s.leader`. Nothing ties `from` to the real sender (broadcast, anon key, `net.js:8,17`). Anyone with the room code can send `from: <leaderId>` and pass. `joined`, `retry` and `nomatch` carry no `from` at all (`net.js:111,113,118`), so the check needs a payload change too.
   - The planned test (a non-time-keeper sends a message without, or with its own, `from`) would pass while threat T-S7 stays open. The ticket should say this check only stops honest mistakes, or name a real sender check.
   - Verified by: reading.

2. **The new timer limit is based on the wrong worst case: decisions can come up to about WINDOW + DEADLINE (4.5 s), not WINDOW + 900 ms.** High (this is in the changed lines).
   - Ticket: added sub-bullet ("`joined` can come about 2.9 s after the first tap … for example 4 s") and the added test ("never 'No match' first").
   - Code: `net.js:120` sets `burstStart` again every time lone pushes are put back in the queue. `net.js:100` then lets any later push, from **any** device, delay `resolve` by up to `DEADLINE` (2500 ms) from that point. So other devices tapping push the decision back.
   - Measured:
     - Partner taps at 1.95 s, then a third device taps a few times: `joined` at **4450 ms**.
     - A lone tap while another device taps every 800 ms: `nomatch` at **3300 ms** (2100 ms when the room is quiet).
   - With a 4 s limit, "No match" shows first and then flips to "Joined". The limit has to be at least `WINDOW + DEADLINE + margin`, or the ticket must admit the flip is possible in a busy room.
   - Verified by: running `worst.mjs` and `run.mjs`.

3. **The device's own timer is cancelled only by `joined`/`nomatch`, not `retry`, and it doesn't say these must name this device.** Medium-high (changed lines).
   - Ticket: "It's cancelled when `joined` or `nomatch` arrives."
   - Code: `retry` replaces any `nomatch` for that batch (`layout.js:171`: `unmatched: []`; `net.js:113`). After "Couldn't tell who to join" (around 0.9 s), the timer still fires at 4 s and overwrites it with "No match".
   - Also, every `joined` goes to the whole room (`net.js:111`). Unless cancelling needs a `joined` with `a`/`b` equal to me (or `nomatch.dev`/`retry.devs` containing me), another pair's join cancels my timer.
   - Verified by: reading, plus `run.mjs` (a `retry` batch sends no `nomatch`).

4. **"Every device involved" gets `retry`: in fact every device in the batch does, and other pairs in that batch lose their joins.** Medium.
   - Ticket: Acceptance, the overlap bullet and the `retry` bullet; How to test ("One laptop tap gives 'try again' on all three").
   - Code: `layout.js:170-171` returns `joins: []` and `retry` = all devices in the batch.
   - Measured: laptop taps once, two phones tap, and a bystander C taps an unrelated edge in the same burst. Result: `retry {"devs":["L","A","B","C"]}`. C, and any unrelated pair joining at the same moment, is told to try again.
   - The ticket should state this or ask for it to be narrowed.
   - Verified by: running `run.mjs` case 5.

5. **The summary says the pipeline is "unchanged", but two acceptance rules need it changed, and the overlap rule doesn't say how to decide.** Medium.
   - Ticket: Summary ("goes through today's push pipeline unchanged") against the overlap bullet and the time-keeper-only rule.
   - Code today keeps overlapping joins:
     - `matchPushes` ranks the number of joins above overlaps (`layout.js:149`).
     - `addJoins` never drops fresh joins (`layout.js:57-59`).
     - Measured: two phones tapped mid-edge, laptop taps at 200 and 700, gives two `joined` at 900 ms with the phones overlapping.
   - Not specified: should an overlapping set refuse the **whole batch** (`retry`), or pick a smaller set that doesn't overlap (for example one join)? Either way `matchPushes`'s scoring and its output shape change.
   - Verified by: running `run.mjs` case 7, and reading.

6. **Whether phones can stack depends on CSS-pixel sizes, which the ticket never fixes, so the stacking and "mid-edge" tests can't be pinned down.** Medium.
   - Ticket: Acceptance (laptop + two phones "stacked down that edge"), How to test ("Both phones tapped mid-edge gives 'try again'").
   - Code: the layout is in CSS px (`layout.js:1-3`). Overlap allows 6 px (`layout.js:22,31`).
   - Two portrait phones of about 800 px can never fit on a 900 px laptop edge. With the new overlap rule, every stacking attempt then becomes "try again". Landscape phones fit.
   - Whether "mid-edge" overlaps depends on where the **laptop** taps, not only the phones (overlap if the laptop's two points are closer than a phone's height).
   - The ticket should give the screen sizes and the laptop's tap points.
   - Verified by: reading, plus `run.mjs` case 7.

7. **The stack is paired by time, not by where the taps are, so "at the point facing that phone" isn't checked.** Low-medium.
   - Ticket: Acceptance, the stacking bullet ("each phone taps … at the same moment").
   - Code: `layout.js:133` (the pair check uses only edge and time) and `layout.js:148-149` (ties are broken by time difference).
   - Measured: laptop taps top (200) then bottom (650). B (physically at the bottom) taps with the first laptop tap and A with the second. Result: `B@200<->L@200, A@200<->L@650`, so the phones are swapped with no error.
   - If all four taps happen at once, the pairing is arbitrary. The ticket should say the laptop and each phone tap as a pair, one after the other.
   - Verified by: running `swap.mjs`.

8. **The example of a dropped tap ("its position is off the screen") can't happen through the strip. Real silent drops exist but aren't named.** Low-medium.
   - Ticket: added test ("A tap the time keeper drops without a reply (for example, its position is off the screen)") against the Edge case (the strip maps onto `0..edge length`, always in range).
   - Code: drops that really give no reply:
     - The per-device cap evicts the oldest tap silently (`net.js:95`). Measured: 3 laptop taps give only 2 `nomatch`.
     - A full batch is dropped (`net.js:96`).
     - The time keeper changes mid-burst: pending `pushes` are lost and the new time keeper ignored them (`net.js:93`).
     - Presence still has the old w/h after a rotation (`net.js:89`, `143`).
   - The test as written must call `net.push` directly, not click the strip.
   - Verified by: running `run.mjs` case 6, and reading.

9. **"`joined` fires at 2.80 s" is exact only on the time keeper with zero delay. The 2 s window uses the sender's clock reading.** Low.
   - Ticket: added test (2.80 s), and Acceptance "within 2 s".
   - Code: `net.js:100` (900 ms after arrival, so 2.8 s plus relay delay on the other device). The lone-tap `nomatch` comes on a 400 ms step (`net.js:120`), so anywhere from 2.0 to 2.4 s.
   - The window compares the sender-supplied `p.t` (`net.js:139`, `layout.js:133`). A device whose clock hasn't synced yet (`offset` 0 until the first pong, `net.js:23,66`) can be paired or refused wrongly. Its tap is also silently dropped if it is more than 10 s off (`net.js:90`).
   - Tests should check bounds (for example `joined` within 2.8 to 3.5 s), not an exact value.
   - Verified by: running `run.mjs` case 2, and reading.

10. **The ticket doesn't say `joined` is shown only on the two devices named in it, and today's page shows it on every device.** Low.
    - Ticket: Edge cases (filtering is given for `nomatch` and `retry` only), and Acceptance ("both show 'Joined with <name>, on your right'").
    - Code: `index-300-360.html:51-53` shows the toast on every `joined`. `net.js:111` broadcasts every join to the whole room.
    - Add: show it only when `a` or `b` is this device, and work out the side from `edgeA`/`edgeB`.
    - Verified by: reading.

**Fix first: #1.** It is the ticket's only threat item (T-S7), and the planned test would pass while forged results still get through. The design needs a real decision, not just new wording.
