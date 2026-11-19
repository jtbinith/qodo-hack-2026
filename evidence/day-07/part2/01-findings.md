# Day 7 part 2: Qodo's findings on PR #87 (report-only, before any change)

**Started:** 2026-11-18T22:53:30Z, before any finding was read (`raw/00-start-time.txt`). The write-back policy in `evidence/day-07/00-write-back-policy.md` applies.

**PR:** [jtbinith/qodo-hack-2026#87](https://github.com/jtbinith/qodo-hack-2026/pull/87), "fix: rate-limit resend requests per device (S1.5)", branch `s1-5-rate-limit-resends` → `main`.
- **Code:** read and run in the #87 worktree (`<c5>`, `~/qodo-hack-2026-c5`), which is **unchanged**.
- **Commits:** `f05ceef`, `edbb8e2` (tests), `85f104d` (the fix) and `8ddeaf8` (docs).

**Review state:**
- Run `2043787` started 22:51:11Z, so it was still `started` when I first read it (`raw/03`). I polled until it was `completed` (`raw/04`, `raw/05`).
- `commit_sha` is `8ddeaf8bf9b91805f5a5a84b2cca4036fe625408`. **That names head `8ddeaf8`**: the PR head (`raw/01-pr-87-meta.json`) and the worktree `HEAD` match.
- `review_complete: true`. No truncation was reported.

**Two findings, both open (`pending`):** one Reliability, one Security. Correctness and security come first here. Finding 2 is the security one; finding 1 is `action_required` and breaks a stated acceptance edge case, so it's next.

**Baseline:** #87's unit tests pass, 72/72 (`raw/08-c5-unit-tests.txt`). I didn't run the two-browser test.

**[V]** means verified in the code or by running it; **[A]** means an assumption or inference.

| # | Finding | Category / level | Label | Proposed outcome |
|---|---|---|---|---|
| 1 | `cbfbb88c` *Recovered transfers still fail* | Reliability / action_required | **Real** | Fix (1a) |
| 2 | `7e800d93` *Busy rooms can reset a device's send limit* | Security / remediation_recommended | **Real**, but the "busy room" route is unlikely; the attack route needs fake device ids | Fix (2a) or defer to #21/#24 |

Neither has an outcome yet: both are **reported without changes** until you choose.

---

## Finding 2: Busy rooms can reset a device's send limit (Security)

**Where:** `web/check.js:169-170` in `askLimiter.allow()`.

**The claim:** once all 2,000 counters are live, a new (device, file) evicts the oldest live counter. That throws away its send history inside the 60 s window, so that device can ask again at once, and it can keep doing so.

### Code [V]
- Counters are keyed `dev + ' ' + fid` (`check.js:162`).
- When a key is new and the map is full, stale counters go first (`:168`). Then `while (recs.size >= LIMITS.askRecords) recs.delete(recs.keys().next().value)` removes the oldest, **whether or not it's live** (`:169`). The next request for that key starts fresh (`r = { dev, whole: [], … }`, `:170`).
- The existing test "stale counters are dropped before a live one is pushed out" (`tests/asks.test.mjs`) only covers stale ones. It never fills the map with live counters.

### Reproduction [V]
`repro-f2.mjs` runs the real `askLimiter` with a fake clock (`raw/07-repro-f2.txt`):

```
t=0 s    B asks for big-photo 20 times: sent 3
t=5 s    2000 other whole asks allowed (4 ids x 500 thumbnails), counters kept: 2000
t=5 s    B asks for big-photo 20 times again: sent 3   <- limit reset, well inside B's 60 s window
t=6 s    2000 more thumbnail asks; B asks again: sent 3
t=7 s    2000 more thumbnail asks; B asks again: sent 3
control  without the other counters, B gets 3 sends of big-photo in the same minute
```

So B got 12 sends of a 3-per-minute file in 7 s. With files up to 200 MB (`LIMITS.fileBytes`), that's the T-D3 flood the limiter is meant to stop.

### Who can fill 2,000 live counters
- **An attacker [V] by reading:**
  - A counter needs a file the holder has: one it holds (`files`), or the thumbnail of a print it knows (`index.html:183-188`). Up to 500 prints (`LIMITS.prints`).
  - An attacker can announce its own prints, so the holder fetches their thumbnails.
  - It needs about 4 device ids, which are possible today: a link is made for any sender id on the signalling lane (`peers.js:70-71`, `net.js:144`). That's the open #21 (S1.6) and #24 (S2).
  - Each filler is one small thumbnail send, up to `LIMITS.thumbBytes` = 512 KB.
- **An honest "busy room" [A]:** it would need, for example, 20 devices each asking 100 files in one minute. That's unlikely, so Qodo's framing overstates the honest case, while the attack case is real.

**Label: real.** The mechanism is reproduced. The practical route needs several device ids, which depends on known gaps.

### Proposed fixes (pick one)
- **2a. Never evict a live counter (recommended).**
  - Cap the counters per device too, for example `askRecordsPerDevice`.
  - When a device reaches its own cap, refuse that device's new (device, file) keys until one goes stale. That only hurts the device doing it.
  - When the whole map is full of live counters, refuse new keys rather than evicting.
  - **Tests:** "2,000 live counters don't reset B's limit" and "one device can't fill the room's counters".
  - **[A] Trade-off:** with fake ids, the global cap could be filled to refuse honest devices' first asks (Rule 3). The per-device cap makes that need many more ids.
- **2b. Count per device as well as per file:** a total whole-send budget per device per window. The map then grows with devices, not files. This is a bigger change to the acceptance in #20.
- **2c. Defer** (`deferred`), with a reason on the PR: it needs several device ids, so it's tied to #21/#24. Add a test that documents the gap.

---

## Finding 1: Recovered transfers still fail (Reliability)

**Where:** `web/index.html:189`, and the same pattern for `want` at `:177`.

**The claim:** a whole-file ask is counted (`asks.allow`) before `sendFile` has sent anything, and a failed send doesn't give the allowance back. If the first 3 sends fail but the link recovers within the minute, the receiver's later asks are refused until the window ends. By then its retry budget can be used up.

### Code [V]
- `if (file && asks.allow(from, m.pid, 'whole')) peers.sendFile(…).catch((e) => gaveUp(…))` (`index.html:177`), and the same for `need` (`:188-189`).
- `allow()` records the time before the send (`check.js:172-173`), and nothing undoes it on failure.
- A relay send waits for the receiver's key and gives up after `SEND_TIMEOUT` = 10 s with nothing sent (`peers.js:18,150-160`).
- **The receiver:**
  - It asks once with `want` from `dropped()` (`index.html:261`).
  - Then it sends a `need` with `missing: null` (a whole send) each time a transfer has been quiet for 3 s, checked every 1.5 s.
  - It gives up after 20 asks with "A photo didn't arrive. Drag it again to retry" (`:231-240`).

### Reproduction [V], with one part modelled [A]
- `repro-f1.mjs` drives the real `askLimiter` and `askKind` with the receiver loop exactly as written at `:231-240`.
- [A] The link is modelled: no send succeeds until `recoverAt`, and a send waiting for a key times out after 10 s.
- Output in `raw/06-repro-f1.txt`:

```
need delay 100 ms, first want delay 100 ms
link recovers at | without the limit | with #87 (8ddeaf8)
   20 s          | photo at 20.1 s   | photo at 60.2 s  (asks refused: 17, counted sends that failed: 3)
   50 s          | photo at 50.1 s   | photo at 60.2 s

need delay 100 ms, first want delay 400 ms
   20 s          | photo at 20.1 s   | gave up at 63.0 s  (asks refused: 18, counted sends that failed: 3)
   55 s          | photo at 55.1 s   | gave up at 63.0 s
```

- **Effect:** after 3 failed sends, a link that recovers at 20 s delivers the photo only at **60.2 s**, on the receiver's 20th and last ask. That ask just clears the window.
- **If the first ask arrives 300 ms later than the later ones**, which relay pacing at 45 ms per frame (`peers.js:15`) could cause [A], the last ask is refused too. The receiver **gives up**.
- **Before #87,** the photo arrived on the first ask after recovery.
- This breaks #20's own edge case: "A real transfer that loses pieces on the relay still finishes" (issue #20, `docs/THREAT-MODEL.md` S1.5 row).

**Label: real.** The counting-before-sending and the 60 s stall are reproduced with the real limiter. The outright failure needs a small timing skew [A].

### Proposed fixes (pick one)
- **1a. Give the allowance back when nothing was sent (recommended).**
  - `allow()` returns a release (or adds `asks.undo(dev, fid, kind)`).
  - The `.catch` releases it only if the send failed before any piece left the device. For example, `sendFile` reports how many frames it sent, or the release runs on `SendTimeout` when the first frame never went out.
  - A send that moved bytes stays counted, so a device can't stall halfway, get a refund and repeat. That keeps T-D3 closed.
  - **Test:** 3 sends that fail with nothing sent, then a recovered link, deliver on the next ask.
- **1b. Count on the first piece sent, not on the ask.** The same idea, moved into `sendFile`. It needs a hook in `peers.js` and is wider.
- **1c. Give the receiver a longer retry budget** than `wholeWindow`. That's simpler but leaves a 60 s stall, and it changes the receiver's give-up rule (C12).

## What I did and didn't change
- **No code changed.** I added two reproduction scripts (`repro-f1.mjs`, `repro-f2.mjs`), run as `node <script> <c5>`, plus their outputs.
- **Raw outputs:** `raw/00`–`08`. No whoami. Paths are written as `<c5>` / `<home>`.
- **No Resolver writes.** I'm stopping here for your choice of scope.
