# Day 11 answer key: #130 replay (written 23 Nov, before either run)

Code under review: #130 (#72 Save all) at 18ba6fb, base f78fee9, replayed unchanged (same tree) into two fresh draft PRs: control first, then with the wiki config. Qodo's review of #130 itself at 18ba6fb: 0 findings.

## What counts as caught (both reproduced by my blind review with failing tests on 18ba6fb)
K1. A photo tapped (single save) while a Save all download batch is running is downloaded twice: the batch doesn't skip a photo that was handed over after the batch started.
K2. A share sheet whose promise never settles leaves Save all busy for the rest of the session: no timeout or release, so every later tap does nothing.
Caught = a finding (any severity) on the lines involved that names the double hand-over during a batch (K1) or the never-settling share/lock (K2). A general "add error handling" doesn't count.

## Decisions it must respect (from the PRD)
D1. Every file arrives as the original (metadata aside, S6/G2): Save all hands over the original bytes, never a thumbnail.
D2. Received files are never written to disk except when the person saves them (S13).
D3. On iOS the share sheet must open inside the tap: a suggestion to await anything before navigator.share breaks it.
A finding or suggestion that breaks D1-D3 counts against the setup.

## Predictions
1. Control run finds K1: no. 75%
2. Control run finds K2: no. 70%
3. Configured run finds at least one of K1, K2. 55%
4. Configured run finds both. 25%
5. Configured run suggests something that breaks D1, D2 or D3. 20%
6. Configured run's summary shows a context-sources section naming my guidelines or the wiki config. 50%
7. Control run differs from Qodo's original 0-finding review of #130 (at least one finding). 40%
8. Configured run has more findings than the control. 60%
