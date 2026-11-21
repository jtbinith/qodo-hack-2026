# Answer key, scored (key in 01-answer-key.md, sha256 1658b069… committed in 1306dc9 at 11:20:18Z, before the build)

Rule: a finding catches a prediction only if it names the same code path and the same failure.

| Prediction | Happened? | Caught by |
|---|---|---|
| P1 two taps leave two timers, the first fires early | No: the opposite bug (one timer, the first result cancels the second tap's wait) | not a catch by my rule; Q1 found the real one (Qodo A+B, blind) |
| P2 the toast fades, "Try again" doesn't stay | Yes | Qodo B (with context), blind. Not Qodo A |
| P3 the time keeper's own results fail the new check | No, built right (`announce`) | — |
| P4 results from a time keeper that just changed are dropped | Yes, but the layout is dropped too, so "No match" is true | Qodo A+B (Q2, partly right) |
| P5 wrong side for device b | No, built right | — |
| P6 the other device's name missing | No (falls back to "a device") | — |
| P7 the limit is a bare number | No, derived from WINDOW + DEADLINE + NET_MARGIN | — |
| P8 timer not cleared on leave | No, cleared | — |
| P9 a test that passes with the feature removed | Yes: the lone-push browser check passes on the own timer | blind only (B4) |
| C1 no-context Qodo flags forgeable `from` | **Wrong**: neither run flagged it | — |
| C2 with context, a finding cites the ticket | Held: Q4 ("stays until the next tap"), Q5 (strip tests) | — |
| C3 neither Qodo run catches P2 | **Wrong**: Qodo with context caught it | — |

Of my 9 build predictions, 3 happened. Qodo caught 2 of them (P4 without context, P2 only with context),
the blind reviewer 2 (P2, P9). Qodo also found 2 real bugs I didn't predict (Q1, Q3).
