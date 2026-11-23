# #21 answer key and predictions, written 23 Nov ~03:20Z, before #21 is labelled
The check of the fixed factory: a small, clean ticket after #96 found the factory's gaps.

## What a correct fix needs (answer key)
K1. A setup message (`desc`, `cand` or `pub`) from an id that isn't in the room never reaches `link(from)` in web/peers.js:70: no RTCPeerConnection is created, nothing is signalled back. Today `onSignal` calls `link(from)` first for every message (net.js:212 only checks the payload shape and `to`).
K2. Membership comes from presence (net.js `s.peers`), so peers.js needs to be told who is in the room (an `inRoom`-style check, as index.html:187 does for files), not decide it itself.
K3. The trap: a real device's first setup message can arrive before this device's presence sync lists it. Dropping it for good would break joining. A good fix holds or ignores it and relies on the re-offer/key reply, or checks again when presence arrives, and has a test for a late-presence device that still connects.
K4. Relayed frames (`data.r`) from unknown ids are also not decrypted or held (same rule).
K5. A unit test with the fake RTCPeerConnection counting connections: 0 for an unknown id, 1 for a known one.

## Predictions
1. Wisdom passes #21 (no claim proven wrong). 80%.
2. Qodo's local review finds at least 1 High or Medium before the first push. 50%.
3. Qodo's first PR review of the head is complete on the first try. 65%.
4. That review finds at least 1 High or Medium. 55%.
5. The blind review reproduces a High or Medium. 30%.
6. The runner records a flaky re-run at least once. 35%.
7. #21 reaches agent-done without me stepping in (no /agent, dismiss or retry). 40%.
8. #21 is merged to main on 23 Nov. 60%.
9. The fix covers K3 (late presence) with a test. 45%.
