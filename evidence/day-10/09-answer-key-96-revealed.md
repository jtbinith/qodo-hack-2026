# #96 answer key and predictions, written 22 Nov ~17:20Z, before #96 is labelled

## What a correct fix needs (answer key)
K1. Keep join results (joined / retry / nomatch) from a device that isn't this device's time keeper yet, like #95's earlyLayouts, and use them when electLeader makes that device the time keeper. Today fromLeader (web/net.js:197) drops them.
K2. Results from a device that never becomes the time keeper are still dropped (acceptance 2). A held result from anyone else is cleared on any change of time keeper.
K3. Held results are bounded (one per device or a small cap) and only kept from devices in the room: no growth from a flood (Rule 3).
K4. A held result is checked again when used (validJoined / validRetry / validNoMatch, isValidJoins against who is here now), as #95 does for layouts.
K5. Order: if the device's own NO_MATCH_AFTER timer fires before it hears the change, it has already shown "No match". A full fix holds the timer's nomatch while a result from the next time keeper is held, or replaces the toast. A weaker fix only covers "result arrives, then leader change".
K6. The ticket's three test gaps: a #95 unit test that fails without #95's fix; a test that breaks if the "sender must be in the room" check on kept layouts goes; a unit test for "the new time keeper leaves straight away".
K7. Forgery of `from` stays out of scope (#24), but a review may flag it (Low).

## Predictions
1. Wisdom passes #96 (no claim proven wrong). 75%.
2. Qodo's local review sends the agent at least 1 local fix round before the first push. 55%.
3. Qodo's first PR review finds at least 1 High or Medium. 70%. Total PR review rounds: 2.
4. The blind review reports at least 1 finding. 85%. It reproduces a High or Medium: 35%. Most likely: Lows or an unreproduced Medium about K5 (the timer order).
5. Final: NOT DONE. 55%. Most likely gate: a problem in one of today's new gates on their first real run (35%), then a High or Medium still open after 3 rounds (20%). DONE: 45%.
6. If DONE, the fix covers K1–K4 but not K5. 60%.
