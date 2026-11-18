# Day 7 part 2: the fixes for PR #87 (local, not pushed)

**Your choice:** **2a** for finding 2 and **1a** for finding 1 (`01-findings.md`).

Both fixes are local commits on `s1-5-rate-limit-resends` in the #87 worktree (`<c5>`), on top of `8ddeaf8`. They're **not pushed**:

| Commit | What |
|---|---|
| `3076458` | **test (first, failing):** 6 new tests in `tests/asks.test.mjs`, 2 in `tests/peers.test.mjs`. At that commit 8 of 80 failed: the 6 limiter tests and the 2 `sendFile` tests. |
| `2c28d31` | **fix:** `web/check.js`, `web/peers.js`, `web/index.html` |

Diff stat: `raw/13-diff-stat.txt`. **[V]** means verified by a test or run; **[A]** means an assumption.

## Finding 2 (`7e800d93`, Security): never push out a live counter (2a)

**What changed** (`web/check.js`):
- New constant `LIMITS.askRecordsPerDevice: 100` (Rule 3).
- `askLimiter.allow()` no longer evicts the oldest counter. For a new (device, file):
  - if the table (`askRecords`) or that device's share (`askRecordsPerDevice`) is full, stale counters are dropped first;
  - if it's **still** full, the request is **refused**. A live counter is never pushed out.
- A per-device count is kept and cleared by `forget()`.

**Tests (`tests/asks.test.mjs`) [V]:**
- 4,000 live pairs from 40 ids don't reset B's limit.
- One device is capped at 100 counters, and only its own new files are refused.
- A full table of live counters refuses a new key, then allows it once one goes stale.
- The existing tests still pass, including "the counters are capped in number" and "stale counters are dropped first".

**Rerun of the reproduction [V]:**

| | At `8ddeaf8` (`raw/07`) | After the fix (`raw/10`) |
|---|---|---|
| 4 ids × 500 thumbnails | allowed 2,000; B then got 3 more sends | capped at 400 (100 per id); B got 0 |
| 40 more ids | B got 3 more sends | table full at 2,000 live counters; B got **0** |
| Total sends of B's file in 7 s | **15** | **3**, the limit held |

**Trade-off [A]:** with about 20 or more device ids, each holding 100 live counters, the table can be filled, and an honest device's *first* ask for a new file is then refused until a counter goes stale (at most 60 s). That's a Rule 3 tension, but it now takes 20× the ids it did, and fake ids are the open #21/#24.

## Finding 1 (`cbfbb88c`, Reliability): give back a send that moved nothing (1a)

**What changed:**
- **`web/peers.js` `sendFile`:** counts the pieces that actually left (a `sendFrame` that resolved `true`). On failure, it sets `e.sent` on the error before rethrowing.
- **`web/check.js`:** new `askLimiter.undo(dev, fid, kind)`. It removes the latest whole-send time, or restores the previous piece time.
- **`web/index.html`:** both the `want` and `need` handlers call `asks.undo(…)` in `.catch` when `!e?.sent`. A send that moved any bytes stays counted, so stalling halfway can't buy a refund.

**Tests [V]:**
- `tests/asks.test.mjs`: undo gives back a whole send, undo gives back a piece ask, and undo on a missing counter does nothing.
- `tests/peers.test.mjs`: a send that gives up with nothing sent has `sent: 0`, and one that stalls after the first piece has `sent: 1`.

**Rerun of the reproduction [V]** (`raw/09-repro-f1-after-fix.txt`): with the same link model, a link that recovers at 20–55 s now delivers on the first ask after recovery (20.1 s … 55.1 s), with **0 asks refused**. That holds even with the first ask 300 ms slower. Before the fix, those cases delivered at 60.2 s or gave up at 63.0 s (`raw/06`).

**Safety [A]:**
- A device that withholds its key can now make the holder retry sends that time out. Each one costs only a timer and up to `HOLD` held frames for that one peer (`peers.js:16,150-160`), and nothing is sent.
- On a direct link, the first piece always goes out unless the buffer is already full from other sends.

## Checks run
- **Unit tests:** `npm run test:unit` in `<c5>`, **80/80 pass** (72 before plus the 8 new ones) (`raw/12`).
- **Two-browser test:** `npm run test:browsers`, direct then relay (Rule 5, since this touches transfers). **74 PASS, 0 FAIL** (`raw/11`). That includes #87's own attack checks: 20 wants and 20 needs make A send at most 3 times, in both runs.
- **Syntax:** `node --check` on `check.js` and `peers.js`.

## Outcomes
| Finding | Label | Outcome |
|---|---|---|
| `7e800d93` Busy rooms can reset a device's send limit | Real | **Fixed locally** (2a): reproduced, then checked by test and rerun. Under the policy it's *fixed* only once Qodo's re-review of the pushed head re-attributes it. |
| `cbfbb88c` Recovered transfers still fail | Real | **Fixed locally** (1a): reproduced, then checked by test and rerun. The same applies: it needs the push and the re-review. |

**Not done:**
- No push.
- No Resolver write: no `mark-implemented` and no `dismiss`.
- Docs not updated: `docs/ARCHITECTURE.md`, `TESTING.md` and `THREAT-MODEL.md` describe S1.5 but not the new per-device cap or the refund. [A] Worth a line before merge. Not done, because it's outside the scope you chose.
