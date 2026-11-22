# Report: #61

**Ticket:** #61 C5 · A device can miss the layout when the time keeper leaves
https://github.com/jtbinith/qodo-hack-2026/issues/61

**Acceptance (from the ticket):**
- When the time keeper changes, every device ends up with the new time keeper's layout, whatever order they hear about it in.
- A layout from a device that isn't the time keeper is still dropped (Rule 1).

**Branch:** `agent/61-a-device-can-miss-the-layout-when-the-ti`. Not pushed (unattended run). Commits:
- `07f6758 test: a device that hears late that the time keeper left still gets the new time keeper's layout (#61)` (tests/ only)
- `9450869 fix: a device that hears late that the time keeper left still gets its layout (#61)`

## Cause
Confirmed as the ticket guessed. A device that hasn't heard that the time keeper left drops the new time keeper's layout (`payload.from !== s.leader`). The new time keeper sends again only on its own presence updates, so the late device keeps stale joins. In the red run, C kept C–D and B–D while B and D had B–C and B–D.

## Fix (`web/net.js`)
The latest layout from each device in the room that wasn't used is kept (one per device, checked with `isValidJoins` on arrival). When the time keeper changes to another device, the layout kept from it is checked again against who is here now and used only if it passes. A layout from the current time keeper clears everything kept, and so does any change of time keeper. Entries for devices that have left are dropped on each presence update.

## Results
| Criterion | Result |
|---|---|
| Every device ends with the new time keeper's layout, any order | PASS: unit test, and two-browser direct and relay (C heard last, D heard first, both hold B's exact joins) |
| A layout from a non-time keeper is still dropped | PASS: two unit tests (not used while someone else is time keeper; a kept one older than the time keeper's own is never used; a kept one naming a departed device is never used). Both checked against mutations of the fix |
| Edge: opposite orders | PASS (above) |
| Edge: new time keeper leaves straight away | PASS: C takes over, C and D agree (`[]`), direct and relay |
| Must not break: `npm run test:browsers` direct and relay | PASS, every check |

Red and Tested output are in `.agent/pr-body.md`.

**One `npm test` stalled.** An `npm test` on the final code stopped in the unit step right after `tests/net.test.mjs` had printed all of its passes, with no failure, and didn't move for over 10 minutes. I couldn't look at processes or stop it from here. `net.test.mjs` and `peers.test.mjs` each pass and exit when run alone. After that, `npm run test:unit` (132/132), `node tests/two-browser.mjs` and `node tests/two-browser.mjs --relay` all passed on the final commit. An earlier full `npm test` (before a one-line `typeof` guard) passed all three steps. The stalled run was later stopped at its time limit. A fresh `npm test` on the final commit (9450869) then passed in full, exit code 0: 132/132 unit tests and every check PASS in both `went direct` and `went relay (encrypted)` runs, including both new checks. So the stall wasn't reproduced. It looks like the machine, not this change.

## Docs updated
- `docs/ARCHITECTURE.md`: the `layout` row of the message table now says how layouts from other devices are kept and used.
- `docs/TESTING.md`: new C5 hand-over row (exists).
- `docs/THREAT-MODEL.md`: unchanged. T-S5 isn't closed by this change (a device can still claim the role with an early `joinedAt`). It isn't made worse either: a kept layout is used only once its sender is already the time keeper.

## Assumptions
- (Review) Asks go only when nothing usable was kept, and never on a first election, as Qodo suggested, so a normal hand-over adds no messages. `LAYOUT_GAP` = 1 s is my choice. It matches how often a follower pings once it has settled (every 2 s), so it adds little traffic.
- (Review) `layoutask` is a new room message, not a device message, so it goes through Supabase in the clear. It carries only two device ids, which Rule 2 allows in the clear.
- "Dropped" in Rule 1 means "never used". A layout from a device that isn't the time keeper is now kept, unused, after it passes `isValidJoins`, and is checked again before it is ever used. If jtbinith reads Rule 1 as "not even kept", the other fix is for the new time keeper to send its layout again, or for a device to ask for it after a change of time keeper. That second option is a new message type, so it needs a check.
- The two-browser scenario reuses the four-device room at the end of the test rather than opening a new one, to keep run time down. B and C get a presence-hold init script, which does nothing unless the test sets `__holdPresence`.
- The ticket asked for C's presence to be delayed. I delayed the app's handling of presence updates in the page (Supabase still delivers them), which is what a device hearing late looks like to `net.js`.
- The extra wait in the late-guest step (C must see that A has gone) went in the fix commit, as the ticket says, so the test commit doesn't hide the bug.
- Out of scope, and left alone: `joined`/`retry`/`nomatch` results from a time keeper that a device hasn't recognised yet are still dropped. In the race, C's layout ends up right, but C's toast can show "No match" for a push that did join. Possible follow-up ticket (C15): keep results the same way, or let a layout that adds a join naming this device's latest push count as its answer.

## Review of PR #95 (step 7, Qodo's review at 9450869)
New commits, not pushed:
- `ac33fe3 test: a late layout from the old time keeper doesn't leave a device with stale joins (Qodo on #95)` (tests/ only)
- `b5c2dd1 fix: a device with no usable kept layout asks the new time keeper for its layout (Qodo on #95)`

**The finding is valid.** I reproduced Qodo's exact order in `tests/net.test.mjs` (`a late layout from the old time keeper doesn’t leave a device with stale joins`). L leaves. A hears first, takes over and joins A–B, and C keeps that layout. Then L's layout from before it left reaches C, which still counts L as time keeper, so C uses it and clears what it kept from A. Then C hears that L left. Before the fix, C ended with `[]` while A held the A–B join (the Red output is in `.agent/pr-body.md`).

**Fix.** Qodo recommended a layout request, and that's what I built. When a device's time keeper changes to another device and nothing usable was kept, it sends `layoutask { from, to }`. The time keeper named in `to` answers only if the ask passes `validLayoutAsk` (`web/check.js`) and `from` is in the room (Rule 1). It answers by sending its layout to the room, at most once every `LAYOUT_GAP` = 1 s (Rule 3: named, capped). An ask that arrives while an answer is waiting is covered by it, because that answer goes out after the ask. The answer timer is cleared on `leave()`. A first election sends no ask, because the time keeper already sends its layout when it hears a device arrive. The "keep the latest layout from each device" mechanism stays: it gives the right layout at once in the common case, and the ask covers the case it can't.

If the new time keeper hasn't yet heard that it took over when the ask arrives, it ignores the ask. That's safe: when it does hear, its own `electLeader` sends its layout, and the asker, which already counts it as time keeper, uses that layout.

**Tests.** There are 3 new unit tests: Qodo's order; only the named time keeper answers and malformed asks are dropped (6 bad shapes, a non-time keeper, the wrong `to`); a 2 s flood of asks gets 2–4 answers, at least 1 s apart, with one after the last ask. All 3 failed on assertions before the fix. On b5c2dd1 one full `npm test` passed, exit code 0: 135/135 unit tests, and every two-browser check passed direct and relay.

**What the review didn't check.** Qodo's review didn't cover whether the two-browser scenario really forces the race. It does: C's presence is held back in the page, and the check prints `C still counted A as time keeper: true`. The review also didn't check the second edge case (the new time keeper leaves straight away). That one has its own passing two-browser check.

**Was the ticket wrong?** No. Its likely cause was right. It didn't foresee a late layout from the old time keeper, which is the order Qodo found.

### Gate report
| Finding | Type | Severity | Valid? (evidence) | What you did |
|---|---|---|---|---|
| Late devices can lose the new layout (`web/net.js:160`) | 🐞 Bug | Medium | Valid: the unit test failed at 9450869 with `C asked A and holds its layout`, `[]` vs A's A–B join | Fixed test first (ac33fe3, b5c2dd1). The new `layoutask` is checked, and its answers are capped at one every `LAYOUT_GAP`. `npm test` passes, direct and relay |

**Low findings for jtbinith:** none.

**Gate met: no, not yet.** The one Medium is fixed and `npm test` passes on b5c2dd1, direct and relay. But Qodo's latest completed review covers 9450869, not the new head. The gate needs a complete Qodo review of b5c2dd1 with no High or Medium open. The runner checks that after it pushes.

## Review of PR #95, round 2 (step 7, Qodo's review at b5c2dd1)
New commits, not pushed:
- `9e49474 test: a lost layout ask or answer is asked for again, a capped number of times (Qodo on #95)` (tests/ only)
- `9f613bc fix: a device asks the new time keeper for its layout again until it arrives, a capped number of times (Qodo on #95)` (web/net.js, docs/ARCHITECTURE.md)
- `e620c50 docs: list the layout ask retry tests in the C5 row (Qodo on #95)`

**The finding is valid.** I set up the same late-layout order as round 1 and then dropped one message in the fake room server. When C's first `layoutask` was lost, C sent no second one (`asks: 1`). When A's answer was lost, A never answered again (`A answered again: false`). Either way C kept `[]` while A held the A–B join. When every ask is lost, C asks once and stops (`asks: 1`). The tests failed on these 3 assertions at b5c2dd1.

**Fix.** I built what Qodo recommended. When nothing usable was kept, the device starts `ask(leader, ASK_TRIES)`. It sends `layoutask` again after a jittered `ASK_EVERY` (2 s ±25 %, and never sooner than `LAYOUT_GAP`, so each retry can get a fresh answer from the time keeper). It keeps going until one of these happens:
- the time keeper's layout is accepted (in the `layout` handler)
- the time keeper changes (`electLeader` stops it before anything else)
- the device leaves
- it has sent `ASK_TRIES` = 5 asks

Both new limits are named constants (Rule 3). The time keeper's limit of one answer per `LAYOUT_GAP` is unchanged. The jitter uses `Math.random`, which Rule 2 allows for things that aren't secret. One timer per device and a fixed cap mean a device that never answers costs at most 5 small messages and holds up no one.

**Tests.** There are 4 new unit tests: a lost ask is sent again; a lost answer is asked for again; asking stops once the layout arrives (1 ask in 20 s); with every ask lost, C sends 3–6 asks at least 1 s apart and none in the next 30 s. The first two and the last failed on assertions before the fix. The "stops" test passed before the fix, as it should, because it guards against a retry that never stops. One full `npm test` on 9f613bc+e620c50 passed: 139/139 unit tests, and every two-browser check PASS direct (`went direct`) and relay (`went relay (encrypted)`), including both C5 hand-over checks.

**What the review didn't check.** Whether giving up after 5 asks is acceptable. If all 5 asks or answers are lost (about 10 s of dropped room messages), the device keeps stale joins until the time keeper's next presence update or join. I chose to cap it rather than ask forever (Rule 3: nothing waits forever, work is capped). jtbinith may prefer no cap while the time keeper stays the same.

**Was the ticket wrong?** No. Message loss on the room server is outside what the ticket described, and the ticket's cause was right.

### Gate report (round 2)
| Finding | Type | Severity | Valid? (evidence) | What you did |
|---|---|---|---|---|
| A dropped request leaves stale joins in place (`web/net.js:49`) | 🐞 Bug | Medium | Valid: at b5c2dd1, `asks: 1` (lost ask not resent), `A answered again: false` (lost answer not asked for again), `asks: 1` (no retry when nothing answers) | Fixed test first (9e49474, 9f613bc). It asks again every jittered `ASK_EVERY`, at most `ASK_TRIES` times, and stops on the layout, a new time keeper or leaving. `npm test` passes, direct and relay |
| Late devices can lose the new layout (round 1) | 🐞 Bug | Medium | Resolved by Qodo at b5c2dd1 | Nothing further |

**Low findings for jtbinith:** none.

**Gate met: no, not yet.** The one open Medium is fixed and `npm test` passes, direct and relay, on the new head. But Qodo's latest completed review covers b5c2dd1, not e620c50. The gate needs a complete Qodo review of the new head with no High or Medium open. The runner checks that after it pushes. Stall check: this is fix round 2. The new finding is about the round-1 fix's message, but it isn't a problem that fix *caused*: a single ask was always open to message loss. If a third review finds a problem in the retry, the loop has stalled under the skill's rule.

## Proposed rule or skill changes (need jtbinith)
- AGENTS.md, Rule 3 (round 2): the list of `web/net.js` limits should also name `ASK_EVERY` and `ASK_TRIES`: "`MAX_BATCH`, `PER_DEV`, `DEADLINE`, `NO_MATCH_AFTER`, `LAYOUT_GAP`, `ASK_EVERY` and `ASK_TRIES` in `web/net.js`".
- AGENTS.md, Rule 3, **Breaks it** (round 2, reviewer context): "A request sent once over the room server with no retry, when its answer is what puts the device right (#95: one `layoutask`, lost, left stale joins)." Both Qodo findings on #95 came from the same assumption, that room messages arrive, and arrive in order. Rule 3 talks about slow devices but not about lost or reordered room messages.
- AGENTS.md, Rule 3 (named limits): add `LAYOUT_GAP` to the list of `web/net.js` constants: "`MAX_BATCH`, `PER_DEV`, `DEADLINE`, `NO_MATCH_AFTER` and `LAYOUT_GAP` in `web/net.js`". It's a new named limit that the rule's list doesn't name yet, and I may not change AGENTS.md in this run.
- No new rule for the finding itself. Its cause is already Rule 3's "a choice read again after an `await`" idea, applied to messages: the follower acted on arrival order, which another device's delay controls. Proposed reviewer context, for Rule 3's **Breaks it** list: "A device that trusts arrival order between messages from different devices (#95: a late layout from the old time keeper replaced the new one's)."

- Skill, step 3 (Unattended runs): saving a patch with `git diff > .agent/…` was refused, so checking a test red after writing the fix meant removing the fix by hand. Proposed wording: "A test added after the fix is written still goes in the `test:` commit. To see it fail, set the fix aside with `git diff > .agent/fix.patch` and `git checkout web/`, run the test, commit it, then `git apply .agent/fix.patch`." That needs those three commands allowed in unattended runs.
- Skill, Unattended runs: a foreground `npm test` longer than 10 minutes is moved to the background and can't be stopped or inspected. Proposed wording: "If `npm test` is moved to the background or stalls, run `npm run test:unit`, `node tests/two-browser.mjs` and `node tests/two-browser.mjs --relay` one at a time and report all three."

No comments from anyone other than jtbinith were read (the ticket came from `.agent/ticket.md`).
