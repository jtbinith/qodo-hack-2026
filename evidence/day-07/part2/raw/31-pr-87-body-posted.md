Closes #20

**PRD ID:** S1.5 · **Threat IDs:** T-D3

**T-D3 isn't fully closed: see #88.** Qodo's review of `d660eb6` found that refunds give back a share of pieces rather than bytes, so a stalled tail can allow more than 3 files' worth (`feeaf5d4`, open). The stopping rule for this PR's review rounds fired, so it's in #88 rather than fixed here.

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
| Final | Qodo, `d660eb6`, `review_complete: true` | `cbfbb88c` and `7e800d93` re-attributed `implemented`; new `feeaf5d4`, open, see #88 | not fixed (stopping rule) |

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

