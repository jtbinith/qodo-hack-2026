# Day 8 answer key (written before the build and before any review)

Task: #68 slice on branch join-results-from-time-keeper, base e85a662.
(1) joined/retry/nomatch carry `from` and are accepted only from the time keeper.
(2) the tapping device's own no-match timer: limit derived from WINDOW + DEADLINE + margin,
    cancelled only by a result naming this device; joined always wins; "Try again" never
    replaced by "No match".
(3) the page shows "Joined with <name>, on your right", "No match. Tap again together",
    "Couldn't tell who to join. Try again".
Out: strip UI, along mapping, overlap refusal (open question 6), Undo (#85).

## What counts as caught
A finding (Qodo or blind) catches a prediction if it names the same code path AND the same
failure (inputs -> wrong result). Naming the area alone is not a catch.

## Predictions: what the build will get wrong
P1. Two taps in a row leave two timers. The first one fires "No match" while the second tap
    is still pending (timer not restarted or not cleared per tap).
P2. Toast fades after 2.4 s (index.html:65) so "Try again stays until the next tap" isn't met,
    or the shared toast lets a later "No match" overwrite "Try again".
P3. The time keeper's own results never pass the new check on itself: it gets them by local
    emit (net.js:111,113,118), broadcast has self:false. Either the leader's own messages are
    dropped, or the check is put only on the broadcast path (correct) but the leader's timer
    is never cancelled.
P4. Results from a time keeper that just changed are dropped (s.leader updates on presence
    sync, results can arrive before or after) -> a valid "Joined" lost, "No match" shown.
P5. "on your right" side is wrong for device b (uses edgeA for both, or inverts).
P6. The other device's name is missing when it left or isn't in peers yet ("undefined").
P7. The no-match limit is a bare number (e.g. 5500), not derived from WINDOW and DEADLINE;
    DEADLINE lives inside joinRoom (net.js:84) so it must be moved/exported.
P8. Timer not cleared on leave (s.leave) -> a toast or callback after leaving.
P9. A test that would pass with the feature removed (vacuous), or the two-browser test not
    updated for the new messages.

## Predictions: what the control shows (review without context vs with)
C1. Without context Qodo flags that `from` can be forged (a security finding). With the
    ticket and decisions attached it does not raise it as a new bug (it's deferred to #24).
C2. With context, at least one finding cites a ticket acceptance line the bare run doesn't.
C3. Neither Qodo run catches P2 (toast fade) because it needs the CSS/timeout in index.html.
