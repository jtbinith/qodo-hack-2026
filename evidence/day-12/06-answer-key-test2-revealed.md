# Day 12 test 2 answer key (written 24 Nov, before any review). Salt: XVFzlf8ExBex+xPH

## The planted gap
Tree 5cd7afc: #130 (18ba6fb) without `downloadNext = false;   // download mode lasts one batch` in web/saveall.js and without the test "download mode ends after one batch: the tap after it tries the share sheet again". After one share-sheet failure, every later tap downloads and the share sheet is never tried again. Only ticket #72 (Decisions, **After the share sheet fails**) says: "Download mode ends after one download batch: the tap after that tries the share sheet again." My check: #130's original test fails on this tree.

Caught = a finding (any severity, any type) that says download mode never ends / the share sheet is never tried again after a failure / download mode should last one batch.

## Runs
P: fresh ready PR, no link. Q: fresh ready PR, same tree, "Closes #72" + issue URL. Both: one neutral commit, "test PR, do not merge", Day 11 wiki guidelines on, Recall preset.

## Predictions
1. P catches it: no. 75%
2. Q catches it: yes. 45%
3. If Q catches it, that finding cites source_type ticket. 80%
4. Q's Context sources lists F13 · Save all; P's doesn't. 75%
5. Any finding in P or Q cites the ticket for something else. 40%
