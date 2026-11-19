# Drafts for the GitHub writes (not posted)

**Order if all are approved:** file the follow-up ticket (3) first, so its number replaces `#NN` in #87's description (1). Then edit #20 (2) and #87 (1), and push the evidence (4).

---

## 3. New ticket (file first)

**Title:** S1.5 follow-ups: byte-exact refunds, receiver re-asks, the room's device cap, and limits per device

**Labels:** `type: security`, `area: network` (the same as #20)

**Body:**

```markdown
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
```

---

## 2. #20's new acceptance (edit the issue body)

The change replaces the Acceptance and "How to test the attack" sections. Summary, Edge cases and Must not break stay as they are.

```markdown
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

### Known gaps (follow-up #NN)
Refunds by piece share instead of bytes (Qodo `feeaf5d4`), receiver re-asks under the limit, an enforced 20-device cap, the sweep gap, and a total per device.
```

---

## 1. #87's description (replace the body)

```markdown
Closes #20

**PRD ID:** S1.5 · **Threat IDs:** T-D3

**T-D3 isn't fully closed: see #NN.** Qodo's review of `d660eb6` found that refunds give back a share of pieces rather than bytes, so a stalled tail can allow more than 3 files' worth (`feeaf5d4`, open). The stopping rule for this PR's review rounds fired, so it's in #NN rather than fixed here.

## What it does
- **Per device and per file:** one budget of 3 files' worth of bytes in any 60 s, whether asked whole or in pieces (`askBytes`, `askLimiter` in `web/check.js`). Every ask is charged at least one piece. A `need` with a list is at most once a second.
- **The table can't fill for real:** at most 1000 counters per device (2 per print), and a table of 20000 (20 devices, S7). A live counter is never pushed out. Only devices in the room are counted (`inRoom`, `Object.hasOwn`).
- **Refunds:** `allow` returns a token, and a send that didn't leave is given back (`undo`). `sendFile` resolves with `{ sent, of }` and marks failures the same way, so relay-dropped frames are refunded and an unknown error isn't.
- **Leaving:** counters are kept when a device leaves, until their window ends.
- **Dropped before counting:** size-0 prints and `need`s with an empty list.

## Review rounds
| Round | Review | Findings | Fixed in |
|---|---|---|---|
| 0 | Qodo, `8ddeaf8` | `cbfbb88c` recovered transfers still fail; `7e800d93` busy rooms can reset a limit | `3076458`, `2c28d31` |
| 1 | Blind review of that fix | 10, two caused by the fix (a full table refuses everyone; undo refunds the wrong send) | `f8949f3`, `64e2044` |
| 2 | Second blind review, of round 1's diff | 5, two caused by that diff (zero-byte files; free table fill) | `917e4a2`, `d660eb6` |
| Final | Qodo, `d660eb6`, `review_complete: true` | `cbfbb88c` and `7e800d93` re-attributed `implemented`; new `feeaf5d4`, open, see #NN | not fixed (stopping rule) |

The evidence for each round is in `evidence/day-07/part2/` on PR #86.

## Tested
`npm test` at `d660eb6`, exit 0: 94/94 unit tests; two-browser test 76 PASS, 0 FAIL, direct then relay. Highlights:
```
PASS 20 wants for one photo made A send it 2 times (at least 1, at most 3)
PASS 20 needs listing every piece made A send the file 1 times (at least 1, at most 3)
PASS B left and came back, then 20 wants made A send photo-0.jpg 0 more times (none: its counter was kept)
PASS send to a silent device gave up and told the sender (after 10.0 s)
PASS a third device asked once and still got photo-0.jpg byte-identical
```
- **Tests came first in each round:** each `test:` commit fails without the `fix:` after it.
- **The leave-and-rejoin check bites:** with "clear counters on leave" put back, it fails ("3 more times").

## Notes
- The silent-device step in the two-browser test now puts the silent device in A's presence, since asks from devices outside the room aren't served.
- `#20`'s acceptance was updated to match: bytes instead of whole/pieces, and counters kept on leave.
```

---

## 4. Push the evidence (toolbox worktree, `qodo-toolbox`, PR #86)
- **Unpushed commits:** `bd07325`, `c29dc6f`, `6f692f7`, `18d4265`, `f25145f`, `9c6861e`, `085699c` and `df305a8`, plus a commit with these drafts and the final-state update.
- **Effect:** this pushes to PR #86, so Qodo reviews its new head. Under the policy it's an evidence-only push, so anything that review raises is recorded as unresolved.
- **Left out:** the untracked `evidence/explore-61/`, which isn't mine. It won't be committed.

---

## Posted (approved in one go)
1. **Follow-up ticket filed: [#88](https://github.com/jtbinith/qodo-hack-2026/issues/88)**, "S1.5 follow-ups: byte-exact refunds, receiver re-asks, the room's device cap, and limits per device", labels `type: security`, `area: network` (`raw/33`).
2. **#20's body** replaced with the new acceptance, with `#NN` → `#88` (`raw/32`).
3. **#87's description** replaced, with `#NN` → `#88`, updated at 2026-11-19T00:58:51Z (`raw/31`).
   - `gh pr edit` failed on a GitHub deprecation error (Projects classic), so I used the REST API (`PATCH pulls/87`).

Both #20 and #87 match the drafts, apart from a trailing blank line that GitHub adds.

4. **Evidence pushed:** `qodo-toolbox`, in the same step as this note.
