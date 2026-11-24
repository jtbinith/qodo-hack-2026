# Day 12 test 3 answer key (written 24 Nov, before any review). Salt: 7rfC8Th1Q/6X40gj

Test 2's control was contaminated: the diff's docs/TESTING.md row said "then the share sheet is tried again", and the no-link PR cited it.

## The planted gap (tree e250735)
#130 (18ba6fb) without `downloadNext = false;   // download mode lasts one batch`, without the test "download mode ends after one batch…", without TESTING.md's "then the share sheet is tried again", and with the cancel test's comment reworded ("after a cancel, the next tap shares all 12"). After one share-sheet failure every later tap downloads. Only ticket #72 (Decisions, **After the share sheet fails**) says: "Download mode ends after one download batch: the tap after that tries the share sheet again." Searched the tree for tried again / share sheet again / one batch / download mode / next tap: only unrelated lines remain (a cancel test, a thrown download tried next time, DOWNLOAD_GAP's comment).

Caught = a finding that says download mode never ends / the share sheet is never tried again after a failure / download mode should last one batch.

## Runs
R: fresh ready PR, no link. S: fresh ready PR, same tree, "Closes #72" + issue URL. One neutral commit each, "Test PR, do not merge", Day 11 wiki guidelines on, Recall preset. Note: Qodo may link earlier PRs (#140, #141 have the same bug).

## Predictions
1. R catches it: no. 60%
2. S catches it: yes. 70%
3. If S catches it, that finding cites source_type ticket. 85%
4. R raises the "videos aren't photos" finding again and S doesn't. 50%
5. R's Context sources lists a linked PR (#140 or #141). 30%
