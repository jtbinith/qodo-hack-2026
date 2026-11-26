# The factory's first use of group-device-check: #72 (Save all), 26 Nov

**What happened.** I posted an `/agent` instruction on PR #130 to build #72's new Decision ("ask first" for a share sheet that never finishes) and to write `.agent/scenario.json`. The runner (main at `ef88ee2`, after #148):
1. ran the agent (agent run 10) and then `npm test`, which passed on `fa38632`;
2. **ran the device check itself**, in the same throwaway container as `npm test`, on the agent's own scenario (4 devices: phone (works), laptop, phone (fail-once), laptop; 39 steps). Before the run, the guard checked every expected text against #72's quotes as GitHub had them at 12:51;
3. proved all 5 `test:` commits fail on their own;
4. had Qodo review the unpushed commits locally;
5. **stopped**, with nothing pushed (`stop-comment.md`).

**Why this table doesn't count as the result.** The agent wrote its scenario from `.agent/ticket.md` as saved on 23 Nov. The runner hadn't refreshed it, so it lacked the new Decision and today's correction to line 10. The guard read the live ticket, but the scenario came from a stale copy. Only the retry's table, on a new head written from the current ticket, goes in the post.

**Why it stopped.** Qodo's local review found a High in the agent's new code, "Settled sheets still force downloads" (`local-review-findings.json`; the file also lists the earlier Medium, but the gate counted only the High as open). The runner stopped at once, "still open after 2 local rounds", because #72 had already used its 2 local rounds on 23 Nov and an owner round didn't reset the count. So the agent never got a round for it. Both runner gaps (the stale `ticket.md` and the counter) are fixed test first in the next runner PR.

**A review and the skill's check give different evidence.** The device check passed every point it could simulate. Qodo still found a High in a case the stand-in share sheet can't produce: a sheet that hangs past the timeout and settles later. The agent's Not checked list had already named that exact gap (its first item).

## The runner's device check on `fa38632`: PASS, 12 of 12

| Step | Check | Device | Expected | Actual | Result |
|---|---|---|---|---|---|
| 10 | shared | 0 | 1 share sheet calls, the last with 3 files | 1 share sheet calls, the last with 3 files | pass |
| 12 | shared | 0 | 1 share sheet calls | 1 share sheet calls | pass |
| 14 | toast | 2 | Couldn't open the share sheet. Tap Save all again to download | Couldn’t open the share sheet. Tap Save all again to download | pass |
| 15 | downloads | 2 | 0 downloads, each byte-identical to what the sender holds | 0 downloads | pass |
| 17 | toast | 2 | Downloading 3 | Downloading 3 | pass |
| 19 | downloads | 2 | 3 downloads, each byte-identical to what the sender holds | 3 downloads, all byte-identical | pass |
| 20 | shared | 2 | 1 share sheet calls | 1 share sheet calls | pass |
| 25 | shared | 2 | 2 share sheet calls, the last with 1 files | 2 share sheet calls, the last with 1 files | pass |
| 26 | downloads | 2 | 0 downloads, each byte-identical to what the sender holds | 0 downloads | pass |
| 33 | toast | 3 | Downloading 3 | Downloading 3 | pass |
| 35 | downloads | 3 | 3 downloads, each byte-identical to what the sender holds | 3 downloads, all byte-identical | pass |
| 38 | downloads | 3 | 0 downloads, each byte-identical to what the sender holds | 0 downloads | pass |

## The agent's Not checked list

- A share sheet that never finishes (jtbinith's new Decision on #130, option 1): the stand-in share sheet has only "works" and "fail-once", no sheet that never settles, and the Decision's text isn't in .agent/ticket.md yet. Covered by tests/saveall.test.mjs only.
- A cancelled share sheet (AbortError) does nothing: the stand-in has no cancel mode.
- "Shared 10 · 2 still arriving" and "· N still arriving": the scenario can't hold a full photo partway through its transfer at the moment of a tap, so the arriving count can't be made non-zero on purpose.
- The share sheet can't take the batch (canShare false): download them all, videos included. Picked photos are numbered JPEG cards, never videos, and the stand-in takes every batch.
- Real iPhone and Android share sheets (the ticket's edge case): the stand-in shows the app's logic, not a real phone.

Files: `scenario.json` (the agent's), `device-check-facts.json` (the runner's; screenshots and downloads are left out), `events.log` (the runner's log for this run), `local-review-findings.json`, `stop-comment.md`.
