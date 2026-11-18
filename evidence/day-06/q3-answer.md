# Q3: Open tickets to look at before building

I read the open backlog of `jtbinith/qodo-hack-2026` with Qodo: 40 open issues (`17-list-issues-open.json`). I read 13 ticket bodies in full (`18-issue-<n>.json`): #17, #20, #32, #61, #68, #69, #70, #71, #72, #73, #78, #79, #82. The code citations are at **`96f0bbe`** (`main`) and come from the reads in Q1 and Q2 (`04`–`16`).

**[V]** means verified in the code or ticket text; **[A]** means an assumption or inference.

The five below are in issue-number order, not ranked. Which ones to take forward is your call.

## #68 C15 · Join screens by tapping join tabs
**Why look closer:** the ticket replaces the orb push, but the layout maths needs the "along the edge" position that a push carries and a tab tap doesn't.
- [V] A join's offset is `alongA - alongB` (`web/layout.js:11`). `matchPushes` copies `along` from each push into the join (`layout.js:138`), and `validPush` requires a finite `along` inside the screen (`web/net.js:88-90`). The planned tab is described as "(edge, time)" (`docs/ARCHITECTURE.md:77`).
- [A] So the ticket needs a new rule for how two screens line up along their shared edge, for example centred or aligned to a corner. The ticket doesn't say which.
- [V] The ticket wants "Joined with <name>, on your right" and **Undo**. Today the only join feedback is a toast on `joined` (`web/index.html:351`). Nothing in `index.html` handles `retry` or `nomatch`, and no undo path exists: `addJoins` only adds or replaces joins (`layout.js:48-62`).
- [V] The only join tests drive `net.push` directly (`tests/two-browser.mjs:53,287`). `layout.js` and `net.js` have no unit tests (`docs/TESTING.md:53`, "to write").

## #69 C16 · Mini-map to arrange screens
**Why look closer:** it adds a two-person "propose and accept" join, but today only the time keeper decides and announces joins.
- [V] Only the time keeper handles pushes and creates joins (`web/net.js:93,103-111`), and devices accept a layout only from it (`net.js:130`).
- [V] The time keeper is whoever claims the earliest `joinedAt` (`net.js:31-32`). `validPeerMeta` only checks that it's a number (`web/check.js:111`), and #16 (S1.1) is still open.
- [A] A device placing its own tile, plus Sam's Accept, means new message types, and Rule 1 requires a check for each. They would also have to go through, or bypass, a time keeper that a stranger can claim.
- [V] #61 (C5) is open: a device can drop the new time keeper's layout when the old one leaves (`net.js:130`). [A] An accepted join could be lost the same way.

## #70 F11 · Joined screens receive by themselves
**Why look closer:** today a photo is fetched only when someone drags it onto, or taps it on, a receiver's own screen. This ticket also depends on join concepts and data that don't exist yet.
- [V] The only first-time fetch trigger is `dropped(p)`, gated on `onMyScreen(p)` (`web/index.html:251-261`). It's called on pointer-up, on `dropcheck` and on a tap (`index.html:297,305,330`).
- [V] "Until the join has settled (accepted, or 10 s with no Undo)": joins are applied the moment the time keeper solves them (`net.js:108-111`), and there's no accept or Undo state. [A] That makes this ticket depend on #68 and #69.
- [V] "Prints from before the join need a tap": a print stores no creation or join time (`index.html:136-138`). [A] So there's no way yet to tell which prints came before the join.
- [V] Auto-fetching across a group runs into `LIMITS.incoming` = 20 for the whole room (`check.js:10`, `index.html:161,256`). Making that limit per device is #17, still open.
- [A] Every device in the group would fetch from the same owner. On the relay that's one page-wide queue with 45 ms between sends (`web/peers.js:15,140-147`).
- [V] The ticket's limit is 30 MB, but #71 refers to "the 20 MB limit from F11". The two tickets disagree.

## #71 F12 · Share with everyone (and the same collision in #73 N4a · Send without dragging)
**Why look closer:** both tickets send a photo to devices that never asked for it. Today a receiver keeps only the pieces it asked for, and only within its own group.
- [V] Pieces are kept only for a transfer the receiver opened itself with `expect`, and only from the device it named (`web/index.html:158-164,188-189`). Anything else is dropped ("so a stranger can't make us store data", `index.html:159`).
- [A] A tray (#71) or "Send to…" (#73) that pushes the file would be silently dropped. These tickets need a receiver-side trigger, which means a new message and a check for it (Rule 1). Otherwise the room loses that protection.
- [V] "Joined or not": prints outside my group aren't visible (`index.html:85`), and `screenAt` only searches my group (`index.html:243-245`). So a device in another group can't fetch through the normal drop path.
- [V] The 20 MB / 30 MB mismatch with #70 is noted above.

## #78 C12 · Ask another holder and keep pieces when the link changes
**Why look closer:** this ticket mixes pieces from different holders, but #79 says per-piece hashes are needed before that. Both changes also cut across how a transfer is tied to one sender.
- [V] A transfer is tied to one source: `need` goes to `inc.from` (`web/index.html:237`), and pieces from any other device are dropped (`index.html:189`).
- [V] A change of piece size throws away what has arrived (`index.html:190`). The sender picks the size once, when the send starts (`web/peers.js:192`). A resend uses the receiver's `cs` only when specific pieces are listed (`index.html:185-186`).
- [V] #79 (R1) says per-piece hashes are "needed before pieces can come from several holders" and is blocked by #24. Today a bad file is caught only by the whole-file SHA-256 (`index.html:213`), and then only `lastSource` is distrusted (`index.html:214-215`).
- [A] With pieces from both A and B, a mismatch can't show which holder sent the bad piece. The fix would distrust the wrong device or a good one.
- [A] So building #78 before #79 conflicts with what #79 says must come first.

## Read but not shortlisted
#61 and #20 fit the current code as written: both name the exact lines and the test step. #17, #32, #72 and #82 didn't collide with anything I checked in Q1 or Q2.

## Not read
I didn't read the other 27 open ticket bodies, so they aren't covered.
