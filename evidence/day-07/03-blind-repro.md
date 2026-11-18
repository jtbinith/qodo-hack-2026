# Day 7: blind review findings 1–3, reproduced, with proposed fixes

**Inputs:**
- The blind review is in `blind/blind-review.md`, committed as received (`4516d87`).
- Its scripts import `./src/`, a copy of the source that isn't in the folder. Its `/tmp/blind-work/src/` copies of `net.js`, `layout.js` and `check.js` are byte-identical to `web/` at HEAD.
- I re-ran the scripts against the real `web/` at `4516d87`, from a scratch copy with `src` linked to `web/` (the committed folder is unchanged). Output: `raw/26-blind-repro-on-real-web.txt`.
- `web/net.js` and `web/layout.js` haven't changed since `c9c8235`.

**[V]** means verified in the code or by running it; **[A]** means an assumption or inference.

## Blind 2: the 4 s limit is too short [V]

**Code:**
- `onPush` re-arms `resolve` for `min(900, DEADLINE − (now − burstStart))` (`web/net.js:98-101`).
- `resolve` puts lone taps still inside their window back into the queue and **resets `burstStart`** each time (`net.js:115-120`).
- So any later tap, from any device, can hold the decision back by up to `DEADLINE` = 2500 ms (`net.js:84`) from the last re-queue.
- **The bound:** a partner tap arrives by `WINDOW` = 2000 ms (`net.js:10`), so the decision comes by about `WINDOW + DEADLINE` = 4.5 s after the first tap, plus network delay. [A] That bound is my reading of the code. The grid search below reaches 4.45 s.

**Run:**

| Script | Result |
|---|---|
| `worst.mjs` | latest `joined` **4450 ms** (`{ c0: 250, tp: 1950, g: 500 }`) |
| `run.mjs` "busy room" | `joined@4200` |
| `run.mjs` "C spamming" | lone tap `nomatch@3300` (2100 when the room is quiet) |

**Effect:** with the 4 s limit our fix added, a busy room shows "No match" first, then flips to "Joined". The "about 2.9 s" in our text holds only in a quiet room.

**Proposed fixes (pick one):**
- **2a. Ticket wording (recommended).** The device's limit covers `WINDOW + DEADLINE` + a network margin (for example 5.5 s), named and derived from those two constants. The sentence giving the worst case changes from "about 2.9 s" to "up to about 4.5 s in a busy room (2.9 s in a quiet one)".
  - [A] Cost: a tap dropped with no reply gets "No match" later. A normal lone tap still gets the time keeper's own `nomatch` at 2.1–4.5 s.
- **2b. Fix the cause in `net.js`.** Don't reset `burstStart` when re-queuing (`:120`), so the decision is due within a fixed time of the first tap. This is a code change: it contradicts "pipeline unchanged", needs its own timing test, and changes how busy bursts batch.
- **2c. The time keeper acknowledges each tap.** The device then shows "Waiting…", and its timer only covers taps that were never acknowledged. This adds a message type and its check (Rule 1). Larger.

## Blind 3: a `retry` sends no `nomatch`, so "No match" later covers "Try again" [V]

**Code:**
- A contested batch returns `{ joins: [], retry: [all devices], unmatched: [] }` (`web/layout.js:170-171`).
- With `unmatched` empty, `resolve` sends `retry` (`net.js:113`) but no `nomatch` for any of those taps (`net.js:116-119`).
- **Run:** `run.mjs` "one laptop tap + bystander C" gives only `retry@900 {"devs":["L","A","B","C"]}`, and no `nomatch` follows.
- Our text cancels the timer only on `joined` or `nomatch`. So "Couldn't tell who to join. Try again" at about 0.9 s is overwritten by "No match" when the device's own timer fires.
- **Also [V]:** `joined`, `nomatch` and `retry` are broadcast to the whole room (`net.js:111,113,118`). Unless a result has to name this device to cancel its timer, another pair's `joined` cancels mine.

**Proposed fix (3a, recommended):** the device's timer is cancelled only by a result that names it:
- a `joined` whose `a` or `b` is this device;
- a `nomatch` whose `dev` is this device;
- a `retry` whose `devs` includes it.

"Try again" stays until the next tap. It's never replaced by the device's own "No match". A `joined` that names this device still always wins.

## Blind 1: the time-keeper check can be forged [V]

**Code:**
- The layout check trusts `payload.from` (`web/net.js:124,130`). That field is set by the sender, on a broadcast channel anyone with the room code can use (`net.js:8,17`).
- `joined`, `retry` and `nomatch` carry no `from` at all (`net.js:111,113,118`), so the planned check also needs a payload change.
- #85 already says this for Undo: "Until #24, room messages don't prove who sent them… Full protection waits on #24" (`raw/27-issue-85.json`; `05-revised-tickets.md:123`).

**Proposed fixes (pick one):**
- **1a. Say so in #68 (recommended).**
  - The check stops honest mistakes and stale time keepers, but not a device forging `from: <timeKeeperId>`.
  - Real protection waits on #24 (signed room messages), as #85 says.
  - The results gain a `from` field so the check is possible at all.
  - The test proves the rule, not T-S7 protection, and the PR says so.
- **1b. Split it out.** Move "results only from the time keeper" out of #68 into #24's scope.
- **1c. Block #68 on #24.**

## Blind 4–10
Each is now in #68's Edge cases or Open questions in `evidence/day-06/05-revised-tickets.md`. See `04-blind-vs-qodo.md` for where each one went.
