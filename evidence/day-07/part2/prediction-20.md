# My prediction for #20, written 2026-11-18T22:37:01Z before any build or review

#20's acceptance counts "a `need` with no list of pieces" as a whole-file send, capped at 3 per 60 s per device per file.
But the receiver's own re-ask timer (web/index.html:228-236 at 96f0bbe) sends `need` with missing = null whenever nothing
has arrived yet (inc.parts is null), about every 3 s (the timer checks every 1.5 s and re-asks once 3 s idle; web/index.html:229-239), up to 20 times. A slow or lossy start (relay drops the
first pieces) would hit the cap after 3 re-asks and the honest receiver gets locked out for 60 s, which breaks the edge case
"a real transfer that loses pieces on the relay still finishes". The ticket's claim "the receiver's own retries are
1.5–3 s apart, so they're never dropped" is only about piece lists, not null re-asks.

Check later: did the builder handle it? Did Qodo flag it? Did the blind reviewer?

## Added 2026-11-18T22:48:58Z, after reading the build (8ddeaf8), before any review
1. Confirmed in the code: askKind returns 'whole' for need with missing === null (web/check.js:146-147), and index.html:188-189
   counts it via asks.allow. So the honest receiver's null re-asks (index.html re-ask timer) are capped at 3/60 s with its first want.
   The build follows the ticket faithfully; the bug is in the ticket.
2. Test weakness: edbb8e2 changed the attack checks from === 3 to <= 3 (tests/two-browser.mjs). 0 sends also passes, so a fix that
   wrongly refused every resend would still pass those two checks (only the third-device check would catch a total refusal).
