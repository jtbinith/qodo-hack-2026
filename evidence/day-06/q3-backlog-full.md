# Q3: Every open ticket, read in full

I read all 40 open issues in `jtbinith/qodo-hack-2026` in full with Qodo `get-issue` (`raw/explore/18-issue-<n>.json`, list in `17-list-issues-open.json`). Code citations are at **`96f0bbe`** (`main`). New checks for this pass are `19-find-github.json`, `20`–`23`; the rest come from the reads in Q1 and Q2 (`04`–`16`).

**[V]** means verified in the code or ticket text; **[A]** means an assumption or inference. The verdicts are: **Fine** (fine as written), **Closer look** (needs a closer look), **Stale / done** (stale or already done) and **Overlaps** (overlaps another ticket).

| # | Ticket | Verdict | Reason (citation) |
|---|---|---|---|
| 84 | E5 · Reliability at scale (epic) | Fine | An epic. Its children #78, #79 and #80 match its scope. [V] |
| 83 | F18 · Drags stay clear of phone gestures | Overlaps #68, #81 | Same cause #68 gives for dropping the orb. Prints can sit at the very edge today: the 40 px rule is #81. [A] Whether anything starts within 24 px of the edge wasn't checked. |
| 82 | F17 · Click to pick up, click to drop | Overlaps #81, #73 | Esc puts the print back, like #81's `pointercancel`. Arrow keys overlap #73's keyboard path. Today dragging is pointer events only (`index.html:271-298`). [V] |
| 81 | F16 · A print can't get stuck | Stale / done (in part) | "Belongs to the screen its centre is on" already exists: `setWorld` re-anchors to the screen under the print's middle (`index.html:100`). [V] Snapping, the 40 px rule and Tidy up don't exist. [A] |
| 80 | R4 · Chaos options for the browser test | Fine | Correctly marked as blocked by #35. [V] |
| 79 | R1 · A hash for every piece | Overlaps #78, #24 | Blocked by #24, and needed before #78. Today only the whole-file SHA-256 is checked (`index.html:213`). [V] |
| 78 | C12 · Ask another holder, keep pieces | Closer look | Shortlisted. A transfer is tied to one source (`index.html:189,237`) and a change of piece size resets it (`index.html:190`). Ordering conflict with #79. [V] |
| 77 | S20 · Remember devices | Fine | Correctly marked as blocked by #24. [V] |
| 76 | S19 · Names are unique | Overlaps #16 | "The time keeper keeps the first", but the time keeper can be claimed by lying (`net.js:31-32`, `check.js:111`), which is #16. Names are only checked as strings up to 40 characters today (`check.js:111`). [V] |
| 75 | S18 · A reload is the same device | Overlaps #24 | #24 makes a device's id the hash of its public keys. A reload keeping its id means storing those keys, and both tickets touch the same id and key lifecycle. [A] |
| 74 | N4b · Screen readers, reduced motion | Overlaps #68, #69 | Needs spoken labels for join tabs and the mini-map, which only exist once #68 and #69 ship. [V] |
| 73 | N4a · Send without dragging | Closer look | Shortlisted with #71. A receiver drops pieces it didn't ask for (`index.html:158-164,188-189`). [V] It also needs #68 and #69 for focus on the join tab and mini-map. [V] |
| 72 | F13 · Save all | Overlaps #31 | Same share-sheet path as a single save (`index.html:309-310`). [V] |
| 71 | F12 · Share with everyone | Closer look | Shortlisted. It needs devices that never asked to receive the photo (`index.html:188-189`), and prints from other groups are invisible (`index.html:85,243-245`). It says "20 MB from F11" but #70 says 30 MB. [V] |
|  | ↳ checked | 18 Nov | **Checked 18 Nov:** #70's 30 MB is an example of a file that's too big, not a limit. #70 never states its 20 MB limit (PRD.md:222), so there's no contradiction, only a gap. |
| 70 | F11 · Joined screens receive by themselves | Closer look | Shortlisted. The only fetch trigger is a drop or tap on my own screen (`index.html:251-261`). There's no "settled" join state (`net.js:108-111`), prints carry no time (`index.html:136-138`), and incoming transfers are capped at 20 per room (`check.js:10`). [V] |
|  | ↳ checked | 18 Nov | **Checked 18 Nov:** incoming is held on each receiving device (index.html:79,161). The 20-transfer cap is per receiving device, shared by every sender in the room, which is what #17 means by room-wide. |
| 69 | C16 · Mini-map to arrange screens | Closer look | Shortlisted. Today only the time keeper decides joins (`net.js:93,103-111,130`), and the time keeper can be claimed by lying (#16). [V] |
| 68 | C15 · Join tabs | Closer look | Shortlisted. A tab gives no "along the edge" position, but the layout maths needs one (`layout.js:11,138`, `net.js:88-90`). There's no Undo path (`layout.js:48-62`). [V] |
| 61 | C5 · Missed layout when time keeper leaves | Fine | The likely cause cites the exact line (`net.js:130`) and the test step (`two-browser.mjs:288`), and both match the code. [V] It touches #69's acceptance flow. |
| 49 | Spike · Make the room feel nicer | Closer look | One sentence, no acceptance, and labelled `agent-needs-help`. Too vague to build. [V] |
| 37 | L1 · Choose a name | Fine | A decision spike; the Decision section is still empty. [V] |
| 36 | N2 · Test on real devices | Fine | A manual chore. [V] |
| 35 | N1 · Record timings | Fine | Not done: the two-browser test only times the silent-device and late-key steps (`two-browser.mjs:155-163,305,324`), not time to ready or transfer time direct and relay. [V] It blocks #80. |
| 34 | Q1 · Two-browser test on every PR | Fine | Not done: the only workflow is `.github/workflows/pages.yml`, and nothing in `.github/workflows/` runs the tests (`19-find-github.json`, `23-grep-workflows.json`). [V] |
| 33 | E4 · Quality and launch (epic) | Fine | Its scope (Q1, N1, N2, L1) matches #34, #35, #36 and #37. [V] |
| 31 | F3 · Save to the camera roll | Stale / done (in part) | A tap already opens `navigator.share` with the file (`index.html:309`). [V] Whether iOS and Android then offer "Save image" is a real-device check. [A] |
| 30 | F2 · Show progress and clear errors | Fine | The data exists (`inc.got`/`inc.n`, `index.html:190-193`). The damaged-copy toast doesn't name the device yet (`index.html:216`), which is what the ticket asks for. [V] |
| 29 | F1 · Drag several prints at once | Closer look | "All 20 arrive verified" is exactly the room-wide `LIMITS.incoming` = 20 (`check.js:10`). Thumbnails take slots in the same map (`index.html:170`), and when it's full `expect` fails with "Too many photos arriving" (`index.html:256`). [V] Overlaps #17. |
|  | ↳ checked | 18 Nov | **Checked 18 Nov:** incoming is held on each receiving device (index.html:79,161). The 20-transfer cap is per receiving device, shared by every sender in the room, which is what #17 means by room-wide. |
| 28 | E3 · Sharing (epic) | Stale / done | Its goal lists only F1, F2, F3 and F10. The newer sharing tickets #70, #71 and #72 (F11–F13) aren't named. [V] |
| 25 | S3 · Four matching words | Fine | Optional per the PR #50 update. It addresses the known key-swap gap. [V] |
| 24 | S2 · Devices can't impersonate each other | Closer look | A foundation ticket: #19, #77 and #79 are blocked by it, and #75 and #21 touch it. [V] Its scope grew in the PR #50 update (two key pairs, signed room messages), so its dependants should be rechecked against the new design. [A] |
| 23 | E2 · Private and safe (epic) | Stale / done (in part) | It lists S6 and S14, which appear built: `strip.js` (S6) and `thumbFits` (S14, `index.html:207`). [V] Whether they are fully done wasn't checked. [A] |
| 22 | N3 · Malformed messages of every type | Fine | Still accurate: the test sends malformed `print`, `want` and `need` (two variants) (`two-browser.mjs:182-185`), which is 4 cases across 3 types. [V] |
| 21 | S1.6 · Ignore setup from devices not in room | Fine | Matches the code: `sig` is checked only for `to === id` (`net.js:144`), and `onSignal` creates a link for any sender (`peers.js:71`). [V] It overlaps #24's id work. |
| 20 | S1.5 · Rate-limit resend requests | Fine | Matches the code: `want` and `need` are served without counting (`index.html:174-186`). The test plan is concrete. [V] |
| 19 | S1.4 · Clock replies only from time keeper | Fine | Correctly blocked by #24: a `pong` has no sender (`check.js:115`, `net.js:58-59`). [V] |
| 17 | S1.2 · Limits per device | Fine | Matches the code: `LIMITS.incoming` and `prints` are room-wide (`check.js:10-11`). [V] Overlaps #29 and #70. |
|  | ↳ checked | 18 Nov | **Checked 18 Nov:** incoming is held on each receiving device (index.html:79,161). The 20-transfer cap is per receiving device, shared by every sender in the room, which is what #17 means by room-wide. |
| 16 | S1.1 · Time keeper can't be chosen by lying | Fine | Matches the code (`net.js:31-32`, `check.js:111`). [V] Blocks the trust in #69 and #76. |
| 15 | E1 · One device can't take over (epic) | Fine | Its scope (S1, N3) matches #16–#22. [V] |

## Does the shortlist of 5 change?
The five still stand: #68, #69, #70, #71 (with #73) and #78. Reading every body confirmed each collision, and nothing I read removes one.

One new candidate is about as strong: **#29 F1 · Drag several prints at once.** Its acceptance of 20 prints at once is exactly the room-wide limit of 20 incoming transfers, and thumbnails take slots in the same map (`check.js:10`, `index.html:170,256`). [V] Keeping the list at five would mean swapping it for one of the five. Whether to swap is your call.

What else changed in this pass:
- **Context, not new candidates:** #24's scope grew (two key pairs, signed room messages), and #19, #77 and #79 are blocked by it. #28 E3 no longer lists all the sharing tickets.
- **Partly done already:** #81 (re-anchoring by centre) and #31 (tap opens the share sheet).
- **Q2 correction:** in Q2 I flagged `pong` accepting any sender. #19 already covers that and is blocked by #24, so it's known rather than new.
