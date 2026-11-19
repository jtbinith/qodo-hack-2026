### Summary
A device that keeps asking for the same file makes the sender upload it again and again, up to 200 MB each time (T-D3). It floods the room's relay and the sender's data.

### Acceptance (the attack fails)
- Per device and per file, the pieces sent in answer to its requests add up to at most 3 whole files in any 60 seconds. A `want` or a `need` with no list counts every piece, and a `need` with a list counts the pieces it lists. Every ask is charged at least one piece. Requests over the limit are dropped and nothing is sent. Pieces that were never sent are given back.
- A `need` with a list is allowed at most once a second per device per file. The receiver's own retries are 1.5–3 s apart, so they're never dropped.
- Dropped requests don't count towards the limit, so a device can't keep itself locked out.
- Requests for a file this device doesn't have, from a device that isn't in the room, or that ask for nothing (a `need` with an empty list, a print of size 0) are dropped before they're counted.
- The counters are bounded: one device has at most 1000, the room's table holds that many for each of the 20 devices a room can have (S7), and a live counter is never pushed out. Counters are **not** cleared when a device leaves: they're kept until their 60-second window ends, so leaving and coming back doesn't reset them. The limits are named constants in `LIMITS` (Rule 3).

### Edge cases
- A real transfer that loses pieces on the relay still finishes: its retries stay under the limit.
- The limit is per device: a second device asking for the same file still gets it.
- After 60 seconds the same device can ask again.

### Must not break
- `npm run test:browsers`, direct and relay: every check still passes, including the late guest's download and the silent-device timeout.

### How to test the attack
In the two-browser test, B sends A 20 `want` messages for the same photo within a second, then 20 `need` messages listing every piece within a second. Each time A sends the file at least once and at most 3 times (count A's outgoing sends for that photo). B then leaves and comes back, and 20 more wants send nothing more. A third device then asks once and still gets the file. In unit tests, alternating half-file lists every second for a minute, and 300-piece lists for a 200 MB file every second, each send at most 3 files' worth.

### Known gaps (follow-up #88)
Refunds by piece share instead of bytes (Qodo `feeaf5d4`), receiver re-asks under the limit, an enforced 20-device cap, the sweep gap, and a total per device.

