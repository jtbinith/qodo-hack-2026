**NOT DONE.** The factory run stopped and needs you. 1 High or Medium findings from Qodo's local review still open after 2 local rounds: High: Settled sheets still force downloads. Nothing was pushed.

**Assumptions the agent made** (the ticket didn't say):
From `.agent/wisdom.md`: all 12 claims held. The code matched each one (the `files` and `owner` filter, `thumb:` keys in `incoming`, share only inside the tap, no flag before this change). Its open questions, decided:
1. **Does tap-to-save set the flag?** Yes, when its download starts or its share sheet succeeds. Its share failures stay ignored, as before.
2. **Does the share batch skip photos already handed over?** Yes. An empty tap says "Nothing new to save", or "Nothing to save yet · N still arriving". The button is always visible.
3. **A tap during a running share sheet or download batch?** It's ignored, with the toast "Still saving".
4. **When is the flag set?** Per photo, when its own download starts. A download that throws isn't marked and is retried next tap. If the page closes partway, nothing persists anyway: files live only in memory.
5. **Does "still arriving" include re-fetches after a damaged copy?** Yes: that re-fetch is in `incoming`. Transfers that gave up after 20 asks aren't counted.
6. The handed-over flag is a `Set` inside Save all, not a field on the print, so `announce()` can't send it to other devices.
7. I added a `chore:` commit with an empty module before the `test:` commit, so Red is an assertion failure and the `test:` commit still changes only `tests/`.
8. (Blind review round) **`SHARE_TIMEOUT` = 60 s.** That's long enough to pick an app in the share sheet, and Save all can't stay locked for the whole session. When it runs out, the lock is freed with no toast, so someone still in the sheet isn't interrupted. If the sheet really is still open, the next tap's `navigator.share` is refused, and the existing "Tap Save all again to download" path takes over. A share that finishes after the timeout still marks its photos as handed over. The lock belongs to the tap that set it, so a late finish can't free a newer tap's batch.
9. (Blind review round) The blind review marked both findings Low. The skill's gate says to flag Lows, not fix them. But `.agent/review.md` lists both as blocking, since the runner saw each repro fail, and asks for a fix or a rebuttal. Both are real and small, so I fixed them test-first. The "Downloading N" toast still counts a photo that gets skipped because it was tapped during the batch. That's cosmetic and I left it.

Agent runs: 10 · review rounds: 1/3 · instruction rounds: 1/3 · retries: 0/5 · PR #130

On PR #130: comment `/agent <what to change>` for another round (up to 3), or `/agent retry` if the runner itself was wrong (up to 5).

<details><summary>Agent report</summary>

# Report: #72 F13 · Save all

**Ticket:** #72 F13 · Save all, https://github.com/jtbinith/qodo-hack-2026/issues/72
**Acceptance (from the ticket):** Given 12 received photos on a phone, when "Save all" is tapped, then the share sheet opens once with all 12. On a laptop they download. Edge: real-device check on iPhone and Android stays unticked for the user.
**Branch:** `agent/72-save-all`. There's no PR yet: the runner pushes and opens it.
**Commits:** `18f5662` chore (empty module) → `013fb70` test → `18ba6fb` feat, then the review rounds below, last `84db23e` test → `fa38632` fix (round 4, the owner's hung-share decision).

## What changed
- `web/saveall.js` (new): `saveBatch()` picks what to hand over. `createSaveAll()` handles the share sheet or download choice, cancel and failure, download mode, pacing (`DOWNLOAD_GAP` = 400 ms), the busy guard and the handed-over set. `REVOKE_AFTER` = 10 s for object URLs.
- `web/index.html`: a Save all button in the bar, wired to `navigator.canShare` / `navigator.share` and a `downloadFile()` helper that revokes its URL. `save()` now records what it handed over and uses the same helper.
- `tests/saveall.test.mjs` (new, 15 tests). `tests/two-browser.mjs`: Save all on a laptop downloads all 5 received files byte-identical, and a second tap downloads nothing.
- `docs/TESTING.md`: a new F13 Unit, System row (exists). `docs/ARCHITECTURE.md`: a new component row. `docs/THREAT-MODEL.md`: unchanged, since F13 has no threat rows.

## Criteria
| Criterion | Result |
|---|---|
| 12 received: the share sheet opens once with all 12 | Pass (unit test, fake share sheet, called inside the tap) |
| On a laptop they download | Pass (unit test, and the two-browser test direct and relay: 5 files byte-identical) |
| The share sheet can't take the batch: download all, videos included | Pass (unit test) |
| Only fully received photos; "· N still arriving" counts only full photos on their way | Pass (unit tests) |
| A cancel does nothing; another failure shows a toast and the next tap downloads everything not yet handed over | Pass (unit tests) |
| "Shared N" only after success; "Downloading N"; downloads paced, no zip | Pass (unit tests) |
| Download mode lasts one batch | Pass (unit test) |
| Edge: real iPhone and Android | **Unticked, needs the user** |

## Red / Tested
- Red: on the stub, `node --test tests/saveall.test.mjs` gave 15 of 15 failing, all `AssertionError`.
- Green: `tests/saveall.test.mjs` 15 of 15 pass. `npm run test:unit` exited 0. `node tests/two-browser.mjs` and `node tests/two-browser.mjs --relay`: every check PASS, including both Save all checks.

## Assumptions
From `.agent/wisdom.md`: all 12 claims held. The code matched each one (the `files` and `owner` filter, `thumb:` keys in `incoming`, share only inside the tap, no flag before this change). Its open questions, decided:
1. **Does tap-to-save set the flag?** Yes, when its download starts or its share sheet succeeds. Its share failures stay ignored, as before.
2. **Does the share batch skip photos already handed over?** Yes. An empty tap says "Nothing new to save", or "Nothing to save yet · N still arriving". The button is always visible.
3. **A tap during a running share sheet or download batch?** It's ignored, with the toast "Still saving".
4. **When is the flag set?** Per photo, when its own download starts. A download that throws isn't marked and is retried next tap. If the page closes partway, nothing persists anyway: files live only in memory.
5. **Does "still arriving" include re-fetches after a damaged copy?** Yes: that re-fetch is in `incoming`. Transfers that gave up after 20 asks aren't counted.
6. The handed-over flag is a `Set` inside Save all, not a field on the print, so `announce()` can't send it to other devices.
7. I added a `chore:` commit with an empty module before the `test:` commit, so Red is an assertion failure and the `test:` commit still changes only `tests/`.
8. (Blind review round) **`SHARE_TIMEOUT` = 60 s.** That's long enough to pick an app in the share sheet, and Save all can't stay locked for the whole session. When it runs out, the lock is freed with no toast, so someone still in the sheet isn't interrupted. If the sheet really is still open, the next tap's `navigator.share` is refused, and the existing "Tap Save all again to download" path takes over. A share that finishes after the timeout still marks its photos as handed over. The lock belongs to the tap that set it, so a late finish can't free a newer tap's batch.
9. (Blind review round) The blind review marked both findings Low. The skill's gate says to flag Lows, not fix them. But `.agent/review.md` lists both as blocking, since the runner saw each repro fail, and asks for a fix or a rebuttal. Both are real and small, so I fixed them test-first. The "Downloading N" toast still counts a photo that gets skipped because it was tapped during the batch. That's cosmetic and I left it.

## Blind review of PR #130 at 18ba6fb

| Finding | Type | Severity | Valid? (evidence) | What you did |
|---|---|---|---|---|
| A photo saved by tapping it during a Save all download batch is downloaded twice (`web/saveall.js:53`) | 🐞 Bug (blind review) | Low | Valid. The repro, copied into `tests/saveall.test.mjs`, failed on `18ba6fb` with `[ 'r0.jpg', 'r1.jpg', 'r2.jpg', 'r2.jpg' ]`. This branch introduced it, and it breaks the ticket's "nothing is downloaded twice". | `45727cd` test, `344dcab` fix: when a photo's turn comes, `handed` is read again after the wait |
| A share sheet promise that never settles locks Save all for the session (`web/saveall.js:41`) | 🐞 Bug (blind review) | Low | Valid. The repro failed on `18ba6fb`: no `SHARE_TIMEOUT`, and the next tap only got "Still saving". This branch introduced it, and it goes against Rule 3 (no uncapped wait, limits are named constants). | `d55556b` test, `29aef42` fix: named `SHARE_TIMEOUT`, and the lock belongs to the tap that set it |

**Not checked by the review:** the real iPhone and Android share sheet. It's still unticked and needs the user.

**Low findings for jtbinith:** both of the blind review's Lows are fixed (above), so none are left open from this round. Neither Low came from Qodo.

**Tests after the fixes:** `node --test tests/saveall.test.mjs` gave 18 of 18 passing. `npm test` exited 0. `node tests/two-browser.mjs` and `node tests/two-browser.mjs --relay`, rerun on their own: every check PASS, including both Save all checks.

**Gate met: not yet confirmed.** Nothing High or Medium is open as far as I know, and every check passed on `29aef42`. But there's no completed Qodo review or blind review of the new head yet, and the runner checks the gate from those.

**Was the ticket wrong?** No. These were gaps in my implementation: the ticket's "nothing is downloaded twice" and Rule 3 already covered both.

**Proposed skill change** (its own PR, for jtbinith to approve): in `.claude/skills/work-ticket/SKILL.md` step 7, after "Don't fix Lows: flag them.", add: "A blind review finding whose repro the runner saw fail is listed to fix in `.agent/review.md` whatever its severity: fix it test-first, or show with evidence why it's wrong." Today the skill's gate and the runner's blind-review instructions disagree on Lows.

## Qodo's local review of 29aef42

| Finding | Type | Severity | Valid? (evidence) | What you did |
|---|---|---|---|---|
| Timed-out shares can duplicate photos (`web/saveall.js:46`) | Not given in `.agent/review.md` | Medium | Valid. On `07c7630`'s parent the new tests failed: after the timeout, the retry shared `[ 'r0.jpg', 'r1.jpg', 'r9.jpg' ]` (expected `[ 'r9.jpg' ]`), and a second share sheet opened with the pending photos (`2 !== 1`). The branch introduced it (`29aef42`). It breaks the ticket's "nothing is handed over twice". | `ed193b8` test, `07c7630` fix: a `pending` set of pids in a share that hasn't settled. Later taps skip them, download mode included. They leave it when the share settles: handed over on success, available again on a cancel or failure. A tap with only pending photos says "Still saving". |
| Synchronous share errors show no guidance (`web/saveall.js:44`) | Not given in `.agent/review.md` | Medium | Valid. A `share` that throws at once left the last toast `undefined` and set no download mode. The branch introduced it (`29aef42` moved `share` out of the `try`). It breaks the owner's "any other failure shows a toast, the next tap downloads". | `cdb1353` test, `deb7bd2` fix: `(async () => share(list))()` still calls `share` synchronously inside the tap (iOS rule), and a throw becomes a rejection on the normal failure path. |

**Assumption (this round):** if a share never settles, the photos it holds stay out of Save all for the rest of the session. They can still be saved one at a time by tapping them. I chose that over offering them again, because offering them again is exactly the duplicate Qodo flagged. The `SHARE_TIMEOUT` test that used to expect the same 2 photos to be shared again now expects only a photo that arrived since.

**Not checked by the review:** the real iPhone and Android share sheet. It's still unticked and needs the user.

**Low findings for jtbinith:** none in this round.

**Tests:** `node --test tests/saveall.test.mjs` gave 21 of 21 passing. `npm test` on `deb7bd2` exited 0. `node tests/two-browser.mjs` and `node tests/two-browser.mjs --relay`, rerun on their own: every check PASS, including `went relay (encrypted)` and both Save all checks.

**Gate met: no, not yet.** Both Mediums are fixed and every check passed on `deb7bd2`, but no completed Qodo review covers `deb7bd2` yet. This is fix round 2 (the blind review was round 1), and Qodo's findings came from that round's fix (`29aef42`). If the next review again finds problems caused by these fixes, the loop has stalled under the gate.

**Was the ticket wrong?** No. Both were gaps in my `SHARE_TIMEOUT` fix.

**Proposed skill change** (its own PR, for jtbinith to approve): in `.claude/skills/work-ticket/SKILL.md` step 4, after "If the change makes something fail that used to wait or succeed, check every caller that assumed it succeeded.", add: "A timeout that frees a lock doesn't end the work it was waiting on: keep whatever that work holds out of the next attempt until it really settles. A call moved out of a `try` keeps its error handling." Both Mediums came from that one fix.

## Qodo's local review of deb7bd2 (round 3): NOT DONE, the loop has stalled

| Finding | Type | Severity | Valid? (evidence) | What you did |
|---|---|---|---|---|
| Hung share keeps its photos out of Save all (`web/saveall.js:37`) | Not given in `.agent/review.md` | Medium | Valid. Shown by a test that passes now: `after SHARE_TIMEOUT, photos still in the pending share are not shared or downloaded again` (`tests/saveall.test.mjs:246`) asserts exactly this: one share call, then "Still saving", and download mode skips the pending photos. `node --test tests/saveall.test.mjs` on `deb7bd2`: 21 of 21 pass. The branch introduced it (`07c7630`, round 2's fix). | **Not fixed.** The gate's stall condition is met: two reviews in a row found problems caused by the last fix (round 2's Mediums came from `29aef42`, this one comes from `07c7630`). A fix would also be round 3. |

**Why I stopped instead of fixing:** this Medium and round 2's "Timed-out shares can duplicate photos" are two sides of one choice. Once `SHARE_TIMEOUT` passes, the page can't tell a share sheet that is still open (it may still succeed) from one that never will (WebKit). Offering its photos again can hand them over twice. Not offering them keeps them out of Save all. Any fix trades one Medium for the other, so it needs jtbinith's decision, not another round.

**Options for jtbinith** (pick one; it goes in the ticket's Decisions):
1. **Recommended: ask first.** After `SHARE_TIMEOUT`, a tap that finds only photos held by the hung share shows "The share sheet didn't finish. Tap Save all again to download them". The next tap downloads them (download mode, as after a failure), and they leave `pending`. A duplicate can then only happen when the person asks for it, after being told.
2. **Give them back at the timeout.** At `SHARE_TIMEOUT` they leave `pending` and are offered again. If the old share finishes late, they may be handed over twice. Round 2's test would change to allow that.
3. **Keep the current behaviour** and dismiss this finding in Qodo. The photos can still be saved one at a time by tapping them.

**Low findings for jtbinith:** none in this round.

**Tests:** nothing changed in this round. `node --test tests/saveall.test.mjs` on `deb7bd2`: 21 of 21 pass. `npm test` (direct and relay) passed on `deb7bd2` in round 2. It wasn't rerun because no code changed.

**Gate met: no.** One valid Medium is open and is waiting for jtbinith's decision, and the fix loop has stalled (two reviews in a row found problems caused by the last fix). Needed: jtbinith picks option 1, 2 or 3 above, then `/agent retry` on #72.

**Was the ticket wrong?** Not wrong, but incomplete. Its Decisions don't cover a share sheet that never settles, and both Mediums come from that gap.

**Proposed skill change** (its own PR, for jtbinith to approve), in `.claude/skills/work-ticket/SKILL.md` under **Quality gate**, after the stall bullet: "If a finding asks you to undo what an earlier finding's fix did, the two are one design question: stop, set out the options for jtbinith and don't fix either way."

## Round 4: jtbinith's decision on #130 (PR at 18ba6fb in `.agent/review.md`)

jtbinith's `/agent` comment picks option 1, "ask first", for the new Decision "A share sheet that never finishes". The comment is in `.agent/review.md`. Qodo's comment on `18ba6fb` lists no open findings. The Medium below came from my local review of `deb7bd2`.

| Finding | Type | Severity | Valid? (evidence) | What you did |
|---|---|---|---|---|
| Hung share keeps its photos out of Save all (`web/saveall.js:37`) | Not given in `.agent/review.md` | Medium | Valid (round 3). The owner has now decided how to fix it. Red on `deb7bd2` with the new test: `+ 'Still saving'` `- 'The share sheet didn’t finish. Tap Save all again to download them'` (`tests/saveall.test.mjs:285`) | `84db23e` test, `fa38632` fix: after `SHARE_TIMEOUT`, a tap with only the hung share's photos shows that toast and sets download mode. The next tap downloads them for one batch and drops them from `pending`. |
| Timed-out shares can duplicate photos (round 2) | Not given | Medium | Still fixed: nothing from the hung share is shared or downloaded until the person has been told and taps again. The asking tap opens no share sheet and starts no download (asserted). | Kept `07c7630`. The round 2 test now checks only that the hung share's photos aren't offered to a second share sheet and that download mode skips them before the ask. Its old "Still saving" line was the behaviour the owner replaced. |

**Tests:**
- Red: `node --test tests/saveall.test.mjs` on `84db23e` gave 22 pass, 1 fail. The new test failed with an `AssertionError`, as quoted above. The other new test ("before SHARE_TIMEOUT a tap still says "Still saving"") passes on both sides of the fix, because it guards behaviour that already worked.
- Green on `fa38632`: `node --test tests/saveall.test.mjs` gave 23 of 23 passing.
- `npm test` exited 0. I couldn't open its saved output, so I reran each browser pass on its own. `node tests/two-browser.mjs` and `node tests/two-browser.mjs --relay`: every check PASS, including `went relay (encrypted)`, `Save all downloaded … byte-identical ("Downloading 5")` and `a second Save all downloads nothing again`.

**Device check:** `.agent/scenario.json` is written, following `group-device-check/references/scenario.md`. Both that skill and the work-ticket skill's unattended paragraph about it exist only on `main`, not on this branch, so I read them with `git show main:…`. It uses 4 devices: phone (`"share": "works"`), laptop sender, phone (`"share": "fail-once"`) and laptop. Every expected text is copied from `.agent/ticket.md`, with only the numbers changed ("Downloading 10" becomes "Downloading 3"). There are no toast checks for "Shared …" or "Nothing new to save": the first is quoted in the ticket only with "· 2 still arriving", and the second isn't quoted at all. The scenario counts share sheet calls and downloads instead. The new Decision goes under `notChecked`, for two reasons: the stand-in has no share sheet that never settles, and the Decision isn't in `.agent/ticket.md` yet, so its text can't be quoted. The runner runs it after `npm test`. I haven't seen a result.

**About line 10's example (in the ticket):** noted. My copy, `.agent/ticket.md`, still says "Saved 10 · 2 still arriving" (line 14 there), because it was written before the correction. The code and tests already say "Shared …", as the Decision "When the message shows" requires, so nothing changed. The scenario doesn't use that example.

**Assumptions (this round):**
- "Finds only photos still held by that share" means no other photo is ready. If photos have arrived since, the tap shares or downloads only those, as before, and doesn't ask.
- When the ask has been shown and the hung share then settles before the next tap, there's nothing left to release. If it succeeded, its photos are already handed over and aren't downloaded again. Download mode stays on for that one tap, so photos that arrived since are downloaded, not shared. That matches what the toast just said.
- Photos leave `pending` when the downloading tap decides its batch, before its first await (Rule 3). A download that throws isn't handed over, and the next tap offers it again, as for any download.

**Low findings for jtbinith:** none.

**Gate met: no, not yet.** The open Medium is fixed as jtbinith decided, and `npm test` (direct and relay) passed on `fa38632`. But no completed Qodo review covers `fa38632` yet, and the device check hasn't run.

**Was the ticket wrong?** No. Its Decisions now cover the hung share.

**Proposed skill change** (its own PR, for jtbinith to approve): this branch's `.claude/skills/` comes from before `group-device-check` existed, and the unattended paragraph about `.agent/scenario.json` is only on `main`. In `.claude/skills/work-ticket/SKILL.md`, under **Unattended runs**, add: "The skills you follow are the ones on `main`. If your branch is older, read them with `git show main:.claude/skills/<name>/SKILL.md`." Otherwise the runner should rebase the branch onto `main` before a round.

## Unsure / for jtbinith
- I couldn't check the real share sheet on a phone. iOS may refuse very large batches in `canShare`. That falls back to downloads, as decided.
- The two-browser test turns off `navigator.canShare` on B to force the laptop path. Headless Chromium on Linux doesn't have it anyway.
- **Proposed AGENTS.md change** (its own PR, for jtbinith to approve): add this row to the Layout table: ``| `web/saveall.js` | Save all (F13): which received photos to hand over, the share sheet once or paced downloads |``.

</details>
