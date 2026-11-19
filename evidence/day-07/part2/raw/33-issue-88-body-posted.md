**PRD ID:** S1.5, S7, C12 · **Threat IDs:** T-D3 · Follows #20 and #87

### Summary
#87 limits how much one device can make another resend a file (S1.5), but T-D3 isn't fully closed. Five things are left, found by Qodo's review of #87 and by two blind reviews.

### 1. Refunds give back the unsent bytes, not the share of pieces (Qodo `feeaf5d4`, security)
`refund` (`web/index.html:83`) gives back `(of − sent) / of` of a byte charge, but a file's last piece can be much shorter than the rest. When a full piece leaves and a 1-byte tail fails, half the charge comes back: at `d660eb6`, 5 whole-file sends were allowed against a limit of 3.
- **Fix:** refund the bytes that didn't leave. `sendFile` reports `{ sentBytes, ofBytes }` as well as the piece counts, and `undo` takes off exactly those bytes.
- **Test:** a 65,537-byte file whose 1-byte tail fails is charged 65,536 bytes, not half the file.

### 2. Receiver re-asks fit the resend budget (C12 × S1.5)
When nothing has arrived, or most pieces were lost after they left, the receiver's automatic re-asks are whole-file asks. Once the holder's budget is used, they're refused until the window ends, and the receiver can give up after 20 asks just as the window reopens.
- **Acceptance:** a receiver whose asks are being refused backs off until the holder's window allows another, and doesn't give up while that window is still closed.

### 3. A room holds at most 20 devices, enforced (S7)
The resend table is sized for `LIMITS.devices` × `askRecordsPerDevice`, but nothing enforces `LIMITS.devices`.
- **Acceptance:** device 21 is told the room is full, its presence is ignored, and its asks aren't counted. Links with #17, #21 and #24.

### 4. The full-table sweep doesn't refuse honest asks once counters are stale
The 1 s sweep gap is shared, so a refused ask from one device can hold the sweep back and an honest ask is refused for up to 1 s after counters go stale.
- **Acceptance:** sweep when the oldest counter has gone stale, or per device.

### 5. A total per device across files
3 files' worth a minute applies to each file separately, so one device asking for every photo has no total.
- **Decide:** whether to add a total per device per minute (for example in bytes) on top of the per-file budget, and how that fits direct links.

### Must not break
- `npm test`: unit, then the two-browser test direct and relay.
