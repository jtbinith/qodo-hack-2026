# Day 7: Qodo's findings on PR #86 at `3498511` (investigation, before any change)

## Review state
- **Branch:** pulled; already up to date at `3498511`. The PR head (`raw/18-pr-86-meta.json`) and local `HEAD` are both `34985117a5557c48b58e5a660b1e3ad97bc1eb8c`.
- **Latest review:** run `2022925`, status `completed`, `commit_sha` **`3498511`**. That **names the head**. (`raw/19-findings.json`, `raw/20-findings-extended.json`.)
- **Caveat:** that same run reports **`review_complete: false`**. Its status is `completed`, but the run doesn't claim it covered everything, so this read isn't proof the PR is clean.
- **Runs recorded:** `2022925` at `3498511`, `2022880` at `4aac32c`, `2022774` at `cc26e6e` and `2022639` at `b41eb40`, all completed. No truncation was reported.

**[V]** means verified in the code or by running it; **[A]** means an assumption or inference.

| # | Finding | Category / level | Status | Raised at |
|---|---|---|---|---|
| 1 | `69808cf1…` *Private code reaches Qodo without consent* | Security / remediation_recommended | `implemented` (closed) | `b41eb40` |
| 2 | `24cbc11a-6164-4419-90f6-b35c0aca0f55` *Valid joins briefly show a failure message* | Correctness / remediation_recommended | **`pending` (open)** | `4aac32c` |

**Finding 1** is closed: Qodo's re-review at `cc26e6e` re-attributed it (see `01-resolution.md`). No action is needed.

## Finding 2: Valid joins briefly show a failure message

**Where:** `evidence/day-06/05-revised-tickets.md:29`, revised #68's acceptance:
> When only one device taps, or its tap is rejected (…), then after the 2 s window it shows "No match. Tap again together". **The device that tapped starts its own timer**, so this works even when the time keeper drops the tap without a `nomatch`.

[V] The same sentence is in GitHub issue #68 as it stands now (`raw/24-issue-68.json`, updated 2026-11-18T02:06:17Z). The text hasn't changed between `4aac32c`, where it was flagged, and `3498511` (`git diff 4aac32c 3498511` doesn't touch the file).

**What it claims:** a timer on the tapping device fires at 2 s, but the time keeper can decide on a valid join *later than 2 s*. A second tap near the end of the window would get "No match" on the first device before "Joined" arrives.

### The timing, from `web/net.js` at `3498511` (`raw/21-read-net-at-3498511.json`) [V]
- `WINDOW = 2000`: two pushes this close in time can pair (`net.js:10`). `matchPushes` pairs when `|p.t − q.t| ≤ windowMs` (`layout.js:133`).
- **`onPush`** (`net.js:92-102`):
  - It starts a burst when none is running (`burstStart`, `:98`).
  - It clears the pending timer and re-arms `resolve` after `wait = min(900, max(0, DEADLINE − (now − burstStart)))` (`:99-101`).
  - So `resolve` runs **up to 900 ms after the latest push**, and no later than `DEADLINE = 2500` ms after the burst started (`:84`).
- **`resolve`** (`net.js:103-121`):
  - It pairs the batch, then emits `joined` for each new join (`:107-111`).
  - A push with no partner whose `t` is still inside the window goes back into `pushes` (`:115-117`), and `resolve` is re-armed **400 ms** later with `burstStart` restarted (`:120`). So a lone tap is re-checked at about 0.9, 1.3, 1.7 and 2.1 s.
  - `nomatch` is sent only once the push is older than `WINDOW` (`:118`).
- **Putting it together:** a second tap at 1.9 s arrives after the re-check at 1.7 s restarted the burst. `onPush` then waits the full 900 ms, so `resolve` pairs the two taps at about **2.8 s**.

### Timing check with the real code [V]
`evidence/day-07/timing-check.mjs` runs the real `web/net.js` (`onPush`, `resolve`, `WINDOW`, `DEADLINE`) and the real `matchPushes` as the time keeper, with a fake Supabase channel. It leaves out network delay. The output is in `raw/23-timing-check.txt`, run at `3498511` with Node v25.2.1:

```
== second tap at 1.9 s
0.00 s  A taps its right strip (the time keeper's own tap)
1.90 s  B's tap on its left strip reaches the time keeper
2.00 s  (a 2 s timer started by A's own tap would fire here)
2.80 s  joined {"a":"A","edgeA":"R","alongA":300,"b":"B","edgeB":"L","alongB":300}

== second tap at 0.5 s
0.50 s  B's tap … reaches the time keeper
1.40 s  joined …
2.00 s  (a 2 s timer … would fire here)

== lone tap
2.00 s  (a 2 s timer … would fire here)
2.10 s  nomatch {"dev":"A"}
```

- **A second tap at 1.9 s:** `joined` fires at **2.80 s**, 0.8 s *after* a 2 s local timer would have shown "No match". **The finding holds.** [V]
- **A lone tap:** the time keeper's own `nomatch` comes at 2.10 s, also after 2 s. [V]
- [A] With network delay added (tap → time keeper → device), the real gap is larger. The latest possible `joined` is about `WINDOW` + 900 ms after the first tap, plus two network legs.

### Why the timer is in the ticket at all [V]
The time keeper can drop a tap silently: `onPush` returns without a reply when `validPush` fails (`net.js:93`), for example when the tap's position is off the screen just as the phone rotates (`:88-90`). With no `nomatch` coming, a device-side fallback is still needed. Only its timing is wrong.

### Assessment
The finding is valid, in scope (it's the revised #68 text in this PR) and worth correcting. It's a correction to the ticket, not to code: no code under `web/` builds this timer yet.

## Proposed corrections (pick the scope; nothing is changed yet)
| # | Correction | Recommend? |
|---|---|---|
| A | **Edit `05-revised-tickets.md:29`:** the tapping device waits for the time keeper's answer. It shows "No match" only if neither `joined` nor `nomatch` has arrived by a named limit that covers the time keeper's latest decision: `WINDOW` + the 900 ms settle wait + a network margin, for example 4 s. A `nomatch` from the time keeper shows straight away, and a `joined` cancels the timer. | Yes |
| B | **Make "Joined" always win:** a `joined` that arrives after a local "No match" replaces it with "Joined with…". This belongs to A. | Yes, with A |
| C | **Add to "How to test" (`:50`):** a second tap at 1.9 s shows "Joined", never "No match", and a silently dropped tap shows "No match" after the limit. | Yes |
| D | **Name the 900 ms and 400 ms waits** in `net.js:100,120` (Rule 3), so the ticket's limit can be defined from them. This is a code change, so it's better as a note in the ticket than done in this docs PR. | As a note only |
| E | **Make the same edit to GitHub issue #68.** | Needs your go |
| F | **Resolver write.** None proposed: after a push, the next review should re-attribute finding 2 by itself. | No |

**Not changed:** finding 1 (already `implemented`).
